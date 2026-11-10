<script lang="ts" setup>
import { computed } from 'vue';
import { TaoButton, TaoDate, TaoInputNumber, TaoSelect } from '@1337exp/taoui';
import { PAYMENTS_PER_YEAR } from '@/app/model';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

const store = useStore();
const { t } = useI18n();
const b = store.inputs.bond;
const bad = (...codes: string[]) => codes.some((c) => (store.problems as string[]).includes(c));
const perYear = computed(() => PAYMENTS_PER_YEAR.map((n) => ({ value: n, label: String(n) })));
</script>

<template>
    <div class="grid">
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
        <p class="hint wide">{{ t('hint.bond') }}</p>
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

.hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tao-color-text-muted, inherit);
}
</style>
