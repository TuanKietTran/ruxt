<script setup lang="ts">
/**
 * Text field that grows with its content instead of clipping it. Single-line fields wrap long values
 * but refuse line breaks; `multiline` fields keep them. While focused, the typed text is kept locally so
 * normalizing parents (comma or line lists) cannot rewrite the value under the caret.
 */
const props = defineProps<{ modelValue: string; multiline?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const field = useTemplateRef<HTMLTextAreaElement>("field");
const text = ref(props.modelValue);
const focused = ref(false);
const sizesNatively = import.meta.client && typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

const resize = () => {
    const el = field.value;
    if (sizesNatively || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
};

watch(() => props.modelValue, (value) => { if (!focused.value) text.value = value; });
watch(text, () => nextTick(resize));
onMounted(() => {
    resize();
    if (!sizesNatively) window.addEventListener("resize", resize);
});
onBeforeUnmount(() => window.removeEventListener("resize", resize));

const onInput = (event: Event) => {
    const el = event.target as HTMLTextAreaElement;
    let value = el.value;
    if (!props.multiline && /[\r\n]/.test(value)) {
        value = value.replace(/\s*[\r\n]+\s*/g, " ");
        el.value = value;
    }
    text.value = value;
    emit("update:modelValue", value);
};
const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !props.multiline) event.preventDefault();
};
const onBlur = () => {
    focused.value = false;
    text.value = props.modelValue;
};
</script>

<template>
    <textarea
        ref="field"
        class="profile-input"
        :class="{ 'profile-input--multiline': multiline }"
        :value="text"
        rows="1"
        @focus="focused = true"
        @blur="onBlur"
        @input="onInput"
        @keydown="onKeydown"
    />
</template>

<style scoped>
.profile-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 34px;
    padding: 8px 9px;
    overflow: hidden;
    border: 1px solid var(--border, #333);
    border-radius: 3px;
    outline: none;
    background: var(--bg-mantle, #171717);
    color: var(--fg-text, #ddd);
    font: inherit;
    line-height: 1.4;
    overflow-wrap: anywhere;
    resize: none;
    field-sizing: content;
}
.profile-input--multiline { min-height: calc(2.8em + 18px); }
.profile-input:focus { border-color: var(--accent, #89b4fa); }
.profile-input::placeholder { color: var(--fg-subtext0, #777); }
</style>
