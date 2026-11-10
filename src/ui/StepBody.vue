<script lang="ts" setup>
import { computed } from 'vue';
import { formatValue } from '@/app/format';
import type { Say, Step } from '@/app/steps';
import { useI18n } from '@/i18n';

const props = defineProps<{ step: Step | null }>();
const { t, locale } = useI18n();

const text = (s: Say): string => t(s.key, s.args.map((a) => formatValue(a, locale.value, t)));
const headline = computed(() => (props.step ? text(props.step.headline) : '—'));
const lines = computed(() => props.step?.lines.map(text) ?? []);
</script>

<template>
    <div class="step">
        <div class="headline">{{ headline }}</div>
        <ul>
            <li v-for="(line, i) in lines" :key="i">{{ line }}</li>
        </ul>
    </div>
</template>

<style scoped>
.headline {
    font-size: 24px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--node-color);
    margin-bottom: 6px;
}

ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
    line-height: 1.45;
    color: var(--tao-color-text-muted, inherit);
}

li + li {
    margin-top: 2px;
}
</style>
