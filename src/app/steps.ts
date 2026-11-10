/**
 * What each node of the chain says, as data: a message key and its numbers. The interface formats the numbers and translates.
 * Что говорит каждая нода цепочки, данными: ключ сообщения и числа. Числа форматирует и переводит интерфейс.
 */
import type { MessageKey } from '@/i18n';
import { exchangeAt } from '@/core/currency';
import { isFlat, shiftAt } from '@/core/rates';
import type { Evaluated } from './model';

/** A number with its meaning, so that the interface knows how to print it. / Число со смыслом: интерфейс знает, как его печатать. */
export type Value =
    | { kind: 'money'; value: number }
    | { kind: 'percent'; value: number; digits?: number }
    | { kind: 'years'; value: number }
    | { kind: 'count'; value: number }
    | { kind: 'number'; value: number; digits?: number }
    | { kind: 'text'; value: string }
    | { kind: 'cap'; value: 'end' | 'daily' | 'monthly' | 'quarterly' | 'yearly' };

export interface Say {
    key: MessageKey;
    args: Value[];
}

export interface Step {
    title: MessageKey;
    headline: Say;
    lines: Say[];
}

const money = (value: number): Value => ({ kind: 'money', value });
const percent = (value: number, digits?: number): Value => (digits === undefined ? { kind: 'percent', value } : { kind: 'percent', value, digits });
const count = (value: number): Value => ({ kind: 'count', value });
const number = (value: number, digits = 2): Value => ({ kind: 'number', value, digits });
const text = (value: string): Value => ({ kind: 'text', value });
const say = (key: MessageKey, ...args: Value[]): Say => ({ key, args });

export type StepId = 'accrual' | 'compound' | 'depositResult' | 'purchase' | 'coupons' | 'exit' | 'bondResult';

export function depositSteps(e: Evaluated): Record<'accrual' | 'compound' | 'depositResult', Step> {
    const run = e.comparison.deposit;
    const path = e.scenario.path ?? [];
    const cap = { kind: 'cap', value: e.deposit.capitalization } as const;
    const ex = e.deposit.exchange;
    const atHorizon = Math.max(e.deposit.rate + shiftAt(path, run.horizon), 0);
    return {
        accrual: {
            title: 'node.accrual',
            headline: say('step.accrual.headline', count(run.capitalizations)),
            lines: [
                isFlat(path) ? say('step.accrual.rate', percent(e.deposit.rate), cap) : say('step.accrual.rateMoves', percent(e.deposit.rate), percent(atHorizon), cap),
                say('step.accrual.effective', percent(run.effectiveRate)),
                ex
                    ? say('step.accrual.fx', money(e.deposit.amount), number(e.deposit.amount / ex.rate0), text(e.currency), number(ex.rate0))
                    : say('step.accrual.held', { kind: 'years', value: run.horizon }),
            ],
        },
        compound: {
            title: 'node.compound',
            headline: say('step.compound.headline', money(run.compoundExtra)),
            lines: [
                say('step.compound.simple', money(run.simpleProfit)),
                say('step.compound.profit', money(run.simpleProfit + run.compoundExtra)),
                run.tax > 0 ? say('step.compound.tax', money(run.tax)) : say('step.compound.hint'),
            ],
        },
        depositResult: {
            title: 'node.depositResult',
            headline: say('step.depositResult.headline', money(run.finalValue)),
            lines: [
                say('step.depositResult.profit', money(run.profit)),
                say('step.depositResult.cagr', percent(run.cagr)),
                ...(run.tax > 0 ? [say('step.depositResult.tax', money(run.tax))] : []),
                ...(ex ? [say('step.depositResult.fx', number(ex.rate0), number(exchangeAt(ex, run.horizon)), money(run.fxGain))] : []),
            ],
        },
    };
}

export function bondSteps(e: Evaluated): Record<'purchase' | 'coupons' | 'exit' | 'bondResult', Step> {
    const run = e.comparison.bond;
    const rate = e.scenario.reinvestRate;
    return {
        purchase: {
            title: 'node.purchase',
            headline: say('step.purchase.headline', count(run.pieces)),
            lines: [
                say('step.purchase.price', money(run.cleanPrice), money(run.accrued), money(run.dirtyPrice)),
                say('step.purchase.paid', money(run.spent), money(run.leftover)),
                say('step.purchase.yields', percent(e.quote.ytm ?? 0), percent(e.quote.currentYield)),
                ...(run.buyCommission > 0 ? [say('step.purchase.commission', money(run.buyCommission))] : []),
            ],
        },
        coupons: {
            title: 'node.coupons',
            headline: say('step.coupons.headline', count(run.paymentsReceived)),
            lines: [
                say('step.coupons.received', money(run.couponsSum)),
                say('step.coupons.each', money(e.bond.couponRub)),
                rate === 'deposit'
                    ? say('step.coupons.reinvestedDeposit', money(run.reinvestGain))
                    : rate > 0
                      ? say('step.coupons.reinvested', percent(rate), money(run.reinvestGain))
                      : say('step.coupons.idle'),
            ],
        },
        exit: run.atMaturity
            ? {
                  title: 'node.exitMaturity',
                  headline: say('step.exitMaturity.headline', money(run.exitValue)),
                  lines: [say('step.exitMaturity.face', money(e.bond.nominal)), say('step.exitMaturity.done')],
              }
            : {
                  title: 'node.exitSale',
                  headline: say('step.exitSale.headline', money(run.exitValue)),
                  lines: [
                      say('step.exitSale.market', percent(run.marketYield, 2)),
                      say('step.exitSale.price', money(run.pieces > 0 ? (run.exitValue + run.sellCommission) / run.pieces : 0)),
                      ...(run.sellCommission > 0 ? [say('step.exitSale.commission', money(run.sellCommission))] : []),
                  ],
              },
        bondResult: {
            title: 'node.bondResult',
            headline: say('step.bondResult.headline', money(run.finalValue)),
            lines: [
                run.taxPaid > 0 ? say('step.bondResult.profitTax', money(run.profit), money(run.taxPaid)) : say('step.bondResult.profit', money(run.profit)),
                say('step.bondResult.cagr', percent(run.cagr)),
                say('step.bondResult.promise', percent(e.quote.ytm ?? 0)),
            ],
        },
    };
}
