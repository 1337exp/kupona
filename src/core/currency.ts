/**
 * A foreign currency in roubles. The rate changes by a fixed share a year, compounded; a bank's buy and sell spread and any tax
 * on the exchange are not modelled.
 * Иностранная валюта в рублях. Курс меняется на одну и ту же долю в год, со сложением; разница курсов покупки и продажи в банке и
 * налог на обмен не учитываются.
 */
export interface Exchange {
    /** Roubles for one unit of the currency on the day of the purchase. / Рублей за единицу валюты в день покупки. */
    rate0: number;
    /** How much the rate changes in a year, a fraction (0.08: the rouble weakens 8% a year, -0.05: it gets stronger). / Насколько меняется курс за год, доля. */
    yearlyChange: number;
}

/** The rate after `years`. / Курс через `years` лет. */
export const exchangeAt = (ex: Exchange, years: number): number => ex.rate0 * (1 + ex.yearlyChange) ** years;
