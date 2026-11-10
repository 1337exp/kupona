<script lang="ts" setup>
defineProps<{ label: string; error?: boolean }>();
</script>

<template>
    <div class="field" :class="{ error }">
        <span class="label">{{ label }}</span>
        <slot />
    </div>
</template>

<style scoped>
.field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.label {
    font-size: 12px;
    color: var(--tao-color-text-muted, inherit);
}

.error .label {
    color: var(--tao-color-danger, #e5484d);
}
</style>
