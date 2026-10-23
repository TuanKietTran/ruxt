<script setup lang="ts">
import { commitTechnologies } from "~/utils/technologies";

/**
 * Chip input for a project's technologies. Typing a comma, pressing Enter, or leaving the box turns exactly
 * what is in the box into chips and emits the new list once. Nothing is committed on a timer, so there is no
 * debounced save to race with the explicit commit; Backspace in an empty box removes the last chip and the ×
 * on a chip removes that one.
 */
const props = defineProps<{
    label: string;
    modelValue: string[];
    /** Render-time ownership guard: old fields must not emit into a replaced form. */
    isCurrent?: () => boolean;
    saved?: boolean;
    error?: string;
    startEditing?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string[]]; commit: [] }>();

const id = useId();
const box = ref("");
const input = useTemplateRef<HTMLInputElement>("input");

const publish = (next: string[]) => {
    if (props.isCurrent?.() === false) return;
    emit("update:modelValue", next);
    emit("commit");
};
/** Commit the box's current text. A no-op when the box is empty. */
const flush = () => {
    const text = box.value;
    if (!text.trim()) { box.value = ""; return; }
    box.value = "";
    publish(commitTechnologies(props.modelValue, text));
};
const remove = (index: number) => publish(props.modelValue.filter((_, i) => i !== index));

const onInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    box.value = value;
    if (value.includes(",")) {
        const trailing = value.endsWith(",") ? "" : value.slice(value.lastIndexOf(",") + 1);
        box.value = value.slice(0, value.length - trailing.length);
        flush();
        box.value = trailing.trimStart();
    }
};
const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
        event.preventDefault();
        flush();
    } else if (event.key === "Backspace" && !box.value && props.modelValue.length) {
        publish(props.modelValue.slice(0, -1));
    }
};
// A page unload never blurs the box, so commit what is still in it.
const flushOnHide = () => flush();
watch(() => props.startEditing, value => { if (value) input.value?.focus(); });
onMounted(() => window.addEventListener("pagehide", flushOnHide));
onBeforeUnmount(() => window.removeEventListener("pagehide", flushOnHide));
</script>

<template>
    <div class="tech-input" :class="{ 'tech-input--error': error }">
        <span :id="`${id}-label`" class="tech-input__label">
            {{ label }}
            <Transition name="tech-input-fade"><span v-if="saved && !error" class="tech-input__saved">✓ saved</span></Transition>
        </span>
        <div class="tech-input__box" @click="input?.focus()">
            <span v-for="(item, index) in modelValue" :key="`${index}-${item}`" class="tech-input__chip" data-chip>
                {{ item }}
                <button type="button" :aria-label="`Remove ${item}`" @click.stop="remove(index)">×</button>
            </span>
            <input
                ref="input"
                :value="box"
                type="text"
                autocomplete="off"
                :aria-labelledby="`${id}-label`"
                placeholder="Add a technology, then Enter or comma"
                @input="onInput"
                @keydown="onKeydown"
                @blur="flush"
            >
        </div>
    </div>
</template>

<style scoped>
.tech-input { display: grid; align-content: start; gap: 5px; min-width: 0; color: var(--fg-subtext1, #aaa); font-size: 11px; }
.tech-input__label { display: flex; align-items: baseline; gap: 8px; min-height: 14px; }
.tech-input__saved { color: var(--success, #a6e3a1); font-size: 10px; }
.tech-input__box { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 34px; padding: 4px 8px; border: 1px solid transparent; border-bottom-color: var(--border, #333); border-radius: 3px; cursor: text; }
.tech-input__box:hover, .tech-input__box:focus-within { border-color: var(--border, #333); background: var(--bg-mantle, #171717); }
.tech-input__box:focus-within { border-color: var(--accent, #89b4fa); }
.tech-input__chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 4px 1px 7px; border: 1px solid var(--border, #333); border-radius: 999px; background: var(--bg-surface0, #242424); color: var(--fg-text, #ddd); font-size: 12px; }
.tech-input__chip button { padding: 0 3px; border: 0; background: transparent; color: var(--fg-subtext0, #888); font: inherit; cursor: pointer; }
.tech-input__box input { flex: 1 1 140px; min-width: 0; padding: 4px 0; border: 0; outline: none; background: transparent; color: var(--fg-text, #ddd); font: inherit; font-size: 13px; }
.tech-input-fade-leave-active { transition: opacity .4s ease; }
.tech-input-fade-leave-to { opacity: 0; }
</style>
