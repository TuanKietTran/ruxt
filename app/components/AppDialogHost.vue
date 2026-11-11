<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { resolveAppDialog, useAppDialogQueue, validateAppDialogInput } from "~/composables/useAppDialog";

const queue = useAppDialogQueue();
const active = computed(() => queue.value[0]);
const dialog = useTemplateRef<HTMLElement>("dialog");
const promptInput = useTemplateRef<HTMLInputElement>("promptInput");
const cancelButton = useTemplateRef<HTMLButtonElement>("cancelButton");
const value = ref("");
const validationError = ref("");
let restoreFocus: HTMLElement | null = null;

watch(() => active.value?.id, async (id) => {
    if (!id) {
        const restore = restoreFocus;
        restoreFocus = null;
        await nextTick();
        if (restore?.isConnected) restore.focus();
        return;
    }
    if (!restoreFocus) restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    value.value = active.value?.initialValue ?? "";
    validationError.value = "";
    await nextTick();
    (active.value?.kind === "prompt" ? promptInput.value : cancelButton.value)?.focus();
}, { immediate: true });

function close(result: boolean | string | undefined) {
    const item = active.value;
    if (!item) return;
    queue.value = queue.value.filter(request => request.id !== item.id);
    resolveAppDialog(item.id, result);
}

function submitPrompt() {
    const item = active.value;
    if (!item || item.kind !== "prompt") return;
    const cleaned = value.value.trim();
    const error = cleaned ? validateAppDialogInput(item.id, cleaned) : "Enter a value to continue.";
    if (error) {
        validationError.value = error;
        promptInput.value?.focus();
        return;
    }
    close(cleaned);
}

function onKeydown(event: KeyboardEvent) {
    if (!active.value) return;
    if (event.key === "Escape") {
        event.preventDefault();
        close(active.value.kind === "confirm" ? false : undefined);
        return;
    }
    if (event.key !== "Tab") return;
    const elements = [...(dialog.value?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter(element => element.offsetParent !== null);
    if (!elements.length) { event.preventDefault(); dialog.value?.focus(); return; }
    const first = elements[0]!;
    const last = elements[elements.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.value?.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
    }
}
</script>

<template>
    <Teleport to="body">
        <div v-if="active" class="app-dialog-backdrop" @click.self="close(active.kind === 'confirm' ? false : undefined)" @keydown="onKeydown">
            <section ref="dialog" class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" :aria-describedby="active.message ? 'app-dialog-message' : undefined" tabindex="-1">
                <h2 id="app-dialog-title">{{ active.title }}</h2>
                <p v-if="active.message" id="app-dialog-message">{{ active.message }}</p>
                <form v-if="active.kind === 'prompt'" @submit.prevent="submitPrompt">
                    <label class="app-dialog__field">{{ active.inputLabel }}
                        <input ref="promptInput" v-model="value" :aria-invalid="Boolean(validationError)" :aria-describedby="validationError ? 'app-dialog-error' : undefined" @input="validationError = ''">
                    </label>
                    <p v-if="validationError" id="app-dialog-error" class="app-dialog__error" role="alert">{{ validationError }}</p>
                    <footer>
                        <button ref="cancelButton" type="button" class="app-dialog__button" @click="close(undefined)">{{ active.cancelLabel }}</button>
                        <button type="submit" class="app-dialog__button app-dialog__button--primary" :class="{ 'app-dialog__button--danger': active.destructive }">{{ active.confirmLabel }}</button>
                    </footer>
                </form>
                <footer v-else>
                    <button ref="cancelButton" type="button" class="app-dialog__button" @click="close(false)">{{ active.cancelLabel }}</button>
                    <button type="button" class="app-dialog__button app-dialog__button--primary" :class="{ 'app-dialog__button--danger': active.destructive }" @click="close(true)">{{ active.confirmLabel }}</button>
                </footer>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.app-dialog-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; overflow-y: auto; padding: 24px; background: rgb(0 0 0 / 66%); }
.app-dialog { width: min(440px, 100%); padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 8px 24px rgb(0 0 0 / 24%); }
.app-dialog h2 { margin: 0; font-size: 18px; }.app-dialog > p { margin: 8px 0 0; color: var(--fg-subtext0); }
.app-dialog__field { display: grid; gap: 6px; margin-top: 16px; font-size: 13px; }.app-dialog__field input { width: 100%; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-base); color: inherit; font: inherit; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.app-dialog__field input:focus-visible, .app-dialog__button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }.app-dialog__error { margin: 6px 0 0; color: var(--red); font-size: 13px; }
.app-dialog footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 24px; }.app-dialog__button { min-height: 40px; padding: 8px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.app-dialog__button:hover { background: var(--bg-surface0); }
.app-dialog__button--primary:hover { background: var(--accent-hover); }
.app-dialog__button--danger:hover { background: var(--red); }.app-dialog__button--primary { border-color: transparent; background: var(--accent); color: var(--bg-crust); }.app-dialog__button--danger { background: var(--red); color: var(--bg-crust); }
@media (prefers-reduced-motion: reduce) {
    .app-dialog__button, .app-dialog__field input { transition-duration: 0.01ms; }
}
@media (max-width: 640px) {
    .app-dialog-backdrop { padding: 16px; }
    .app-dialog { padding: 16px; }
}
</style>
