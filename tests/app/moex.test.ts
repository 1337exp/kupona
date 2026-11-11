import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Fetcher, type FoundBond, type LookupState, applyFound, createFinder, localToday, lookupBond, paymentsFromPeriod, read } from '@/app/moex';
import { defaultInputs } from '@/app/model';

// The answers are real ones, recorded from iss.moex.com on 2026-11-11; `TODAY` is the day they were taken.
// Ответы настоящие, записаны с iss.moex.com 2026-11-11; `TODAY` это день записи.
const TODAY = '2026-11-11';
const fixture = (name: string): any => JSON.parse(readFileSync(new URL(`../fixtures/moex/${name}.json`, import.meta.url), 'utf8'));

const table = (columns: string[], ...rows: unknown[][]) => ({ columns, data: rows });
const board = (over: Record<string, unknown> = {}, last: number | null = 79.201) => {
    const row = { SECID: 'SU26248RMFS3', SHORTNAME: 'ОФЗ 26248', FACEVALUE: 1000, FACEUNIT: 'SUR', COUPONPERIOD: 182, MATDATE: '2040-05-16', PREVPRICE: 79.376, ...over };
    const cols = Object.keys(row);
    return {
        securities: table(cols, cols.map((c) => (row as Record<string, unknown>)[c])),
        marketdata: table(['SECID', 'LAST'], ['SU26248RMFS3', last]),
    };
};
const schedule = (coupons: [string, number | null][], amortizations: [string, number, string][] = [['2040-05-16', 1000, 'maturity']]) => ({
    coupons: table(['coupondate', 'value'], ...coupons),
    amortizations: table(['amortdate', 'value', 'data_source'], ...amortizations),
});
const search = (...rows: [string, string, string, number, string, string][]) =>
    ({ securities: table(['secid', 'shortname', 'isin', 'is_traded', 'primary_boardid', 'group'], ...rows) });

/** A stand-in for `fetch`: the search, the board and the schedule are told apart by the address. / Замена `fetch`: поиск, доска и график различаются по адресу. */
function exchange(answers: { search: unknown; board: unknown; schedule: unknown }, seen: { url: string; signal?: AbortSignal }[] = []): Fetcher {
    return async (url, init) => {
        seen.push({ url, signal: init?.signal });
        const body = url.includes('/bondization.json') ? answers.schedule : url.includes('/boards/') ? answers.board : answers.search;
        return { ok: true, json: async () => body };
    };
}

const real = () => ({ search: fixture('search-26248'), board: fixture('board-26248'), schedule: fixture('schedule-26248') });

describe('lookupBond: a real bond', () => {
    it('fills the bond from the answers of the exchange', async () => {
        const r = await lookupBond('SU26248RMFS3', exchange(real()), TODAY);
        expect(r).toEqual({
            ok: true,
            found: {
                secid: 'SU26248RMFS3',
                name: 'ОФЗ 26248',
                nominal: 1000,
                couponRub: 61.08,
                paymentsPerYear: 2,
                maturity: '2040-05-16',
                buyDate: '2026-11-12',
                cleanPricePercent: 79.201,
                priceSource: 'last',
            },
        });
    });

    it('finds it by the ISIN, by a part of the name, in any case, with spaces around', async () => {
        for (const q of ['RU000A108EH4', 'ru000a108eh4', '  su26248rmfs3 ', '26248']) {
            const r = await lookupBond(q, exchange(real()), TODAY);
            expect(r.ok, q).toBe(true);
        }
    });

    it('asks for the search, the board of the bond and its schedule, with what the person typed in the address', async () => {
        const seen: { url: string }[] = [];
        await lookupBond('ОФЗ 26248', exchange(real(), seen), TODAY);
        expect(seen).toHaveLength(3);
        expect(seen[0]!.url).toContain('/securities.json');
        expect(seen[0]!.url).toContain(`q=${encodeURIComponent('ОФЗ 26248')}`);
        expect(seen.some((s) => s.url.includes('/boards/TQOB/securities/SU26248RMFS3.json'))).toBe(true);
        expect(seen.some((s) => s.url.includes('/securities/SU26248RMFS3/bondization.json'))).toBe(true);
    });

    it('hands the abort signal to every request', async () => {
        const seen: { url: string; signal?: AbortSignal }[] = [];
        const controller = new AbortController();
        await lookupBond('26248', exchange(real(), seen), TODAY, controller.signal);
        expect(seen.length).toBe(3);
        for (const s of seen) expect(s.signal).toBe(controller.signal);
    });

    it('settles on the next working day, whatever day it is today', async () => {
        const friday = await lookupBond('26248', exchange(real()), '2026-11-13');
        expect(friday.ok && friday.found.buyDate).toBe('2026-11-16');
    });
});

