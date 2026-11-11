/**
 * A bond from the Moscow Exchange by its ticker: ask the public ISS service, check the bond is one the calculator can do (a fixed coupon,
 * roubles, the nominal paid at the end), and turn the answer into the fields of the bond node. The network is passed in, so the tests run
 * on recorded answers.
 * Облигация с Мосбиржи по тикеру: спросить открытый сервис ISS, проверить, что облигацию калькулятор умеет (фиксированный купон, рубли,
 * номинал в конце), и превратить ответ в поля ноды облигации. Сеть передаётся снаружи: тесты идут на записанных ответах.
 */
import { DAYS_PER_YEAR, nextWorkday, parseDate } from '@/core/dates';
import type { Inputs } from './model';
import { PAYMENTS_PER_YEAR } from './model';

const ISS = 'https://iss.moex.com/iss';

/** What the page needs from `fetch`; the real one fits. / Что нужно от `fetch`; настоящий подходит. */
export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface FoundBond {
    secid: string;
    name: string;
    nominal: number;
    couponRub: number;
    paymentsPerYear: number;
    maturity: string;
    /** The settlement day: the day after the deal. / День расчётов: день после сделки. */
    buyDate: string;
    cleanPricePercent: number;
    /** `last`: the last deal; `previous`: the price of the day before, when there were no deals yet. / Последняя сделка или цена прошлого дня. */
    priceSource: 'last' | 'previous';
}

/** Why a bond did not come out, as codes for the interface to translate. / Почему облигация не вышла: коды для перевода интерфейсом. */
export type LookupFailure =
    | 'empty'
    | 'notFound'
    | 'ambiguous'
    | 'notTraded'
    | 'network'
    | 'shape'
    | 'noPrice'
    | 'matured'
    | 'currency'
    | 'varying'
    | 'amortizing'
    | 'period';

export type LookupResult = { ok: true; found: FoundBond } | { ok: false; reason: LookupFailure; candidates?: string[] };

type Row = Record<string, unknown>;

/** An ISS table (`{ columns, data }`) as a list of rows by column name; `null` if it is not one. / Таблица ISS списком строк по именам колонок. */
function table(json: unknown, name: string): Row[] | null {
    const t = (json as Record<string, { columns?: unknown; data?: unknown } | undefined> | null)?.[name];
    if (!t || !Array.isArray(t.columns) || !Array.isArray(t.data)) return null;
    const columns = t.columns as string[];
    return (t.data as unknown[][]).map((cells) => Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? null])));
}

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Payments a year from the length of the coupon period in days: the nearest of the ones the calculator knows, or `null`. / Выплат в год по длине купонного периода. */
export function paymentsFromPeriod(periodDays: number): number | null {
    let best: number | null = null;
    let bestGap = Infinity;
    for (const n of PAYMENTS_PER_YEAR) {
        const gap = Math.abs(DAYS_PER_YEAR / n - periodDays);
        if (gap < bestGap) {
            best = n;
            bestGap = gap;
        }
    }
    return best !== null && bestGap <= (DAYS_PER_YEAR / best) * 0.1 ? best : null;
}

const searchUrl = (q: string): string =>
    `${ISS}/securities.json?iss.meta=off&limit=20&securities.columns=secid,shortname,isin,is_traded,primary_boardid,group&q=${encodeURIComponent(q)}`;
const boardUrl = (board: string, secid: string): string =>
    `${ISS}/engines/stock/markets/bonds/boards/${encodeURIComponent(board)}/securities/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=securities,marketdata` +
    '&securities.columns=SECID,SHORTNAME,FACEVALUE,FACEUNIT,COUPONPERIOD,MATDATE,PREVPRICE&marketdata.columns=SECID,LAST';
const scheduleUrl = (secid: string): string =>
    `${ISS}/securities/${encodeURIComponent(secid)}/bondization.json?iss.meta=off&iss.only=coupons,amortizations&limit=100` +
    '&coupons.columns=coupondate,value&amortizations.columns=amortdate,value,data_source';

async function ask(fetcher: Fetcher, url: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(url, signal ? { signal } : undefined);
    if (!response.ok) throw new Error('http');
    return response.json();
}

/**
 * Looks the bond up by a ticker, an ISIN or a part of the name and returns what the bond node needs. Never throws: a failure is a code.
 * Ищет облигацию по тикеру, ISIN или части названия и возвращает то, что нужно ноде облигации. Не бросает: сбой это код.
 */
export async function lookupBond(query: string, fetcher: Fetcher, today: string, signal?: AbortSignal): Promise<LookupResult> {
    const q = query.trim();
    if (!q) return { ok: false, reason: 'empty' };
    try {
        const found = table(await ask(fetcher, searchUrl(q), signal), 'securities');
        if (!found) return { ok: false, reason: 'shape' };
        const bonds = found.filter((r) => r.group === 'stock_bonds');
        if (!bonds.length) return { ok: false, reason: 'notFound' };
        const same = (r: Row): boolean => [r.secid, r.isin].some((v) => typeof v === 'string' && v.toLowerCase() === q.toLowerCase());
        const traded = bonds.filter((r) => r.is_traded === 1);
        const pick = bonds.find(same) ?? (traded.length === 1 ? traded[0] : undefined);
        if (!pick) {
            if (!traded.length) return { ok: false, reason: 'notTraded' };
            return { ok: false, reason: 'ambiguous', candidates: traded.slice(0, 6).map((r) => String(r.shortname ?? r.secid)) };
        }
        if (pick.is_traded !== 1) return { ok: false, reason: 'notTraded' };
        const secid = text(pick.secid);
        const board = text(pick.primary_boardid);
        if (!secid || !board) return { ok: false, reason: 'shape' };

        const [boardJson, scheduleJson] = await Promise.all([ask(fetcher, boardUrl(board, secid), signal), ask(fetcher, scheduleUrl(secid), signal)]);
        return read(secid, boardJson, scheduleJson, today);
    } catch (error) {
        // An abort is the caller's own doing and is not a failure of the network, but there is nobody left to tell either.
        return { ok: false, reason: error instanceof SyntaxError ? 'shape' : 'network' };
    }
}

