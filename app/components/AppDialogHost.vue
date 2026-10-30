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
.app-dialog { width: min(440px, 100%); padding: 22px; border: 1px solid var(--border, #45475a); border-radius: 12px; background: var(--bg-mantle, #181825); color: var(--fg-text, #cdd6f4); box-shadow: 0 24px 80px rgb(0 0 0 / 38%); }
.app-dialog h2 { margin: 0; font-size: 18px; }.app-dialog > p { margin: 10px 0 0; color: var(--fg-subtext0, #a6adc8); }
.app-dialog__field { display: grid; gap: 6px; margin-top: 16px; font-size: 13px; }.app-dialog__field input { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--border, #45475a); border-radius: 6px; background: var(--bg-base, #1e1e2e); color: inherit; font: inherit; }
.app-dialog__field input:focus-visible, .app-dialog__button:focus-visible { outline: 2px solid var(--accent, #89b4fa); outline-offset: 2px; }.app-dialog__error { margin: 6px 0 0; color: var(--red, #f38ba8); font-size: 13px; }
.app-dialog footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 22px; }.app-dialog__button { min-height: 38px; padding: 7px 14px; border: 1px solid var(--border, #45475a); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }.app-dialog__button--primary { border-color: transparent; background: var(--accent, #89b4fa); color: var(--bg-crust, #11111b); }.app-dialog__button--danger { background: var(--red, #f38ba8); }
</style>