describe('lookupBond: which bond', () => {
    it('refuses an empty question without asking anybody', async () => {
        const seen: { url: string }[] = [];
        expect(await lookupBond('   ', exchange(real(), seen), TODAY)).toEqual({ ok: false, reason: 'empty' });
        expect(seen).toHaveLength(0);
    });

    it('says nothing is found when the search has no bonds (an index is not a bond)', async () => {
        const index = { securities: table(['secid', 'shortname', 'isin', 'is_traded', 'primary_boardid', 'group'], ['BPSIG', 'Субиндекс ОФЗ', '', 1, 'RTSI', 'stock_index']) };
        expect(await lookupBond('ОФЗ', exchange({ ...real(), search: index }), TODAY)).toEqual({ ok: false, reason: 'notFound' });
        expect(await lookupBond('zzz', exchange({ ...real(), search: { securities: table(['secid', 'group']) } }), TODAY)).toEqual({ ok: false, reason: 'notFound' });
    });

    it('lists the candidates when many bonds fit', async () => {
        const many = search(
            ['SU1', 'ОФЗ 1', 'RU1', 1, 'TQOB', 'stock_bonds'],
            ['SU2', 'ОФЗ 2', 'RU2', 1, 'TQOB', 'stock_bonds'],
            ['SU3', 'ОФЗ 3', 'RU3', 0, 'TQOB', 'stock_bonds'],
        );
        const r = await lookupBond('ОФЗ', exchange({ ...real(), search: many }), TODAY);
        expect(r).toEqual({ ok: false, reason: 'ambiguous', candidates: ['ОФЗ 1', 'ОФЗ 2'] });
    });

    it('lists no more than six candidates', async () => {
        const rows = Array.from({ length: 9 }, (_, i): [string, string, string, number, string, string] => [`SU${i}`, `ОФЗ ${i}`, `RU${i}`, 1, 'TQOB', 'stock_bonds']);
        const r = await lookupBond('ОФЗ', exchange({ ...real(), search: search(...rows) }), TODAY);
        expect(r.ok === false && r.candidates).toHaveLength(6);
    });

    it('takes the exact ticker even if other bonds fit as well', async () => {
        const two = search(['SU1', 'ОФЗ 1', 'RU1', 1, 'TQOB', 'stock_bonds'], ['SU26248RMFS3', 'ОФЗ 26248', 'RU000A108EH4', 1, 'TQOB', 'stock_bonds']);
        const r = await lookupBond('su26248rmfs3', exchange({ ...real(), search: two }), TODAY);
        expect(r.ok).toBe(true);
    });

    it('says a bond is not traded when it is not on the exchange any more', async () => {
        const gone = search(['SU1', 'ОФЗ 1', 'RU1', 0, 'TQOB', 'stock_bonds']);
        expect(await lookupBond('SU1', exchange({ ...real(), search: gone }), TODAY)).toEqual({ ok: false, reason: 'notTraded' });
        expect(await lookupBond('ОФЗ', exchange({ ...real(), search: gone }), TODAY)).toEqual({ ok: false, reason: 'notTraded' });
    });
});