/** The answers of the exchange to one bond, checked and turned into the fields. Pure. / Ответы биржи по одной облигации, проверенные и превращённые в поля. */
export function read(secid: string, boardJson: unknown, scheduleJson: unknown, today: string): LookupResult {
    const security = table(boardJson, 'securities')?.[0];
    const market = table(boardJson, 'marketdata')?.[0];
    const coupons = table(scheduleJson, 'coupons');
    const amortizations = table(scheduleJson, 'amortizations');
    if (!security || !coupons || !amortizations) return { ok: false, reason: 'shape' };

    const maturity = text(security.MATDATE);
    const nominal = positive(security.FACEVALUE);
    const period = positive(security.COUPONPERIOD);
    if (!maturity || !nominal) return { ok: false, reason: 'shape' };
    try {
        parseDate(maturity);
    } catch {
        return { ok: false, reason: 'shape' };
    }
    if (maturity <= today) return { ok: false, reason: 'matured' };
    if (security.FACEUNIT !== 'SUR') return { ok: false, reason: 'currency' };

    // What is paid before the end other than the coupons: the nominal comes back in parts. / Что платят до конца, кроме купонов: номинал возвращают частями.
    if (amortizations.some((a) => typeof a.amortdate === 'string' && a.amortdate > today && a.amortdate < maturity)) return { ok: false, reason: 'amortizing' };

    const coming = coupons.filter((c) => typeof c.coupondate === 'string' && c.coupondate > today);
    const first = positive(coming[0]?.value);
    // An unknown coupon (a floating one: the exchange has `null` for the ones to come) or coupons that differ: one figure cannot stand for them.
    // Неизвестный купон (плавающий: у биржи для будущих `null`) или разные купоны: одна цифра за них не постоит.
    if (first === null || coming.some((c) => typeof c.value !== 'number' || Math.abs(c.value - first) > first * 0.01)) return { ok: false, reason: 'varying' };

    const paymentsPerYear = period === null ? null : paymentsFromPeriod(period);
    if (paymentsPerYear === null) return { ok: false, reason: 'period' };

    const last = positive(market?.LAST);
    const previous = positive(security.PREVPRICE);
    const price = last ?? previous;
    if (price === null) return { ok: false, reason: 'noPrice' };

    return {
        ok: true,
        found: {
            secid,
            name: text(security.SHORTNAME) ?? secid,
            nominal,
            couponRub: first,
            paymentsPerYear,
            maturity,
            buyDate: nextWorkday(today),
            cleanPricePercent: price,
            priceSource: last !== null ? 'last' : 'previous',
        },
    };
}

/** Puts a found bond into the fields of the bond node; the costs (commission, tax) stay the person's. / Кладёт найденную облигацию в поля; комиссия и налог остаются человеку. */
export function applyFound(bond: Inputs['bond'], found: FoundBond): void {
    bond.ticker = found.secid;
    bond.nominal = found.nominal;
    bond.cleanPricePercent = found.cleanPricePercent;
    bond.couponRub = found.couponRub;
    bond.paymentsPerYear = found.paymentsPerYear;
    bond.buyDate = found.buyDate;
    bond.maturity = found.maturity;
}

/** What the bond node shows under the ticker. / Что нода облигации показывает под тикером. */
export type LookupState =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'ok'; found: FoundBond }
    | { state: 'failed'; reason: LookupFailure; candidates?: string[] };

/** Today as `YYYY-MM-DD` on the clock of the person (the bond is bought on their day, not on the UTC one). / Сегодня по часам человека. */
export function localToday(now: Date = new Date()): string {
    const two = (n: number): string => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/**
 * The "find" button: asks the exchange, puts the bond into the fields when it comes, tells the state. A new ask cancels the old one, and an
 * answer to a cancelled ask is thrown away, so a slow old answer never overwrites a newer one.
 * Кнопка «Найти»: спрашивает биржу, кладёт облигацию в поля, сообщает состояние. Новый вопрос отменяет прежний, а ответ на отменённый
 * выбрасывается: медленный старый ответ не затрёт новый.
 */
export function createFinder(env: {
    fetcher: Fetcher;
    today: () => string;
    query: () => string;
    apply: (found: FoundBond) => void;
    show: (state: LookupState) => void;
}): () => Promise<void> {
    let current: AbortController | null = null;
    return async () => {
        current?.abort();
        const mine = new AbortController();
        current = mine;
        env.show({ state: 'loading' });
        const result = await lookupBond(env.query(), env.fetcher, env.today(), mine.signal);
        if (current !== mine) return;
        current = null;
        if (result.ok) {
            env.apply(result.found);
            env.show({ state: 'ok', found: result.found });
        } else {
            env.show({ state: 'failed', reason: result.reason, ...(result.candidates ? { candidates: result.candidates } : {}) });
        }
    };
}
