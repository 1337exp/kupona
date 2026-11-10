<script lang="ts" setup>
import { computed } from 'vue';
import { TaoInputNumber, TaoSelect } from '@1337exp/taoui';
import { useStore } from '@/app/store';
import { CURRENCIES, type Currency } from '@/app/model';
import { CAPITALIZATIONS } from '@/core/deposit';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

const store = useStore();
const { t } = useI18n();
const d = store.inputs.deposit;
const problems = computed(() => store.problems);
const currencies = CURRENCIES.map((c) => ({ value: c, label: c }));
const foreign = computed(() => d.currency !== 'RUB');
/** The usual rate of a deposit in roubles and in a currency, to swap when the currency changes and the rate was never touched. / Обычная ставка рублёвого и валютного вклада: меняется вместе с валютой, если ставку не трогали. */
const USUAL: Record<'rub' | 'fx', number> = { rub: 14, fx: 3 };
const currency = computed<Currency>({
    get: () => d.currency,
    set: (next) => {
        const was = d.currency;
        d.currency = next;
        if (next !== 'RUB') {
            // Coupons into deposits and the market on the curve have no sense beside a foreign deposit. / Рядом с валютным вкладом они не имеют смысла.
            store.inputs.scenario.reinvestFollows = false;
            store.inputs.scenario.marketFollowsCurve = false;
            store.inputs.scenario.reinvestPercent ??= 0;
        }
        if (was === 'RUB' && next !== 'RUB' && d.ratePercent === USUAL.rub) d.ratePercent = USUAL.fx;
        if (was !== 'RUB' && next === 'RUB' && d.ratePercent === USUAL.fx) d.ratePercent = USUAL.rub;
    },
});
const options = computed(() => CAPITALIZATIONS.map((c) => ({ value: c, label: t(`cap.${c}`) })));
</script>

<template>
    <div class="grid">
        <Field :label="t('field.rate')" :error="problems.includes('rate')">
            <TaoInputNumber v-model="d.ratePercent" :min="0" :step="0.5" :controls="false" />
        </Field>
        <Field :label="t('field.term')" :error="problems.includes('term')">
            <TaoInputNumber v-model="d.termMonths" :min="1" :step="1" :precision="0" :controls="false" />
        </Field>
        <Field class="wide" :label="t('field.capitalization')">
            <TaoSelect v-model="d.capitalization" :options="options" :clearable="false" />
        </Field>
        <Field :label="t('field.depositTax')" :error="problems.includes('tax')">
            <TaoInputNumber v-model="d.taxPercent" :min="0" :max="100" :step="1" :controls="false" />
        </Field>
        <Field :label="t('field.currency')">
            <TaoSelect v-model="currency" :options="currencies" :clearable="false" />
        </Field>
        <template v-if="foreign">
            <Field :label="t('field.fxRate')" :error="problems.includes('fx')">
                <TaoInputNumber v-model="d.fxRate" :min="0" :step="1" :precision="2" :controls="false" />
            </Field>
            <Field :label="t('field.fxChange')" :error="problems.includes('fxChange')">
                <TaoInputNumber v-model="d.fxChangePercent" :step="1" :controls="false" />
            </Field>
        </template>
        <p class="hint wide">{{ foreign ? t('hint.fx') : t('hint.deposit') }}</p>
    </div>
</template>

<style scoped>
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
}

.wide {
    grid-column: 1 / -1;
}

.hint {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tao-color-text-muted, inherit);
}
</style>
