<script lang="ts" setup>
import { computed } from 'vue';
import { formatPercent } from '@/app/format';
import { niceAxis, series } from '@/app/series';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';

const store = useStore();
const { t, locale } = useI18n();

const W = 772;
const H = 280;
const L = 52;
const R = 10;
const TOP = 8;
const B = 26;

const view = computed(() => {
    const e = store.evaluation;
    if (!e.ok) return null;
    const s = series(e.value);
    const axis = niceAxis(s.max);
    const x = (years: number) => L + (years / s.life) * (W - L - R);
    const y = (v: number) => TOP + (1 - v / axis.top) * (H - TOP - B);
    const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(s.t[i]!).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const marks: { y: number; text: string }[] = [];
    for (let v = 0; v <= axis.top + 1e-6; v += axis.step) marks.push({ y: y(v), text: `${Math.round(v / 1000)} ${t('chart.thousand')}` });
    const ticks: { x: number; text: string }[] = [];
    for (let years = 0; years <= s.life; years += s.life > 8 ? 3 : 1) ticks.push({ x: x(years), text: `${years} ${t('unit.yearShort')}` });
    const last = s.t.length - 1;
    return {
        marks,
        ticks,
        deposit: path(s.deposit),
        bond: path(s.bond),
        promise: path(s.promise),
        marker: x(s.horizon),
        dotDeposit: { cx: x(s.horizon), cy: y(e.value.comparison.deposit.finalValue) },
        dotBond: { cx: x(s.horizon), cy: y(e.value.comparison.bond.finalValue) },
        right: x(s.t[last]!),
        bottom: H - B,
        promiseText: t('chart.promise', [formatPercent(e.value.quote.ytm ?? 0, locale.value)]),
    };
});
</script>

<template>
    <div v-if="view" class="chart">
        <div class="legend">
            <span class="deposit">{{ t('chart.deposit') }}</span>
            <span class="bond">{{ t('chart.bond') }}</span>
            <span class="promise">{{ view.promiseText }}</span>
        </div>
        <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" :aria-label="t('node.chart')">
            <g class="axis">
                <g v-for="m in view.marks" :key="m.text">
                    <line :x1="52" :x2="view.right" :y1="m.y" :y2="m.y" />
                    <text :x="46" :y="m.y + 4" text-anchor="end">{{ m.text }}</text>
                </g>
                <text v-for="tick in view.ticks" :key="tick.text" :x="tick.x" :y="view.bottom + 18" text-anchor="middle">{{ tick.text }}</text>
            </g>
            <path :d="view.promise" class="line promise" />
            <path :d="view.deposit" class="line deposit" />
            <path :d="view.bond" class="line bond" />
            <line :x1="view.marker" :x2="view.marker" :y1="8" :y2="view.bottom" class="marker" />
            <circle v-bind="view.dotDeposit" r="5" class="dot deposit" />
            <circle v-bind="view.dotBond" r="5" class="dot bond" />
        </svg>
    </div>
    <div v-else>—</div>
</template>

<style scoped>
.legend {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--tao-color-text-muted, inherit);
    margin-bottom: 2px;
}

.legend span::before {
    content: '';
    display: inline-block;
    width: 14px;
    height: 3px;
    margin-right: 6px;
    vertical-align: middle;
    background: currentColor;
}

.legend .promise::before {
    height: 0;
    border-top: 2px dashed currentColor;
    background: none;
}

.legend .deposit::before {
    background: var(--k-deposit);
}

.legend .bond::before {
    background: var(--k-bond);
}

.axis line {
    stroke: var(--tao-color-border, rgba(127, 127, 127, 0.3));
    stroke-width: 0.5;
}

.axis text {
    font-size: 11px;
    fill: var(--tao-color-text-muted, #888);
}

.line {
    fill: none;
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
}

.line.deposit {
    stroke: var(--k-deposit);
}

.line.bond {
    stroke: var(--k-bond);
}

.line.promise {
    stroke: var(--tao-color-text-muted, #888);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
}

.marker {
    stroke: var(--tao-color-text-muted, #888);
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
}

.dot.deposit {
    fill: var(--k-deposit);
}

.dot.bond {
    fill: var(--k-bond);
}
</style>
