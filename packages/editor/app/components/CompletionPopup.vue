<script setup lang="ts">
import { computed, useId } from "vue";

export interface CompletionItem {
    id?: string;
    label: string;
    detail?: string;
    kind?: string;
    insertText?: string;
}

const props = withDefaults(
    defineProps<{
        items: readonly CompletionItem[];
        open: boolean;
        activeIndex: number;
    }>(),
    { activeIndex: 0 },
);

const emit = defineEmits<{
    select: [item: CompletionItem, index: number];
    cancel: [];
    "update:activeIndex": [index: number];
}>();

const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "-");
const optionId = (index: number) => `${baseId}-option-${index}`;

const activeIndex = computed(() => {
    if (props.items.length === 0) return -1;
    return Math.min(Math.max(props.activeIndex, 0), props.items.length - 1);
});

const activeDescendant = computed(() =>
    activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined,
);

function setActive(index: number) {
    if (index !== props.activeIndex) emit("update:activeIndex", index);
}

function move(delta: number) {
    if (props.items.length === 0) return;
    const next = (activeIndex.value + delta + props.items.length) % props.items.length;
    emit("update:activeIndex", next);
}

function selectAt(index: number) {
    const item = props.items[index];
    if (item) emit("select", item, index);
}

function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
        case "ArrowDown":
            event.preventDefault();
            move(1);
            break;
        case "ArrowUp":
            event.preventDefault();
            move(-1);
            break;
        case "Home":
            event.preventDefault();
            if (props.items.length > 0) setActive(0);
            break;
        case "End":
            event.preventDefault();
            if (props.items.length > 0) setActive(props.items.length - 1);
            break;
        case "Enter":
            event.preventDefault();
            if (activeIndex.value >= 0) selectAt(activeIndex.value);
            break;
        case "Escape":
            event.preventDefault();
            emit("cancel");
            break;
    }
}
</script>

<template>
    <div
        v-if="open"
        class="completion-popup"
        role="listbox"
        aria-label="Completions"
        :aria-activedescendant="activeDescendant"
        tabindex="0"
        @keydown="onKeydown"
    >
        <div v-if="items.length === 0" class="completion-popup__empty" role="status">
            No completions
        </div>
        <div
            v-for="(item, index) in items"
            :id="optionId(index)"
            :key="item.id ?? `${item.label}-${index}`"
            class="completion-popup__option"
            :class="{ 'completion-popup__option--active': index === activeIndex }"
            role="option"
            :aria-selected="index === activeIndex"
            @click="selectAt(index)"
            @pointerenter="setActive(index)"
        >
            <span class="completion-popup__label">{{ item.label }}</span>
            <span v-if="item.kind" class="completion-popup__kind">{{ item.kind }}</span>
            <span v-if="item.detail" class="completion-popup__detail">{{ item.detail }}</span>
        </div>
    </div>
</template>

<style scoped>
.completion-popup {
    position: absolute;
    z-index: 20;
    box-sizing: border-box;
    width: 320px;
    max-width: min(320px, calc(100vw - 16px));
    max-height: 264px;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    background: var(--bg-mantle);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--fg-text);
    font-size: 13px;
    line-height: 1.4;
}

.completion-popup:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

.completion-popup__option {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
}

.completion-popup__option--active {
    background: var(--accent-muted);
}

.completion-popup__label {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
}

.completion-popup__kind {
    flex: none;
    color: var(--fg-subtext1);
    font-size: 12px;
}

.completion-popup__detail {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--fg-subtext0);
    font-size: 12px;
    text-align: right;
}

.completion-popup__empty {
    padding: 8px;
    color: var(--fg-subtext0);
}
</style>
