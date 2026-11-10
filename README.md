# kupona

**English** · [Русский](README.ru.md)

Bond or deposit? Put them side by side and see what you end up with, step by step. A yield on a bond is one number, what lands in your account at the end is another, and it depends on what you do with the coupons and where the market goes. The idea: a few base figures go into a node, you press "calculate", and a chain of nodes grows from it, each showing one stage (purchase, coupons, interest on interest, sale or maturity, the result). The deposit sits on the left, the bond on the right.

**Status:** the calculation core is done and tested; the node canvas is the next step (the page now only shows a few numbers from the core).

**Stack:** Vue 3 + TypeScript + Vite, UI on [TaoUI](https://www.npmjs.com/package/@1337exp/taoui), behaviour (canvas, camera, history) from [TaoUX](https://www.npmjs.com/package/@1337exp/taoux). Tests: Vitest.

```bash
npm install
npm run dev        # dev server
npm run build      # type check and build
npm test           # tests
npm run typecheck
```

## What the core does

`src/core`, no DOM. Rates are fractions (`0.1225` is 12.25%), time is in years from the purchase (act/365).

- **Bond** (`bond.ts`): coupon schedule counted back from maturity in fixed periods (OFZ: 182 days), accrued interest, yield to maturity, current yield, durations, the value of the payments still ahead at any yield (the price when you sell early), and the value of the payments already received if each is reinvested at a given rate.
- **Deposit** (`deposit.ts`): nominal rate, capitalization (end of term, daily, monthly, quarterly, yearly), term; the balance is renewed term after term. Shows how much of the profit is interest on interest.
- **Comparison** (`compare.ts`): the same money and horizon on both sides, one scenario (how long we hold, where coupons go, the market yield after the purchase), the difference, and the deposit rate at which the deposit ties with the bond.

Checked against a real quote: OFZ 26248 on smart-lab.ru (`src/core/presets.ts`): accrued interest 54.03 ₽, yield 16.66%, current yield 15.43%, duration within two days.

The point of the whole thing, in numbers from that example: the 16.66% only comes true if every coupon is reinvested at 16.66%. With coupons lying idle the same bond gives about 9% a year; with coupons put at 14% about 15.2%.

## How it is built

```
src/
  core/    bond, deposit, comparison, dates, bisection, presets: no Vue, no DOM
  App.vue  placeholder page
tests/     core: reference numbers from the exchange page, hand-computed cases, invariants
```

Tests were checked by breaking the code on purpose (31 mutants, all caught): `node E:\job\base\snippets\mutate.mjs`.

## Not yet

The node canvas and the "calculate" animation, a time slider, RU/EN interface, light and dark theme switch. Taxes and broker commission. Deposits in another currency (needs a rate of exchange). Bonds with floating or amortizing coupons. Loading a bond by ticker.

## License

[MIT](LICENSE)

## Us

Homepage: [666.io](https://666.io). If you want to help, suggest an idea or just talk, come by.
