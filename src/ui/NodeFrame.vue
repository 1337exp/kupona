<script lang="ts" setup>
import { computed } from 'vue';
import { nodeDef, type NodeId } from '@/app/graph';
import { useStore } from '@/app/store';

const props = defineProps<{ id: NodeId; title: string }>();
const store = useStore();

const def = computed(() => nodeDef(props.id));
const style = computed(() => {
    const p = store.positions[props.id];
    return { left: `${p.x}px`, top: `${p.y}px`, width: `${def.value.w}px`, height: `${def.value.h}px` };
});
</script>

<template>
    <div
        class="node"
        :class="[`branch-${def.branch}`, { source: def.level === 0, selected: store.selection.has(id) }]"
        :data-node-id="id"
        :style="style"
    >
        <header class="node-head" data-node-handle>
            <span class="dot" />
            <h2>{{ title }}</h2>
        </header>
        <div class="node-body">
            <slot />
        </div>
    </div>
</template>

<style>
.node {
    position: absolute;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border: 1px solid var(--tao-color-border, rgba(127, 127, 127, 0.3));
    border-radius: 12px;
    background: var(--tao-color-surface, #1f2125);
    color: var(--tao-color-text, inherit);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    cursor: default;
}

.node.selected {
    border-color: var(--node-color);
    box-shadow: 0 0 0 1px var(--node-color);
}

.node:not(.source) {
    animation: node-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes node-in {
    from {
        opacity: 0;
        transform: translateY(18px) scale(0.96);
    }
}

@media (prefers-reduced-motion: reduce) {
    .node:not(.source) {
        animation: none;
    }
}

.node-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 8px;
    cursor: grab;
}

.node-head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--tao-color-text-muted, inherit);
}

.node-head .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--node-color);
}

.node-body {
    flex: 1;
    min-height: 0;
    padding: 0 14px 12px;
}
</style>
