<script lang="ts" setup>
import { computed } from 'vue';
import type { NodeId } from '@/app/graph';
import { bondSteps, depositSteps, type Step } from '@/app/steps';
import { useStore } from '@/app/store';
import { useI18n, type MessageKey } from '@/i18n';
import BondBody from './BondBody.vue';
import ChartBody from './ChartBody.vue';
import CompareBody from './CompareBody.vue';
import DepositBody from './DepositBody.vue';
import NodeFrame from './NodeFrame.vue';
import RatesBody from './RatesBody.vue';
import ScenarioBody from './ScenarioBody.vue';
import StepBody from './StepBody.vue';

const props = defineProps<{ id: NodeId }>();
const store = useStore();
const { t } = useI18n();

/** The nodes that only say what the maths came to: they all draw the same way. / Ноды, которые лишь говорят, к чему пришёл расчёт: рисуются одинаково. */
const STEP_NODES = new Set<NodeId>(['accrual', 'compound', 'depositResult', 'purchase', 'coupons', 'exit', 'bondResult']);

const step = computed<Step | null>(() => {
    const e = store.evaluation;
    if (!e.ok || !STEP_NODES.has(props.id)) return null;
    return ({ ...depositSteps(e.value), ...bondSteps(e.value) } as Record<string, Step>)[props.id] ?? null;
});

// A step knows its own title (the exit is a sale or a maturity); without numbers the node still has a name.
// Шаг знает свой заголовок (выход это продажа или погашение); без чисел у ноды всё равно есть имя.
const title = computed(() => (step.value ? t(step.value.title) : t(`node.${props.id === 'exit' ? 'exitSale' : props.id}` as MessageKey)));
</script>

<template>
    <NodeFrame :id="id" :title="title">
        <DepositBody v-if="id === 'deposit'" />
        <ScenarioBody v-else-if="id === 'scenario'" />
        <BondBody v-else-if="id === 'bond'" />
        <RatesBody v-else-if="id === 'rates'" />
        <CompareBody v-else-if="id === 'compare'" />
        <ChartBody v-else-if="id === 'chart'" />
        <StepBody v-else :step="step" />
    </NodeFrame>
</template>
