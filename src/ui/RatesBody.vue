<script lang="ts" setup>
import { computed, ref } from 'vue';
import { TaoButton } from '@1337exp/taoui';
import { TaoxCurveEditor, type CurvePoint as EditorPoint } from '@1337exp/taoux/curveeditor';
import { CURVE_SHAPES, MAX_DELTA, curveShape, deltaAt, type CurvePoint, type CurveShape } from '@/app/curve';
import { formatPercent, formatYears } from '@/app/format';
import { lifeYears } from '@/app/model';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';

const store = useStore();
const { t, locale } = useI18n();
const selected = ref(0);

const curve = computed(() => store.inputs.scenario.curve);
const rate = computed(() => store.inputs.deposit.ratePercent ?? 0);
/** The editor works in 0…1: the whole span is the life of the bond, or longer if a point sits past it. / Редактор работает в 0…1: весь отрезок это жизнь облигации. */
const domain = computed(() => Math.max(Math.ceil(lifeYears(store.inputs) ?? 14), curve.value[curve.value.length - 1]?.t ?? 0, 1));

/** The curve is stored in years and points against today's rate; the editor shows the rate itself, in 0…1 of the time. / В хранилище годы и пункты, редактор показывает саму ставку. */
const model = computed<EditorPoint[]>({
    get: () => curve.value.map((p) => ({ t: p.t / domain.value, v: rate.value + p.delta, ...(p.ease === undefined ? {} : { ease: p.ease }) })),
    set: (points) => {
        const next: CurvePoint[] = [];
        points.forEach((p, i) => {
            // Today is pinned: its rate is the deposit's own, change it in the deposit node. / Сегодня закреплено: ставка своя у вклада.
            const years = i === 0 ? 0 : Math.max(Math.round(p.t * domain.value * 20) / 20, next[i - 1]!.t + 0.05);
            const delta = i === 0 ? 0 : Math.min(MAX_DELTA, Math.max(-MAX_DELTA, Math.round((p.v - rate.value) * 100) / 100));
            next.push(p.ease === undefined ? { t: years, delta } : { t: years, delta, ease: p.ease });
        });
        store.inputs.scenario.curve = next;
    },
});

function shape(name: CurveShape): void {
    store.inputs.scenario.curve = curveShape(name, domain.value);
    selected.value = 0;
}

const ticks = computed(() => {
    const step = domain.value > 8 ? 3 : 1;
    const out: number[] = [];
    for (let y = 0; y <= domain.value; y += step) out.push(y);
    return out;
});
const left = (years: number): string => `${(30 + (years / domain.value) * 240) / 2.8}%`;

const point = computed(() => {
    const p = curve.value[Math.min(selected.value, curve.value.length - 1)];
    return p ? t('rates.point', [formatYears(p.t, locale.value), formatPercent((rate.value + p.delta) / 100, locale.value)]) : '';
});
const atHorizon = computed(() => t('rates.end', [formatPercent(Math.max(rate.value + deltaAt(curve.value, store.inputs.scenario.horizonYears), 0) / 100, locale.value)]));
</script>

<template>
    <div class="rates">
        <!-- The canvas would take a press for dragging the node: the editor keeps its own presses. / Холст принял бы нажатие за перетаскивание ноды: нажатия редактора остаются ему. -->
        <div class="editor" @pointerdown.stop @dblclick.stop>
            <TaoxCurveEditor v-model="model" v-model:selected="selected" :min="0" :precision="4" :step-t="0.25 / domain" :major-t="1" guides="lines" />
            <div class="axis" aria-hidden="true">
                <span v-for="y in ticks" :key="y" :style="{ left: left(y) }">{{ y }} {{ t('unit.yearShort') }}</span>
            </div>
        </div>
        <div class="shapes">
            <TaoButton v-for="s in CURVE_SHAPES" :key="s" variant="ghost" tone="neutral" size="small" @click="shape(s)">{{ t(`rates.shape.${s}`) }}</TaoButton>
        </div>
        <p class="line">{{ point }}</p>
        <p class="line">{{ atHorizon }}</p>
        <p class="hint">{{ t('rates.hint') }}</p>
    </div>
</template>

<style scoped>
.editor {
    position: relative;
}

/* The editor writes time as 0…1; the years are drawn by us. / Редактор подписывает время как 0…1; годы рисуем сами. */
.editor :deep(.tx-curve-label:not([dominant-baseline])),
.editor :deep(.tx-curve-tag:not([dominant-baseline])) {
    display: none;
}

.axis {
    position: relative;
    height: 14px;
    margin-top: -14px;
    /* The editor draws its labels at 8 units of a 280-unit-wide picture; the node body is 312 wide, so 8 × 312 / 280. / Редактор рисует подписи размером 8 в картинке шириной 280; тело ноды 312, значит 8 × 312 / 280. */
    font-size: 8.9px;
    color: var(--tao-color-text-muted, inherit);
    pointer-events: none;
}

.axis span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
}

.axis span:first-child {
    transform: none;
}

.shapes {
    display: flex;
    gap: 4px;
    margin: 8px 0 4px;
}

.line {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
}

.hint {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tao-color-text-muted, inherit);
}
</style>
