<script setup lang="ts">
import type { ProfileSaveMode } from "#shared/preferences";

/**
 * Click-to-edit profile field. It reads as text until clicked (or activated with Enter/Space), then
 * edits a local buffer. In `auto` mode the buffer is committed while typing and on leaving the field,
 * and Esc restores the value from before editing. In `manual` mode only Save (Enter, or Ctrl/⌘+Enter
 * for long text) commits and Cancel (Esc) discards; leaving the field keeps unsaved edits open.
 * The `display` slot renders the read view (bullets, chips) for structured values.
 */
const props = withDefaults(defineProps<{
    label: string;
    modelValue: string;
    mode: ProfileSaveMode;
    multiline?: boolean;
    placeholder?: string;
    options?: readonly string[];
    saved?: boolean;
    error?: string;
    startEditing?: boolean;
    maxlength?: number | string;
    autocomplete?: string;
    /** Optional and empty: collapse to a small "＋ label" button while not editing. */
    optional?: boolean;
}>(), { optional: false, multiline: false, placeholder: "", options: undefined, saved: false, error: undefined, startEditing: false, maxlength: undefined, autocomplete: "off" });
const emit = defineEmits<{ commit: [value: string]; dirty: [dirty: boolean] }>();

const AUTO_SAVE_DELAY = 700;
const id = useId();
const root = useTemplateRef<HTMLElement>("root");
const editing = ref(false);
const buffer = ref("");
let original = "";
let timer: ReturnType<typeof setTimeout> | undefined;
/** Swapping the read view for the control drops focus for a moment; that blur must not end the edit. */
let opening = false;

const dirty = computed(() => props.mode === "manual" && editing.value && buffer.value !== props.modelValue);
watch(dirty, value => emit("dirty", value));

const control = () => root.value?.querySelector<HTMLTextAreaElement | HTMLSelectElement>(".editable-field__control textarea, .editable-field__control select");
const display = () => root.value?.querySelector<HTMLElement>(".editable-field__display, .editable-field__add");
const collapsed = computed(() => props.optional && !editing.value && !props.modelValue.trim() && !props.error);

const startEdit = () => {
    if (editing.value) return;
    original = props.modelValue;
    buffer.value = props.modelValue;
    editing.value = true;
    opening = true;
    nextTick(() => {
        const el = control();
        el?.focus();
        if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
        opening = false;
    });
};
const stopTimer = () => { clearTimeout(timer); timer = undefined; };
const save = (refocus = false) => {
    stopTimer();
    editing.value = false;
    emit("commit", buffer.value);
    if (refocus) nextTick(() => display()?.focus());
};
const cancel = () => {
    stopTimer();
    editing.value = false;
    if (props.mode === "auto" && props.modelValue !== original) emit("commit", original);
    buffer.value = original;
    nextTick(() => display()?.focus());
};
const onInput = (value: string) => {
    buffer.value = value;
    if (props.mode !== "auto") return;
    stopTimer();
    timer = setTimeout(() => { timer = undefined; emit("commit", buffer.value); }, AUTO_SAVE_DELAY);
};
const onSelect = (event: Event) => {
    buffer.value = (event.target as HTMLSelectElement).value;
    if (props.mode === "auto") save(true);
};
const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        event.preventDefault();
        cancel();
    } else if (event.key === "Enter" && (!props.multiline || event.ctrlKey || event.metaKey) && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault();
        save(true);
    }
};
const onFocusOut = (event: FocusEvent) => {
    if (opening || !editing.value || root.value?.contains(event.relatedTarget as Node | null)) return;
    if (props.mode === "auto") save();
    else if (!dirty.value) editing.value = false;
};
// A page unload never blurs the field, so commit what auto mode has not flushed yet.
const flushOnHide = () => { if (editing.value && props.mode === "auto" && timer) { stopTimer(); emit("commit", buffer.value); } };

watch(() => props.startEditing, value => { if (value) startEdit(); });
onMounted(() => {
    window.addEventListener("pagehide", flushOnHide);
    if (props.startEditing) startEdit();
});
onBeforeUnmount(() => {
    flushOnHide();
    window.removeEventListener("pagehide", flushOnHide);
    if (dirty.value) emit("dirty", false);
});
</script>