describe('lookupBond: the network', () => {
    it('is a code, not an exception, when the network fails', async () => {
        const down: Fetcher = async () => {
            throw new TypeError('Failed to fetch');
        };
        expect(await lookupBond('26248', down, TODAY)).toEqual({ ok: false, reason: 'network' });
    });

    it('is a network failure when the service answers with an error', async () => {
        const bad: Fetcher = async () => ({ ok: false, json: async () => ({}) });
        expect(await lookupBond('26248', bad, TODAY)).toEqual({ ok: false, reason: 'network' });
    });

    it('is a network failure when the second answer fails after the search', async () => {
        const half: Fetcher = async (url) => (url.includes('/boards/') ? { ok: false, json: async () => ({}) } : exchange(real())(url));
        expect(await lookupBond('26248', half, TODAY)).toEqual({ ok: false, reason: 'network' });
    });

    it('says the answer is not what was expected when it is not JSON or not a table', async () => {
        const html: Fetcher = async () => ({
            ok: true,
            json: async () => {
                throw new SyntaxError('Unexpected token <');
            },
        });
        expect(await lookupBond('26248', html, TODAY)).toEqual({ ok: false, reason: 'shape' });
        for (const body of [null, 5, {}, { securities: { columns: ['x'] } }]) {
            const odd: Fetcher = async () => ({ ok: true, json: async () => body });
            expect(await lookupBond('26248', odd, TODAY), JSON.stringify(body)).toEqual({ ok: false, reason: 'shape' });
        }
    });
});

describe('read: what the calculator can do', () => {
    const coupons = (n: number, value = 61.08): [string, number | null][] => Array.from({ length: n }, (_, i) => [`${2027 + i}-06-02`, value]);
    const run = (b: unknown, s: unknown, today = TODAY) => read('SU26248RMFS3', b, s, today);
    const fail = (r: ReturnType<typeof read>) => (r.ok ? 'ok' : r.reason);

    it('reads the recorded answers', () => {
        const r = run(fixture('board-26248'), fixture('schedule-26248'));
        expect(r.ok && r.found.couponRub).toBe(61.08);
    });

    it('takes the price of the last deal, and the price of the day before when there were no deals', () => {
        const last = run(board({}, 79.2), schedule(coupons(3)));
        expect(last.ok && [last.found.cleanPricePercent, last.found.priceSource]).toEqual([79.2, 'last']);
        const none = run(board({}, null), schedule(coupons(3)));
        expect(none.ok && [none.found.cleanPricePercent, none.found.priceSource]).toEqual([79.376, 'previous']);
    });

    it('has no price when there were no deals and no price of the day before', () => {
        expect(fail(run(board({ PREVPRICE: null }, null), schedule(coupons(3))))).toBe('noPrice');
        expect(fail(run(board({ PREVPRICE: 0 }, 0), schedule(coupons(3))))).toBe('noPrice');
    });

    it('turns down a floating coupon: the exchange knows only the next ones', () => {
        const floater = run(fixture('board-29027'), fixture('schedule-29027'));
        expect(fail(floater)).toBe('varying');
        expect(fail(run(board(), schedule([['2027-06-02', 60], ['2027-12-01', null]])))).toBe('varying');
    });

    it('turns down coupons that differ, but lets the little rounding through', () => {
        expect(fail(run(board(), schedule([['2027-06-02', 60], ['2027-12-01', 50]])))).toBe('varying');
        expect(fail(run(board(), schedule([['2027-06-02', 60], ['2027-12-01', 60.5], ['2028-06-01', 59.6]])))).toBe('ok');
        // 5% is not rounding: the coupon of the next date is a different one.
        expect(fail(run(board(), schedule([['2027-06-02', 60], ['2027-12-01', 57]])))).toBe('varying');
    });

    it('does not mind the coupons that are paid already', () => {
        // 68.13 was the first, longer coupon of the example bond, in 2024.
        const r = run(board(), schedule([['2024-12-04', 68.13], ['2026-06-03', 61.08], ['2026-12-02', 61.08], ['2027-06-02', 61.08]]));
        expect(r.ok && r.found.couponRub).toBe(61.08);
    });

    it('does not count the coupon of today as a coming one', () => {
        const r = run(board(), schedule([[TODAY, 99], ['2027-06-02', 61.08]]));
        expect(r.ok && r.found.couponRub).toBe(61.08);
    });

    it('turns down a bond with no coming coupons at all (a zero coupon)', () => {
        expect(fail(run(board(), schedule([['2024-06-02', 61.08]])))).toBe('varying');
        expect(fail(run(board(), schedule([])))).toBe('varying');
    });

    it('turns down a bond that pays the nominal in parts', () => {
        const parts: [string, number, string][] = [['2030-01-01', 250, 'call'], ['2040-05-16', 750, 'maturity']];
        expect(fail(run(board(), schedule(coupons(3), parts)))).toBe('amortizing');
    });

    it('lets through a part of the nominal that was paid already', () => {
        const past: [string, number, string][] = [['2025-01-01', 250, 'call'], ['2040-05-16', 750, 'maturity']];
        expect(fail(run(board(), schedule(coupons(3), past)))).toBe('ok');
    });

    it('turns down a bond in a foreign currency', () => {
        expect(fail(run(board({ FACEUNIT: 'USD' }), schedule(coupons(3))))).toBe('currency');
    });

    it('says a bond is matured when its date has come', () => {
        expect(fail(run(board({ MATDATE: '2026-11-11' }), schedule(coupons(3))))).toBe('matured');
        expect(fail(run(board({ MATDATE: '2026-11-12' }), schedule(coupons(3))))).toBe('ok');
    });

    it('turns down a coupon period the calculator does not have', () => {
        expect(fail(run(board({ COUPONPERIOD: 130 }), schedule(coupons(3))))).toBe('period');
        expect(fail(run(board({ COUPONPERIOD: null }), schedule(coupons(3))))).toBe('period');
    });

    it('turns down an answer with no date, no nominal or a date that does not exist', () => {
        for (const over of [{ MATDATE: null }, { MATDATE: '2040-02-30' }, { FACEVALUE: null }, { FACEVALUE: 0 }]) {
            expect(fail(run(board(over), schedule(coupons(3)))), JSON.stringify(over)).toBe('shape');
        }
        expect(fail(run({ securities: table(['SECID']) }, schedule(coupons(3))))).toBe('shape');
        expect(fail(run(board(), { coupons: table(['coupondate', 'value']) }))).toBe('shape');
    });

    it('names the bond by its secid when the exchange gave no name', () => {
        const r = run(board({ SHORTNAME: null }), schedule(coupons(3)));
        expect(r.ok && r.found.name).toBe('SU26248RMFS3');
    });
});

