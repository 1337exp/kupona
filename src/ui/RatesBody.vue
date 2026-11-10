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

/** The editor's 0…1 written as years, on its axis and on the tag of the selected point. / 0…1 редактора записано годами: на оси и на метке выбранной точки. */
const years = (tt: number): string => `${Math.round(tt * domain.value * 10) / 10} ${t('unit.yearShort')}`;
/** A mark every three years on a long span, every year on a short one. / Метка раз в три года на длинном отрезке, раз в год на коротком. */
const majorT = computed(() => (domain.value > 8 ? 3 : 1) / domain.value);

const point = computed(() => {
    const p = curve.value[Math.min(selected.value, curve.value.length - 1)];
    return p ? t('rates.point', [formatYears(p.t, locale.value), formatPercent((rate.value + p.delta) / 100, locale.value)]) : '';
});
const atHorizon = computed(() => t('rates.end', [formatPercent(Math.max(rate.value + deltaAt(curve.value, store.inputs.scenario.horizonYears), 0) / 100, locale.value)]));
</script>

<template>
    <div class="rates">
        <!-- The canvas would take a press for dragging the node: the editor keeps its own presses. / Холст принял бы нажатие за перетаскивание ноды: нажатия редактора остаются ему. -->
        <div @pointerdown.stop @dblclick.stop>
            <TaoxCurveEditor v-model="model" v-model:selected="selected" :min="0" :precision="4" :step-t="0.25 / domain" :major-t="majorT" :format-t="years" guides="lines" />
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
