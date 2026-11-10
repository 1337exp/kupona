<script lang="ts" setup>
import { computed } from 'vue';
import { TaoInputNumber, TaoSelect } from '@1337exp/taoui';
import { useStore } from '@/app/store';
import { CAPITALIZATIONS } from '@/core/deposit';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

const store = useStore();
const { t } = useI18n();
const d = store.inputs.deposit;
const problems = computed(() => store.problems);
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
        <p class="hint wide">{{ t('hint.deposit') }}</p>
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
