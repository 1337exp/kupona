<script lang="ts" setup>
import { computed } from 'vue';
import { TaoButton, TaoSegmented, TaoSegmentedOption, TaoThemeToggle } from '@1337exp/taoui';
import { TaoxCanvas, type CanvasOptions } from '@1337exp/taoux/canvas';
import { TaoxLinks } from '@1337exp/taoux/links';
import { NODES } from '@/app/graph';
import { useStore } from '@/app/store';
import { LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n, type LocaleCode } from '@/i18n';
import NodeView from '@/ui/NodeView.vue';

const store = useStore();
const { t, locale } = useI18n();

// Nothing to connect by hand: the chain is built for you, so the canvas has no pins.
// Связывать руками нечего: цепочку строят за тебя, поэтому пинов у холста нет.
const options: CanvasOptions<never> = { pinAt: () => null, zoom: { min: 0.2, max: 1.6 } };

const visible = computed(() => NODES.filter((n) => n.level <= store.level));
const links = computed(() => store.lineList.map((l) => ({ id: l.id, d: l.d, head: l.head, color: `var(--k-${l.branch})` })));

const problemText = computed(() => store.problems.map((p) => t(`problem.${p}`)).join(', '));
const language = computed({ get: () => locale.value, set: (code: LocaleCode) => setLocale(code) });
</script>

<template>
    <div class="app">
        <TaoxCanvas :host="store.host" :options="options" background="dots">
            <TaoxLinks :lines="links" />
            <NodeView v-for="n in visible" :key="n.id" :id="n.id" />
        </TaoxCanvas>

        <!-- Beside the canvas, not inside it: the canvas captures the pointer and would swallow the clicks. / Рядом с холстом, не внутри: холст захватывает указатель и проглотил бы клики. -->
        <div class="overlay">
            <div class="bar left">
                <div class="brand">
                    <b>kupona</b>
                    <span>{{ t('app.subtitle') }}</span>
                </div>
                <TaoButton :loading="store.calculating" :disabled="store.problems.length > 0" @click="store.calculate()">{{ t('app.calculate') }}</TaoButton>
                <TaoButton variant="ghost" tone="neutral" @click="store.fit()">{{ t('app.fit') }}</TaoButton>
                <TaoButton variant="ghost" tone="neutral" @click="store.layout()">{{ t('app.layout') }}</TaoButton>
            </div>

            <div class="bar right">
                <TaoSegmented v-model="language" size="small" :aria-label="t('app.language')">
                    <TaoSegmentedOption v-for="code in LOCALE_CODES" :key="code" :value="code">{{ LOCALE_NAMES[code] }}</TaoSegmentedOption>
                </TaoSegmented>
                <TaoThemeToggle v-model="store.theme" :apply="false" :to-light-label="t('app.light')" :to-dark-label="t('app.dark')" />
            </div>

            <p v-if="store.problems.length" class="notice error">{{ t('app.problems', [problemText]) }}</p>
            <p v-else-if="store.level === 0" class="notice">{{ t('app.hint') }}</p>
        </div>
    </div>
</template>

<style scoped>
.app {
    position: relative;
    width: 100%;
    height: 100%;
}

/* The layer lets the pointer through to the canvas; only the panels catch it. / Слой пропускает указатель к холсту; ловят его только панели. */
.overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.overlay > * {
    pointer-events: auto;
}

.bar {
    position: absolute;
    top: 12px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--tao-color-border, rgba(127, 127, 127, 0.3));
    border-radius: 12px;
    background: var(--tao-color-surface, #1f2125);
}

.bar.left {
    left: 12px;
}

.bar.right {
    right: 12px;
}

.brand {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    margin-right: 6px;
}

.brand b {
    font-size: 15px;
}

.brand span {
    font-size: 11px;
    color: var(--tao-color-text-muted, inherit);
}

.notice {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    margin: 0;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 13px;
    background: var(--tao-color-surface, #1f2125);
    border: 1px solid var(--tao-color-border, rgba(127, 127, 127, 0.3));
    color: var(--tao-color-text-muted, inherit);
}

.notice.error {
    color: var(--tao-color-danger-text, #e5484d);
    border-color: var(--tao-color-danger, #e5484d);
}
</style>
