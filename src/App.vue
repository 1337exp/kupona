<script lang="ts" setup>
// Placeholder shell: proves the core runs in the browser. The node canvas comes next.
// Временная оболочка: показывает, что ядро работает в браузере. Холст нод дальше.
import { compare } from '@/core/compare';
import { bondQuote } from '@/core/bond';
import { OFZ_26248 as OFZ } from '@/core/presets';

const quote = bondQuote(OFZ.bond, OFZ.buy);
const result = compare({ amount: 100_000, rate: 0.14, capitalization: 'monthly', termMonths: 12 }, OFZ.bond, OFZ.buy, {
    horizonYears: 99,
    reinvestRate: 0.12,
    marketYield: null,
});

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const pct = (n: number | null, digits = 2) => (n === null ? '—' : `${(n * 100).toFixed(digits).replace('.', ',')}%`);

const rows: [string, string][] = [
    ['Цена (чистая) и НКД', `${quote.cleanPrice.toFixed(2)} + ${quote.accrued.toFixed(2)} ₽`],
    ['Доходность к погашению', pct(quote.ytm)],
    ['Текущая доходность', pct(quote.currentYield)],
    ['Лет до погашения', quote.years.toFixed(2).replace('.', ',')],
    ['100 000 ₽ в облигацию, купоны под 12%, до погашения', money(result.bond.finalValue)],
    ['100 000 ₽ во вклад 14% с капитализацией, столько же лет', money(result.deposit.finalValue)],
    ['Вклад сравняется с облигацией при ставке', pct(result.breakEvenRate)],
];
</script>

<template>
    <main class="shell">
        <h1>kupona</h1>
        <p class="hint">{{ OFZ.name }} ({{ OFZ.ticker }}): ядро расчёта. Холст с нодами будет следующим шагом.</p>
        <dl>
            <template v-for="[name, value] in rows" :key="name">
                <dt>{{ name }}</dt>
                <dd>{{ value }}</dd>
            </template>
        </dl>
    </main>
</template>

<style scoped>
.shell {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 16px;
}

.hint {
    color: var(--tao-color-text-muted, #999);
}

dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 24px;
}

dt {
    color: var(--tao-color-text-muted, #999);
}

dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    text-align: right;
}
</style>
