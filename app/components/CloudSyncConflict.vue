<script setup lang='ts'>
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import type { SyncRecordView } from '~/utils/cloudSync/contracts';
import type { SyncSnapshot } from '~/utils/cloudSync/types';
import { parseSnapshotFields } from '~/utils/cloudSync/merge';
import {
    applyChoices, chooseAll, emptyChoices, reviewConflict, unresolvedCount,
    type ConflictChoices, type ConflictSides, type HunkChoice, type Side,
} from '~/utils/cloudSync/conflictView';

/**
 * Review one record whose copies on this device and in the cloud both changed. Both versions are kept
 * until the user decides: take one side, keep both as separate records, or merge piece by piece. Changes
 * only one side made are always carried over; only pieces both sides changed differently ask for a choice.
 */
const props = defineProps<{
    record: SyncRecordView;
    sides: ConflictSides;
    busy: boolean;
}>();

const emit = defineEmits<{
    resolve: [choice: 'local' | 'cloud' | 'both'];
    merged: [snapshot: SyncSnapshot];
    close: [];
}>();

const review = computed(() => reviewConflict(props.record.kind, props.sides));
const merge = computed(() => review.value?.merge ?? null);
const choices = ref<ConflictChoices>({ title: 'local', text: {}, json: {} });
if (merge.value) choices.value = emptyChoices(merge.value);

const heading = useTemplateRef('heading');
onMounted(() => { void nextTick(() => heading.value?.focus()); });

const unresolved = computed(() => merge.value ? unresolvedCount(merge.value, choices.value) : 0);
const merged = computed(() => merge.value ? applyChoices(props.record.kind, props.sides, merge.value, choices.value) : null);
const cleanMerge = computed(() => Boolean(merge.value && merge.value.conflicts === 0));

const FIELD_LABELS: Record<string, string> = {
    markdown: 'Content (content.md)', css: 'Styles (style.css)', markdownSkeleton: 'Template content', capabilities: 'Template capabilities', tags: 'Tags', profile: 'Profile data',
};
const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const conflictHunks = (field: string) => (merge.value?.text.find(entry => entry.field === field)?.result.hunks ?? [])
    .flatMap(hunk => hunk.kind === 'conflict' ? [hunk] : []);
const textConflictFields = computed(() => (merge.value?.text ?? []).filter(entry => entry.result.conflicts > 0).map(entry => entry.field));
const jsonConflictFields = computed(() => (merge.value?.json ?? []).filter(entry => entry.conflicts.length > 0).map(entry => entry.field));

const setHunk = (field: string, index: number, choice: HunkChoice) => {
    const list = [...(choices.value.text[field] ?? [])];
    list[index] = choice;
    choices.value = { ...choices.value, text: { ...choices.value.text, [field]: list } };
};
const setJson = (field: string, side: Side) => { choices.value = { ...choices.value, json: { ...choices.value.json, [field]: side } }; };
const setTitle = (side: Side) => { choices.value = { ...choices.value, title: side }; };
const chooseEverything = (side: Side | 'both') => { if (merge.value) choices.value = chooseAll(merge.value, side); };

const sideValue = (side: Side, field: string): string => {
    const snapshot = side === 'local' ? props.sides.local : props.sides.cloud;
    const fields = snapshot ? parseSnapshotFields(props.record.kind, snapshot) : null;
    const text = JSON.stringify(fields?.[field], null, 1) ?? '';
    return text.length > 600 ? `${text.slice(0, 600)}…` : text;
};
const lines = (value: string[]) => value.length ? value.join('\n') : '(nothing)';

const applyMerge = () => { if (merged.value) emit('merged', merged.value); };
const missingSide = computed(() => !props.sides.local ? 'This device no longer has this record.' : !props.sides.cloud ? 'The cloud no longer has this record.' : '');
</script>

