<script lang="ts" setup>
import { computed } from 'vue';
import { TaoInputNumber, TaoSlider, TaoSwitch } from '@1337exp/taoui';
import { formatYears } from '@/app/format';
import { lifeYears } from '@/app/model';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

const store = useStore();
const { t, locale } = useI18n();
const s = store.inputs.scenario;

const life = computed(() => lifeYears(store.inputs) ?? 13);
const sliderMax = computed(() => Math.ceil(life.value * 4) / 4);
const horizonText = computed(() => (s.horizonYears >= life.value ? `${formatYears(life.value, locale.value)} · ${t('node.exitMaturity').toLowerCase()}` : formatYears(s.horizonYears, locale.value)));

/** The switch says "the market does not move" = no yield of our own (`null`). / Переключатель «рынок не меняется» = своей доходности нет (`null`). */
const marketSame = computed({
    get: () => s.marketYieldPercent === null,
    set: (same: boolean) => {
        s.marketYieldPercent = same ? null : Math.round((store.evaluation.ok ? (store.evaluation.value.quote.ytm ?? 0.15) : 0.15) * 1000) / 10;
    },
});
</script>

<template>
    <div class="grid">
        <Field class="wide" :label="t('field.amount')" :error="store.problems.includes('amount')">
            <TaoInputNumber v-model="s.amount" :min="1" :step="10000" :precision="0" :controls="false" />
        </Field>
        <Field class="wide" :label="`${t('field.horizon')}: ${horizonText}`">
            <TaoSlider v-model="s.horizonYears" :min="0.25" :max="sliderMax" :step="0.25" />
        </Field>
        <Field :label="t('field.reinvest')" :error="store.problems.includes('reinvest')">
            <TaoInputNumber v-model="s.reinvestPercent" :min="0" :step="0.5" :controls="false" />
        </Field>
        <Field :label="t('field.marketYield')" :error="store.problems.includes('marketYield')">
            <TaoInputNumber v-model="s.marketYieldPercent" :step="0.25" :controls="false" :disabled="marketSame" />
        </Field>
        <TaoSwitch v-model="marketSame" class="wide" :label="t('field.marketSame')" size="small" />
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
</style>
