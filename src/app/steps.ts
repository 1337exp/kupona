/**
 * What each node of the chain says, as data: a message key and its numbers. The interface formats the numbers and translates.
 * Что говорит каждая нода цепочки, данными: ключ сообщения и числа. Числа форматирует и переводит интерфейс.
 */
import type { MessageKey } from '@/i18n';
import type { Evaluated } from './model';

/** A number with its meaning, so that the interface knows how to print it. / Число со смыслом: интерфейс знает, как его печатать. */
export type Value =
    | { kind: 'money'; value: number }
    | { kind: 'percent'; value: number; digits?: number }
    | { kind: 'years'; value: number }
    | { kind: 'count'; value: number }
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
const say = (key: MessageKey, ...args: Value[]): Say => ({ key, args });

export type StepId = 'accrual' | 'compound' | 'depositResult' | 'purchase' | 'coupons' | 'exit' | 'bondResult';

export function depositSteps(e: Evaluated): Record<'accrual' | 'compound' | 'depositResult', Step> {
    const run = e.comparison.deposit;
    return {
        accrual: {
            title: 'node.accrual',
            headline: say('step.accrual.headline', count(run.capitalizations)),
            lines: [
                say('step.accrual.rate', percent(e.deposit.rate), { kind: 'cap', value: e.deposit.capitalization }),
                say('step.accrual.effective', percent(run.effectiveRate)),
                say('step.accrual.held', { kind: 'years', value: run.horizon }),
            ],
        },
        compound: {
            title: 'node.compound',
            headline: say('step.compound.headline', money(run.compoundExtra)),
            lines: [say('step.compound.simple', money(run.simpleProfit)), say('step.compound.profit', money(run.profit)), say('step.compound.hint')],
        },
        depositResult: {
            title: 'node.depositResult',
            headline: say('step.depositResult.headline', money(run.finalValue)),
            lines: [say('step.depositResult.profit', money(run.profit)), say('step.depositResult.cagr', percent(run.cagr))],
        },
    };
}

export function bondSteps(e: Evaluated): Record<'purchase' | 'coupons' | 'exit' | 'bondResult', Step> {
    const run = e.comparison.bond;
    const reinvest = e.scenario.reinvestRate;
    return {
        purchase: {
            title: 'node.purchase',
            headline: say('step.purchase.headline', count(run.pieces)),
            lines: [
                say('step.purchase.price', money(run.cleanPrice), money(run.accrued), money(run.dirtyPrice)),
                say('step.purchase.paid', money(run.spent), money(run.leftover)),
                say('step.purchase.yields', percent(e.quote.ytm ?? 0), percent(e.quote.currentYield)),
            ],
        },
        coupons: {
            title: 'node.coupons',
            headline: say('step.coupons.headline', count(run.paymentsReceived)),
            lines: [
                say('step.coupons.received', money(run.couponsSum)),
                say('step.coupons.each', money(e.bond.couponRub)),
                reinvest > 0 ? say('step.coupons.reinvested', percent(reinvest), money(run.reinvestGain)) : say('step.coupons.idle'),
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
                      say('step.exitSale.price', money(run.pieces > 0 ? run.exitValue / run.pieces : 0)),
                  ],
              },
        bondResult: {
            title: 'node.bondResult',
            headline: say('step.bondResult.headline', money(run.finalValue)),
            lines: [
                say('step.bondResult.profit', money(run.profit)),
                say('step.bondResult.cagr', percent(run.cagr)),
                say('step.bondResult.promise', percent(e.quote.ytm ?? 0)),
            ],
        },
    };
}
