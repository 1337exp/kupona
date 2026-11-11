<script lang="ts" setup>
import { computed } from 'vue';
import { TaoButton, TaoDate, TaoInput, TaoInputNumber, TaoSelect } from '@1337exp/taoui';
import { PAYMENTS_PER_YEAR } from '@/app/model';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

const store = useStore();
const { t } = useI18n();
const b = store.inputs.bond;
const bad = (...codes: string[]) => codes.some((c) => (store.problems as string[]).includes(c));
const perYear = computed(() => PAYMENTS_PER_YEAR.map((n) => ({ value: n, label: String(n) })));

const loading = computed(() => store.lookup.state === 'loading');
const failed = computed(() => store.lookup.state === 'failed');
const CANDIDATES_SHOWN = 3;

/** The line under the ticker: what the exchange said, or the hint while nobody has asked. / Строка под тикером: что сказала биржа или подсказка, пока никто не спрашивал. */
const status = computed(() => {
    const l = store.lookup;
    if (l.state === 'loading') return t('moex.loading');
    if (l.state === 'ok') return t('moex.ok', [l.found.name, t(`moex.${l.found.priceSource}`)]);
    if (l.state === 'failed') {
        if (l.reason === 'ambiguous' && l.candidates) return t('moex.candidates', [l.candidates.slice(0, CANDIDATES_SHOWN).join(', ')]);
        return t(`moex.fail.${l.reason}`);
    }
    return t('hint.bond');
});
</script>

<template>
    <div class="grid">
        <div class="find wide">
            <TaoInput v-model="b.ticker" :placeholder="t('field.ticker')" :error="failed" :aria-label="t('field.ticker')" @update:model-value="store.forgetLookup()" @keydown.enter="store.findBond()" />
            <TaoButton size="small" :loading="loading" @click="store.findBond()">{{ t('moex.find') }}</TaoButton>
        </div>
        <Field :label="t('field.price')" :error="bad('price')">
            <TaoInputNumber v-model="b.cleanPricePercent" :min="0" :step="0.1" :precision="3" :controls="false" />
        </Field>
        <Field :label="t('field.coupon')" :error="bad('coupon')">
            <TaoInputNumber v-model="b.couponRub" :min="0" :step="1" :precision="2" :controls="false" />
        </Field>
        <Field :label="t('field.nominal')" :error="bad('nominal')">
            <TaoInputNumber v-model="b.nominal" :min="1" :step="100" :precision="0" :controls="false" />
        </Field>
        <Field :label="t('field.perYear')" :error="bad('period')">
            <TaoSelect v-model="b.paymentsPerYear" :options="perYear" :clearable="false" />
        </Field>
        <Field :label="t('field.buyDate')" :error="bad('date', 'matured')">
            <TaoDate v-model="b.buyDate" editable />
        </Field>
        <Field :label="t('field.maturity')" :error="bad('date', 'matured')">
            <TaoDate v-model="b.maturity" editable />
        </Field>
        <Field :label="t('field.commission')" :error="bad('commission')">
            <TaoInputNumber v-model="b.commissionPercent" :min="0" :max="50" :step="0.05" :controls="false" />
        </Field>
        <Field :label="t('field.bondTax')" :error="bad('tax')">
            <TaoInputNumber v-model="b.taxPercent" :min="0" :max="100" :step="1" :controls="false" />
        </Field>
        <p class="hint wide" :class="{ bad: failed }" aria-live="polite">{{ status }}</p>
        <TaoButton class="wide" variant="ghost" tone="neutral" size="small" @click="store.loadExample()">{{ t('app.example') }}</TaoButton>
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

.find {
    display: flex;
    gap: 8px;
    align-items: center;
}

.hint.bad {
    color: var(--tao-color-danger, #e5484d);
}

.hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tao-color-text-muted, inherit);
}
</style>
