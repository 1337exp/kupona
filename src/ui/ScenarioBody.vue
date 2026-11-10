<script lang="ts" setup>
import { computed } from 'vue';
import { TaoInputNumber, TaoSegmented, TaoSegmentedOption, TaoSlider, TaoSwitch } from '@1337exp/taoui';
import { formatYears } from '@/app/format';
import { lifeYears } from '@/app/model';
import { useStore } from '@/app/store';
import { useI18n } from '@/i18n';
import Field from './Field.vue';

type Mode = 'same' | 'own' | 'curve';

const store = useStore();
const { t, locale } = useI18n();
const s = store.inputs.scenario;

const foreign = computed(() => store.inputs.deposit.currency !== 'RUB');
const life = computed(() => lifeYears(store.inputs) ?? 13);
const sliderMax = computed(() => Math.ceil(life.value * 4) / 4);
const horizonText = computed(() => (s.horizonYears >= life.value ? `${formatYears(life.value, locale.value)} · ${t('node.exitMaturity').toLowerCase()}` : formatYears(s.horizonYears, locale.value)));

/** The three ways the market can move after the purchase, over the two fields that hold them. / Три способа, как рынок двигается после покупки, поверх двух полей, что их хранят. */
const mode = computed<Mode>({
    get: () => (s.marketFollowsCurve && !foreign.value ? 'curve' : s.marketYieldPercent === null ? 'same' : 'own'),
    set: (next) => {
        s.marketFollowsCurve = next === 'curve';
        if (next === 'same') s.marketYieldPercent = null;
        if (next === 'own' && s.marketYieldPercent === null) {
            const ytm = store.evaluation.ok ? store.evaluation.value.quote.ytm : null;
            s.marketYieldPercent = Math.round((ytm ?? 0.15) * 1000) / 10;
        }
    },
});
</script>

<template>
    <div class="grid">
        <Field class="wide" :label="t('field.amount')" :error="store.problems.includes('amount')">
            <TaoInputNumber v-model="s.amount" :min="1" :step="10000" :precision="0" :controls="false" />
        </Field>
        <Field class="wide" :label="`${t('field.horizon')}: ${horizonText}`">
            <TaoSlider v-model="s.horizonYears" :min="0.25" :max="sliderMax" :step="0.25" />
        </Field>
        <Field class="wide" :label="t('field.reinvest')" :error="store.problems.includes('reinvest')">
            <TaoInputNumber v-model="s.reinvestPercent" :min="0" :step="0.5" :controls="false" :disabled="s.reinvestFollows && !foreign" />
        </Field>
        <TaoSwitch v-if="!foreign" v-model="s.reinvestFollows" class="wide" :label="t('field.reinvestDeposit')" size="small" />
        <Field class="wide" :label="t('field.marketMode')">
            <TaoSegmented v-model="mode" size="small" block :aria-label="t('field.marketMode')">
                <TaoSegmentedOption value="same">{{ t('field.marketSame') }}</TaoSegmentedOption>
                <TaoSegmentedOption value="own">{{ t('field.marketOwn') }}</TaoSegmentedOption>
                <TaoSegmentedOption v-if="!foreign" value="curve">{{ t('field.marketCurve') }}</TaoSegmentedOption>
            </TaoSegmented>
        </Field>
        <p v-if="foreign" class="hint wide">{{ t('hint.scenarioFx') }}</p>
        <Field v-if="mode === 'own'" class="wide" :label="t('field.marketYield')" :error="store.problems.includes('marketYield')">
            <TaoInputNumber v-model="s.marketYieldPercent" :step="0.25" :controls="false" />
        </Field>
    </div>
</template>

<style scoped>
.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
}

.wide {
    grid-column: 1 / -1;
}

.hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tao-color-text-muted, inherit);
}
</style>