<template>
    <section class='conflict' role='dialog' aria-modal='true' aria-labelledby='conflict-title' @keydown.escape='emit("close")'>
        <header class='conflict__header'>
            <h3 id='conflict-title' ref='heading' tabindex='-1'>
                <AppIcon name='lucide:git-compare' />
                Review: {{ record.title }}
            </h3>
            <button type='button' class='conflict__close' @click='emit("close")'>Close</button>
        </header>
        <p class='conflict__intro'>
            This record changed on this device and in the cloud. Nothing is lost while you decide: the version you do not keep is saved in recovery first.
        </p>
        <p v-if='missingSide' class='notice' role='status'>{{ missingSide }} It cannot be compared piece by piece, so choose which version to keep.</p>

        <template v-if='merge'>
            <p v-if='cleanMerge' class='notice' role='status'>Both sides changed different parts, so they combine without any choice.</p>
            <p v-else class='notice' role='status'>
                {{ merge.conflicts }} {{ merge.conflicts === 1 ? 'piece was' : 'pieces were' }} changed differently on both sides. Choose for each, or use a shortcut.
            </p>

            <fieldset v-if='merge.title.conflict' class='piece'>
                <legend>Name</legend>
                <label><input type='radio' name='conflict-title-choice' :checked='choices.title === "local"' @change='setTitle("local")'> This device: <q>{{ merge.title.local }}</q></label>
                <label><input type='radio' name='conflict-title-choice' :checked='choices.title === "cloud"' @change='setTitle("cloud")'> Cloud: <q>{{ merge.title.cloud }}</q></label>
            </fieldset>

            <template v-for='field in textConflictFields' :key='field'>
                <fieldset
                    v-for='(hunk, index) in conflictHunks(field)' :key='`${field}-${index}`' class='piece'
                    :aria-label='`${fieldLabel(field)}, change ${index + 1} of ${conflictHunks(field).length}`'
                >
                    <legend>{{ fieldLabel(field) }} · change {{ index + 1 }} of {{ conflictHunks(field).length }}</legend>
                    <div class='sides'>
                        <div><strong>This device</strong><pre>{{ lines(hunk.local) }}</pre></div>
                        <div><strong>Cloud</strong><pre>{{ lines(hunk.cloud) }}</pre></div>
                    </div>
                    <div class='choices' role='radiogroup' :aria-label='`Choose for ${fieldLabel(field)}, change ${index + 1}`'>
                        <label><input type='radio' :name='`hunk-${field}-${index}`' :checked='choices.text[field]?.[index] === "local"' @change='setHunk(field, index, "local")'> This device</label>
                        <label><input type='radio' :name='`hunk-${field}-${index}`' :checked='choices.text[field]?.[index] === "cloud"' @change='setHunk(field, index, "cloud")'> Cloud</label>
                        <label><input type='radio' :name='`hunk-${field}-${index}`' :checked='choices.text[field]?.[index] === "both"' @change='setHunk(field, index, "both")'> Both</label>
                    </div>
                </fieldset>
            </template>

            <fieldset v-for='field in jsonConflictFields' :key='`json-${field}`' class='piece' :aria-label='fieldLabel(field)'>
                <legend>{{ fieldLabel(field) }}</legend>
                <div class='sides'>
                    <div><strong>This device</strong><pre>{{ sideValue('local', field) }}</pre></div>
                    <div><strong>Cloud</strong><pre>{{ sideValue('cloud', field) }}</pre></div>
                </div>
                <div class='choices' role='radiogroup' :aria-label='`Choose for ${fieldLabel(field)}`'>
                    <label><input type='radio' :name='`json-${field}`' :checked='choices.json[field] === "local"' @change='setJson(field, "local")'> This device</label>
                    <label><input type='radio' :name='`json-${field}`' :checked='choices.json[field] === "cloud"' @change='setJson(field, "cloud")'> Cloud</label>
                </div>
            </fieldset>

            <div v-if='!cleanMerge' class='shortcuts' role='group' aria-label='Resolve every change the same way'>
                <span>For every change, take:</span>
                <button type='button' @click='chooseEverything("local")'>This device</button>
                <button type='button' @click='chooseEverything("cloud")'>Cloud</button>
                <button type='button' @click='chooseEverything("both")'>Both</button>
            </div>

            <div class='actions'>
                <button type='button' class='primary' :disabled='busy || !merged' @click='applyMerge'>
                    {{ cleanMerge ? 'Apply combined version' : 'Apply my choices' }}
                </button>
                <span v-if='unresolved > 0' class='hint' role='status'>{{ unresolved }} {{ unresolved === 1 ? 'choice' : 'choices' }} left</span>
            </div>
        </template>

        <div class='whole' role='group' aria-label='Keep one whole version'>
            <h4>Or decide for the whole record</h4>
            <div class='actions'>
                <button type='button' :disabled='busy || !sides.local' @click='emit("resolve", "local")'>Keep this device's version</button>
                <button type='button' :disabled='busy || !sides.cloud' @click='emit("resolve", "cloud")'>Keep the cloud version</button>
                <button type='button' :disabled='busy || !sides.local || !sides.cloud' @click='emit("resolve", "both")'>Keep both as separate records</button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.conflict { display: grid; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); }
.conflict__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.conflict__header h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
.conflict__header h3:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.conflict__intro, .notice, .hint { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.notice { padding: 12px 16px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.piece { display: grid; gap: 12px; margin: 0; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface0); min-width: 0; }
.piece legend { padding: 0 6px; font-weight: 600; }
.sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sides pre { margin: 4px 0 0; padding: 10px; max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: var(--radius-sm); background: var(--bg-mantle); font-size: 12px; line-height: 1.5; }
.choices, .shortcuts, .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.choices label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.whole h4 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.conflict button { min-height: 40px; padding: 8px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.conflict button:hover:not(:disabled) { background: var(--bg-surface0); }
.conflict button:disabled { opacity: .5; cursor: not-allowed; }
.conflict button:focus-visible, .conflict input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.conflict button.primary { border-color: transparent; background: var(--accent); color: var(--bg-crust); }
.conflict button.primary:hover:not(:disabled) { background: var(--accent-hover); }
@media (max-width: 640px) {
    .conflict { padding: 16px; }
    .sides { grid-template-columns: minmax(0, 1fr); }
    .conflict button { flex: 1 1 auto; }
}
</style>
