# kupona

<p align="center">
  <img src="docs/media/chain-dark.png" alt="Dark theme, Russian: the deposit on the left, the bond on the right, the curve of falling rates in the middle, the chain of stages grown from each, the comparison and the value-over-time chart at the bottom" width="420">
  <img src="docs/media/chain-light.png" alt="Light theme, English: the same chain" width="420">
</p>

**English** · [Русский](README.ru.md)

Bond or deposit? Put them side by side and see what you end up with, step by step. A yield on a bond is one number, what lands in your account at the end is another, and it depends on what you do with the coupons and where the market goes. A few base figures go into a node, you press "Calculate", and a chain of nodes grows from it, each showing one stage: purchase, coupons, interest on interest, sale or maturity, the result. The deposit is on the left, the bond on the right, the comparison and a chart at the bottom.

**Stack:** Vue 3 + TypeScript + Vite, UI on [TaoUI](https://www.npmjs.com/package/@1337exp/taoui), canvas and links from [TaoUX](https://www.npmjs.com/package/@1337exp/taoux). Tests: Vitest.

```bash
npm install
npm run dev         # dev server
npm run build       # type check and build
npm test            # tests
npm run typecheck
npm run screenshot  # docs/media/*.png for the README, needs Chrome or Edge
```

## What it does

Three nodes you type into: **Deposit** (rate, how interest is added, term, tax on the interest, currency), **Scenario** (the amount, how long you hold, where coupons go, where the market goes after the purchase) and **Bond** (a ticker to find it on the exchange, price, coupon, payments a year, nominal, the two dates, broker commission, tax on the profit). Commission and taxes are 0 until you set them; each side has its own tax rate, because the rules for deposits and bonds differ. The page opens with the OFZ 26248 example.

**A bond from the exchange.** Type a ticker, an ISIN or a part of the name in the Bond node and press "Find": the price, the coupon, the nominal, the payments a year and the maturity come from the Moscow Exchange (the public ISS service, asked straight from your browser; nothing goes through a server of ours, and what you typed goes to the exchange as a search). The price is the last deal, or the day before's when there were none yet; the settlement day is the next working day (weekends are skipped, the holidays of the exchange are not known: the date can be changed). Commission and tax stay as you set them. The calculator does a fixed coupon in roubles with the nominal paid at the end, so a floating or amortizing bond, one in a currency, or one with a coupon period of its own is turned down with the reason, and the fields stay as they were.

**Currency.** The deposit can be in USD, EUR or CNY. The roubles are changed at the rate you give (a figure of yours, not a quote), the interest is earned in the currency, and at the end the balance is changed back at the rate of that day, which moves by the share a year you set. The nodes say what the roubles became and what the exchange gave or took. Coupons into deposits and the market on the curve exist only beside a rouble deposit: they tie the bond to the rouble deposit rate.

**Rates.** A fourth node, the curve of the deposit rate over the years, grows in the middle after the first calculation. Drag its points (double click adds one, Alt+click removes it), or take a ready shape: as now, falling, rising. The deposit is renewed at the rate of the day. In the Scenario, coupons can go into deposits (they earn the rate of the day) and the market after the purchase can follow the curve: the yield of the bond moves by the same points, so the price at the sale moves too. This is the part that answers "what if rates fall": a deposit cannot keep its rate, a bond has locked its coupons in.

"Calculate" grows the chain level by level, the camera following it. After that everything is live: change a field or drag the holding-period slider and every node recounts.

| Node | What it says |
|---|---|
| Rates | the curve of the deposit rate; where it stands at the horizon |
| Accruals | how many times interest was added, the effective rate of the deposit, where the rate ends if it moves; for a currency, what the roubles became |
| Interest on interest | how much of the profit is plain interest and how much is interest on interest |
| Purchase | pieces bought, clean price + accrued interest, yield to maturity, current yield, the commission |
| Coupons | payments received, and whether they lie idle or earn something |
| Sale / Maturity | what the bond brings at the horizon, at the market yield you set (less the commission of the sale) |
| Results, Comparison | final sums, who is ahead and by how much, the deposit rate that ties |
| Value over time | the deposit, the bond (price + coupons + what they earned) and the line the yield "promises" |

Nodes can be dragged, the canvas panned and zoomed. Russian and English, light and dark theme; inputs are remembered in the browser.

## The calculation core

`src/core`, no DOM. Rates are fractions (`0.1225` is 12.25%), time is in years from the purchase (act/365).

- **Bond** (`bond.ts`): coupon schedule counted back from maturity in fixed periods (OFZ: 182 days), accrued interest, yield to maturity, current yield, durations, the value of the payments still ahead at any yield (the price when you sell early), and the value of the payments already received if each is reinvested at a given rate.
- **Deposit** (`deposit.ts`): nominal rate, capitalization (end of term, daily, monthly, quarterly, yearly), term; the balance is renewed term after term, each renewal at the rate of that day.
- **Currency** (`currency.ts`, and `exchange` of a deposit): the roubles put in are changed at today's rate, the deposit grows in the currency, the balance is changed back at the rate of the day (it changes by a fixed share a year, compounded). The profit splits into plain interest, interest on interest, the tax and what the exchange gave.
- **Rates** (`rates.ts`): a path of shifts against today's rates; money that earns `base + shift` moment by moment, never below zero. Without a path nothing moves and the numbers are the plain ones.
- **Costs** (`tax.ts`, and the options of `compare.ts`): broker commission on the purchase and on a sale before maturity (the bond is paid off at maturity without one), and a tax on the profit: a share of what was earned above the money put in, paid at the end, nothing on a loss. Charts and "value at a moment" are shown after the tax and the commission of closing right then.
- **Comparison** (`compare.ts`): the same money and horizon on both sides, one scenario, the difference, and the deposit rate at which it ties with the bond.

Checked against a real quote: OFZ 26248 on smart-lab.ru (`src/core/presets.ts`): accrued interest 54.03 ₽, yield 16.66%, current yield 15.43%, duration within two days. The page's "years to maturity" (13.56) is two weeks behind its own price: counted from the settlement date it is 13.52.

The point of the whole thing, in numbers from that example: the 16.66% only comes true if every coupon is reinvested at 16.66%. With coupons lying idle the same bond gives about 9% a year; with coupons put at 14% about 15.2%.

Assumptions: the tax on a currency deposit is on the interest in the currency, a change of the rate is not taxed; the bank's buy and sell rates differ in life, here there is one rate; the tax is one share of the whole profit at the end (no timing, tax-free amounts or offsets), the commission is a share of the sum of each trade, whole bonds only (the change lies idle), a deposit keeps its rate for the term and a tail shorter than a term earns the rate of the last renewal, the whole price is discounted at one yield of the day (a flat curve, as for a quote on the screen), the bond's yield moves in parallel with the deposit rate (the spread stays).

## How it is built

```
src/
  core/    bond, deposit, comparison, dates, bisection, presets: no Vue, no DOM
  app/     what is typed (percent, empty fields) and how it reaches the core, the text of every
           step as data, chart lines, the shape of the chain, the exchange (moex.ts), the store: no DOM except the store
  ui/      node views and the node bodies
  i18n/    ru and en
scripts/   screenshots for the README
tests/     core: exchange page numbers, hand-computed cases, invariants; tests/app: the app layer; tests/fixtures: real answers of the exchange
```

The chain is built for you, so the canvas has no pins to drag. The panels sit beside the canvas, not inside it: the canvas captures the pointer and would swallow the clicks.

Tests were checked by breaking the code on purpose (227 mutants: 226 caught, one changes nothing a user could see): `node E:\job\base\snippets\mutate.mjs`.

## Not yet

The exchange rate as a curve, bonds in a currency, the bank's spread. Bonds with floating or amortizing coupons. A coupon schedule that is not regular. Saving node positions, undo, a file to save and open. Touch use is not checked on a real device.

## License

[MIT](LICENSE)

## Us

Homepage: [666.io](https://666.io). If you want to help, suggest an idea or just talk, come by.