<template>
    <div v-if="collapsed" ref="root" class="editable-field editable-field--collapsed">
        <button type="button" class="editable-field__add" @click="startEdit">＋ {{ label }}</button>
    </div>
    <div v-else ref="root" class="editable-field" :class="{ 'editable-field--editing': editing, 'editable-field--error': error }" @focusout="onFocusOut">
        <span :id="`${id}-label`" class="editable-field__label">
            {{ label }}
            <Transition name="editable-field-fade">
                <span v-if="saved && !error && !editing" class="editable-field__saved">✓ saved</span>
            </Transition>
            <span v-if="dirty" class="editable-field__unsaved">unsaved</span>
        </span>
        <div
            v-if="!editing"
            role="button"
            tabindex="0"
            class="editable-field__display"
            :class="{ 'editable-field__display--empty': !modelValue.trim(), 'editable-field__display--multiline': multiline }"
            :aria-labelledby="`${id}-label`"
            :aria-describedby="error ? `${id}-error` : undefined"
            @click="startEdit"
            @keydown.enter.self.prevent="startEdit"
            @keydown.space.self.prevent="startEdit"
        ><slot v-if="modelValue.trim()" name="display" :value="modelValue">{{ modelValue }}</slot><template v-else>{{ placeholder || "Click to add" }}</template></div>
        <div v-else class="editable-field__control">
            <select v-if="options" :value="buffer" :aria-labelledby="`${id}-label`" @change="onSelect" @keydown="onKeydown">
                <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
            </select>
            <ProfileInput
                v-else
                :model-value="buffer"
                :multiline="multiline"
                :placeholder="placeholder"
                :maxlength="maxlength"
                :autocomplete="autocomplete"
                :aria-labelledby="`${id}-label`"
                @update:model-value="onInput"
                @keydown="onKeydown"
            />
            <div v-if="mode === 'manual'" class="editable-field__actions">
                <button type="button" class="editable-field__cancel" @click="cancel">Cancel</button>
                <button type="button" class="editable-field__save" @click="save(true)">Save</button>
                <span class="editable-field__hint">{{ multiline ? "Ctrl/⌘ + Enter" : "Enter" }} to save · Esc to cancel</span>
            </div>
        </div>
        <small v-if="error" :id="`${id}-error`" class="editable-field__error" role="alert">{{ error }}</small>
    </div>
</template>

<style scoped>
.editable-field { display: grid; align-content: start; gap: 5px; min-width: 0; color: var(--fg-subtext1, #aaa); font-size: 11px; }
.editable-field__label { display: flex; align-items: baseline; gap: 8px; min-height: 14px; }
.editable-field__saved { color: var(--success, #a6e3a1); font-size: 10px; }
.editable-field__unsaved { color: var(--warning, #f9e2af); font-size: 10px; }
.editable-field__error { color: var(--danger, #f38ba8); font-size: 10px; }
.editable-field__display {
    box-sizing: border-box;
    width: 100%;
    min-height: 34px;
    margin: 0;
    padding: 8px 9px;
    border: 1px solid transparent;
    border-bottom-color: var(--border, #333);
    border-radius: 3px;
    background: transparent;
    color: var(--fg-text, #ddd);
    font: inherit;
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    cursor: text;
}
.editable-field__display:hover { border-color: var(--border, #333); background: var(--bg-mantle, #171717); }
.editable-field__display:focus-visible { outline: none; border-color: var(--accent, #89b4fa); }
.editable-field__display--empty { color: var(--fg-subtext0, #777); font-style: italic; }
.editable-field__display--multiline { min-height: calc(2.8em + 18px); }
.editable-field--error .editable-field__display { border-bottom-color: var(--danger, #f38ba8); }
.editable-field__control { display: grid; gap: 6px; min-width: 0; }
.editable-field__control select { box-sizing: border-box; width: 100%; min-height: 34px; padding: 7px 8px; border: 1px solid var(--accent, #89b4fa); border-radius: 3px; outline: none; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; font-size: 13px; }
.editable-field--error .editable-field__control :deep(textarea) { border-color: var(--danger, #f38ba8); }
.editable-field__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
.editable-field__hint { flex-basis: 100%; color: var(--fg-subtext0, #777); font-size: 10px; text-align: right; }
.editable-field__actions button { padding: 4px 10px; border: 1px solid var(--border, #333); border-radius: 3px; background: transparent; color: var(--fg-text, #ddd); font: inherit; cursor: pointer; }
.editable-field__actions .editable-field__save { border-color: var(--accent, #89b4fa); background: var(--accent, #89b4fa); color: #111; }
.editable-field--collapsed { align-self: start; padding-top: 19px; }
.editable-field__add { justify-self: start; padding: 4px 8px; border: 1px dashed var(--border, #333); border-radius: 3px; background: transparent; color: var(--fg-subtext0, #888); font: inherit; font-size: 11px; cursor: pointer; }
.editable-field__add:hover, .editable-field__add:focus-visible { outline: none; border-color: var(--accent, #89b4fa); color: var(--fg-text, #ddd); }
.editable-field__display :slotted(ul) { margin: 0; padding-left: 16px; white-space: normal; }
.editable-field__display :slotted(li + li) { margin-top: 3px; }
.editable-field__display :slotted(.chips) { display: flex; flex-wrap: wrap; gap: 4px; white-space: normal; }
.editable-field__display :slotted(.chips span) { padding: 1px 7px; border: 1px solid var(--border, #333); border-radius: 999px; background: var(--bg-surface0, #242424); font-size: 12px; }
.editable-field-fade-leave-active { transition: opacity .4s ease; }
.editable-field-fade-leave-to { opacity: 0; }
@media (hover: none) { .editable-field__hint { display: none; } }
</style>
