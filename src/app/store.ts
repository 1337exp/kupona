/**
 * The state of the page: what is typed, where nodes stand, how far the chain has grown, the camera. One instance for the app.
 * Состояние страницы: что введено, где стоят ноды, как далеко выросла цепочка, камера. Один экземпляр на приложение.
 */
import { computed, markRaw, reactive, ref, watch } from 'vue';
import { applyTaoMode, type TaoMode } from '@1337exp/taoui';
import { createCamera, fitCamera, type Camera } from '@1337exp/taoux/camera';
import type { CanvasHost } from '@1337exp/taoux/canvas';
import { createSavedStorage } from '@1337exp/taoux/storage';
import { LAST_LEVEL, bounds, defaultPositions, lines, nodeDef, type NodeId, type Positions } from './graph';
import { defaultInputs, evaluate, sanitizeInputs, type Inputs, type Problem } from './model';

const MAX_ZOOM_FIT = 1;
const FIT_PADDING = 40;
/** Height of the bar over the canvas, px. / Высота панели над холстом. */
const TOP_BAR = 64;
/** A pause between the levels of the chain, ms. / Пауза между уровнями цепочки. */
const STEP_MS = 520;
const FLIGHT_MS = 700;

const inputsStorage = createSavedStorage('kupona.inputs');
const prefsStorage = createSavedStorage('kupona.prefs');

function readJson(text: string | null): unknown {
    try {
        return text === null ? null : JSON.parse(text);
    } catch {
        return null;
    }
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const systemTheme = (): TaoMode => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

function createStore() {
    const inputs = reactive<Inputs>(sanitizeInputs(readJson(inputsStorage.read())));
    const evaluation = computed(() => evaluate(inputs));

    const savedPrefs = readJson(prefsStorage.read()) as { theme?: string } | null;
    const theme = ref<TaoMode>(savedPrefs?.theme === 'light' || savedPrefs?.theme === 'dark' ? savedPrefs.theme : systemTheme());
    watch(theme, (mode) => applyTaoMode(document.documentElement, mode), { immediate: true });
    watch(theme, (mode) => prefsStorage.write(JSON.stringify({ theme: mode })));

    let saveTimer = 0;
    watch(
        inputs,
        () => {
            window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => inputsStorage.write(JSON.stringify(inputs)), 300);
        },
        { deep: true },
    );

    // --- the chain: how far it has grown / цепочка: как далеко выросла
    const positions = ref<Positions>(defaultPositions());
    const level = ref(0);
    const calculating = ref(false);
    let run = 0;

    // --- camera and size of the canvas / камера и размер холста
    const camera = ref<Camera>(createCamera());
    const viewport = ref({ w: 0, h: 0 });
    let flight = 0;

    function cancelFlight(): void {
        cancelAnimationFrame(flight);
        flight = 0;
    }

    function flyTo(target: Camera, ms = FLIGHT_MS): void {
        cancelFlight();
        if (ms <= 0 || reducedMotion()) {
            camera.value = target;
            return;
        }
        const from = { ...camera.value };
        const start = performance.now();
        const tick = (now: number): void => {
            const k = Math.min(1, (now - start) / ms);
            const e = 1 - (1 - k) ** 3;
            camera.value = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e };
            flight = k < 1 ? requestAnimationFrame(tick) : 0;
        };
        flight = requestAnimationFrame(tick);
    }

    /** The camera that shows everything visible at `forLevel`. / Камера, показывающая всё видимое на уровне `forLevel`. */
    const fitFor = (forLevel: number): Camera => {
        // The top bar covers the first TOP_BAR px of the canvas: fit into what is left and move down by that much.
        // Верхняя панель закрывает первые TOP_BAR px холста: вписываем в остаток и сдвигаем вниз на эту высоту.
        const { w, h } = viewport.value;
        const cam = fitCamera(bounds(positions.value, forLevel), { w, h: h - TOP_BAR }, FIT_PADDING, { min: 0.2, max: MAX_ZOOM_FIT });
        return { ...cam, y: cam.y + TOP_BAR };
    };

    function fit(animate = true): void {
        if (viewport.value.w === 0) return;
        flyTo(fitFor(level.value), animate ? FLIGHT_MS : 0);
    }

    function setViewport(size: { w: number; h: number }): void {
        const first = viewport.value.w === 0;
        viewport.value = size;
        if (first && size.w > 0) fit(false);
    }

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    /** Grow the chain from the nodes you type into, level by level, the camera following. / Вырастить цепочку от нод ввода по уровням, камера следует. */
    async function calculate(): Promise<void> {
        if (!evaluation.value.ok) return;
        const mine = ++run;
        calculating.value = true;
        level.value = 0;
        fit();
        const pause = reducedMotion() ? 0 : STEP_MS;
        for (let l = 1; l <= LAST_LEVEL; l++) {
            await sleep(pause);
            if (mine !== run) return;
            level.value = l;
            flyTo(fitFor(l));
        }
        if (mine === run) calculating.value = false;
    }

    function layout(): void {
        positions.value = defaultPositions();
        fit();
    }

    function loadExample(): void {
        Object.assign(inputs, defaultInputs());
    }

    // --- selection and dragging of nodes (the canvas asks, we answer) / выделение и перетаскивание нод
    const selection = ref<ReadonlySet<string>>(new Set());

    const host: CanvasHost<never> = {
        get camera() {
            return camera.value;
        },
        setCamera(next) {
            cancelFlight();
            camera.value = next;
        },
        setViewport,
        get selection() {
            return selection.value;
        },
        setSelection(ids) {
            selection.value = new Set(ids);
        },
        toggleSelected(id) {
            const next = new Set(selection.value);
            if (!next.delete(id)) next.add(id);
            selection.value = next;
        },
        selectConnection() {},
        beginDrag() {},
        moveSelected(dx, dy) {
            for (const id of selection.value) {
                const p = positions.value[id as NodeId];
                if (p && nodeDef(id as NodeId).level <= level.value) {
                    p.x += dx;
                    p.y += dy;
                }
            }
        },
        endDrag() {},
        commit() {},
        undo() {},
        redo() {},
        removeSelected() {},
        paletteOpen: false,
        openPalette() {},
        closePalette() {},
    };

    const lineList = computed(() => lines(positions.value, level.value, camera.value.z));

    const problems = computed<Problem[]>(() => {
        const e = evaluation.value;
        return e.ok ? [] : e.problems;
    });

    // reactive() unwraps the refs, so components write `store.level`, not `store.level.value`. The host stays as it is: the canvas takes it once.
    // reactive() разворачивает рефы: в компонентах `store.level`, а не `store.level.value`. Мост остаётся как есть: холст берёт его один раз.
    return Object.assign(reactive({ inputs, evaluation, theme, positions, level, calculating, camera, viewport, selection, lineList, problems, calculate, fit, layout, loadExample }), {
        host: markRaw(host),
    });
}

let instance: ReturnType<typeof createStore> | null = null;

export function useStore(): ReturnType<typeof createStore> {
    return (instance ??= createStore());
}
