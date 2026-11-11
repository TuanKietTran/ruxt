<script setup lang="ts">
import { manifestProgressLabel, manifestProgressPercent, type ManifestProgressState } from "~/utils/manifest-progress";

const props = withDefaults(defineProps<{ progress: ManifestProgressState; cancellable?: boolean }>(), { cancellable: true });
const emit = defineEmits<{ cancel: [] }>();
const percent = computed(() => manifestProgressPercent(props.progress));
const label = computed(() => manifestProgressLabel(props.progress));
</script>

<template>
    <div v-if="progress.status !== 'idle'" class="manifest-progress" :data-status="progress.status" role="status" aria-live="polite">
        <div class="manifest-progress__row">
            <span class="manifest-progress__label">{{ label }}</span>
            <span class="manifest-progress__meta">{{ progress.loadedChunks }} of {{ progress.totalChunks }} chunks · {{ percent }}%</span>
            <button v-if="progress.status === 'loading' && cancellable" type="button" class="manifest-progress__cancel" @click="emit('cancel')">Cancel</button>
        </div>
        <div class="manifest-progress__track" role="progressbar" aria-label="Manifest loading progress" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="percent" :aria-valuetext="label">
            <div class="manifest-progress__bar" :style="{ width: `${percent}%` }" />
        </div>
    </div>
</template>

<style scoped>
.manifest-progress { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); color: var(--fg-text); }
.manifest-progress__row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.manifest-progress__label { font-size: 14px; font-weight: 600; }
.manifest-progress__meta { font-size: 12px; color: var(--fg-subtext0); }
.manifest-progress__cancel { margin-left: auto; min-height: 36px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface0); color: var(--fg-text); font: inherit; font-size: 13px; cursor: pointer; }
.manifest-progress__cancel:hover { background: var(--bg-surface1); }
.manifest-progress__cancel:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.manifest-progress__track { height: 8px; border-radius: var(--radius-sm); background: var(--bg-surface0); overflow: hidden; }
.manifest-progress__bar { height: 100%; background: var(--accent); transition: width 150ms ease; }
.manifest-progress[data-status="error"] .manifest-progress__bar { background: var(--red); }
.manifest-progress[data-status="cancelled"] .manifest-progress__bar { background: var(--fg-subtext0); }
@media (max-width: 480px) {
    .manifest-progress__row { flex-direction: column; align-items: stretch; }
    .manifest-progress__cancel { margin-left: 0; width: 100%; }
}
</style>
