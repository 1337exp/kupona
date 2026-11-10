<script lang="ts" setup>
import { computed } from 'vue';
import { formatMoney, formatPercent } from '@/app/format';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';

const store = useStore();
const { t, locale } = useI18n();

const view = computed(() => {
    const e = store.evaluation;
    if (!e.ok) return null;
    const c = e.value.comparison;
    const diff = Math.abs(c.difference);
    const tie = diff < 0.5;
    return {
        deposit: formatMoney(c.deposit.finalValue, locale.value),
        bond: formatMoney(c.bond.finalValue, locale.value),
        verdict: tie ? t('compare.tie') : t(c.difference > 0 ? 'compare.bondAhead' : 'compare.depositAhead', [formatMoney(diff, locale.value)]),
        winner: tie ? 'none' : c.difference > 0 ? 'bond' : 'deposit',
        breakEven: c.breakEvenRate === null ? t('compare.breakNone') : t('compare.breakEven', [formatPercent(c.breakEvenRate, locale.value)]),
    };
});
</script>

<template>
    <div v-if="view" class="compare">
        <div class="row deposit">
            <span>{{ t('compare.deposit') }}</span>
            <b>{{ view.deposit }}</b>
        </div>
        <div class="row bond">
            <span>{{ t('compare.bond') }}</span>
            <b>{{ view.bond }}</b>
        </div>
        <div class="verdict" :class="view.winner">{{ view.verdict }}</div>
        <div class="break">{{ view.breakEven }}</div>
    </div>
    <div v-else class="compare">—</div>
</template>

<style scoped>
.row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 14px;
    padding: 2px 0;
}

.row b {
    font-variant-numeric: tabular-nums;
    font-size: 17px;
}

.row.deposit b {
    color: var(--k-deposit);
}

.row.bond b {
    color: var(--k-bond);
}

.verdict {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--tao-color-border, rgba(127, 127, 127, 0.3));
    font-size: 17px;
    font-weight: 600;
}

.verdict.bond {
    color: var(--k-bond);
}

.verdict.deposit {
    color: var(--k-deposit);
}

.break {
    margin-top: 4px;
    font-size: 13px;
    color: var(--tao-color-text-muted, inherit);
}
</style>