describe('paymentsFromPeriod', () => {
    it('knows the usual coupon periods', () => {
        expect(paymentsFromPeriod(182)).toBe(2);
        expect(paymentsFromPeriod(181)).toBe(2);
        expect(paymentsFromPeriod(91)).toBe(4);
        expect(paymentsFromPeriod(30)).toBe(12);
        expect(paymentsFromPeriod(28)).toBe(12);
        expect(paymentsFromPeriod(365)).toBe(1);
        expect(paymentsFromPeriod(366)).toBe(1);
    });

    it('does not guess for a period in between', () => {
        for (const days of [60, 130, 250, 3]) expect(paymentsFromPeriod(days), String(days)).toBeNull();
    });
});

describe('applyFound', () => {
    it('puts the bond into the fields and leaves the costs alone', () => {
        const inputs = defaultInputs();
        inputs.bond.commissionPercent = 0.3;
        inputs.bond.taxPercent = 13;
        inputs.scenario.amount = 12345;
        applyFound(inputs.bond, {
            secid: 'SU1',
            name: 'ОФЗ 1',
            nominal: 100,
            couponRub: 3.5,
            paymentsPerYear: 4,
            maturity: '2031-01-01',
            buyDate: '2026-11-12',
            cleanPricePercent: 91.5,
            priceSource: 'last',
        });
        expect(inputs.bond).toMatchObject({
            ticker: 'SU1',
            nominal: 100,
            couponRub: 3.5,
            paymentsPerYear: 4,
            maturity: '2031-01-01',
            buyDate: '2026-11-12',
            cleanPricePercent: 91.5,
            commissionPercent: 0.3,
            taxPercent: 13,
        });
        expect(inputs.scenario.amount).toBe(12345);
    });
});

describe('createFinder', () => {
    const setup = (fetcher: Fetcher, query = () => 'SU26248RMFS3') => {
        const shown: LookupState[] = [];
        const applied: FoundBond[] = [];
        const find = createFinder({ fetcher, today: () => TODAY, query, apply: (f) => applied.push(f), show: (s) => shown.push(s) });
        return { find, shown, applied };
    };

    it('shows the loading, puts the bond into the fields and shows the bond', async () => {
        const { find, shown, applied } = setup(exchange(real()));
        await find();
        expect(shown.map((s) => s.state)).toEqual(['loading', 'ok']);
        expect(applied).toHaveLength(1);
        expect(applied[0]!.secid).toBe('SU26248RMFS3');
        expect(shown[1]).toEqual({ state: 'ok', found: applied[0] });
    });

    it('shows the reason and changes nothing when the bond does not come', async () => {
        const { find, shown, applied } = setup(exchange({ ...real(), board: board({ FACEUNIT: 'USD' }) }));
        await find();
        expect(applied).toHaveLength(0);
        expect(shown.at(-1)).toEqual({ state: 'failed', reason: 'currency' });
    });

    it('carries the candidates of an ambiguous question', async () => {
        const many = search(['SU1', 'ОФЗ 1', 'RU1', 1, 'TQOB', 'stock_bonds'], ['SU2', 'ОФЗ 2', 'RU2', 1, 'TQOB', 'stock_bonds']);
        const { find, shown } = setup(exchange({ ...real(), search: many }), () => 'ОФЗ');
        await find();
        expect(shown.at(-1)).toEqual({ state: 'failed', reason: 'ambiguous', candidates: ['ОФЗ 1', 'ОФЗ 2'] });
    });

    it('reads the question at the moment of the ask, not before', async () => {
        let typed = '';
        const seen: { url: string }[] = [];
        const { find } = setup(exchange(real(), seen), () => typed);
        typed = '26248';
        await find();
        expect(seen[0]!.url).toContain('q=26248');
    });

    it('cancels the old ask and throws its answer away when a new one starts', async () => {
        const gates: (() => void)[] = [];
        const signals: (AbortSignal | undefined)[] = [];
        const slow: Fetcher = (url, init) => {
            signals.push(init?.signal);
            return new Promise((resolve) => {
                gates.push(() => resolve({ ok: true, json: async () => (url.includes('/bondization.json') ? real().schedule : url.includes('/boards/') ? board({}, 70) : real().search) }));
            });
        };
        const { find, shown, applied } = setup(slow);
        const first = find();
        await Promise.resolve();
        // the new ask is the same question: only its answer counts
        const second = find();
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
        gates[1]!(); // the second search answers first
        await new Promise((r) => setTimeout(r, 0));
        gates[2]!();
        gates[3]!();
        await second;
        gates[0]!(); // the old search answers late, and so do its board and schedule (this stand-in ignores the abort, as a slow network would)
        await new Promise((r) => setTimeout(r, 0));
        gates[4]!();
        gates[5]!();
        await first;
        await new Promise((r) => setTimeout(r, 0));
        expect(applied).toHaveLength(1);
        expect(shown.at(-1)?.state).toBe('ok');
        expect(shown.filter((s) => s.state === 'ok')).toHaveLength(1);
    });
});

describe('localToday', () => {
    it('is the day on the clock of the person, with the zeros', () => {
        expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
        expect(localToday(new Date(2026, 10, 11, 0, 1))).toBe('2026-11-11');
        expect(localToday(new Date(2026, 11, 31, 12))).toBe('2026-12-31');
    });

    it('takes the clock when it is not given', () => {
        expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
