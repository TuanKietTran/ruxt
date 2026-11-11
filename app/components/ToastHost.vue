<script setup lang="ts">
const { toasts, dismiss } = useToast();
</script>

<template>
    <Teleport to="body">
        <div v-if="toasts.length" class="toast-host" aria-live="polite" role="status">
            <div v-for="toast in toasts" :key="toast.id" class="toast" :class="['toast', 'toast--' + toast.tone]">
                <p class="toast__message">{{ toast.message }}</p>
                <button type="button" class="toast__close" aria-label="Dismiss notification" @click="dismiss(toast.id)">×</button>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 12000; display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); }
.toast { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: var(--radius-md); background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 8px 24px rgb(0 0 0 / 24%); }
.toast--success { border-left-color: var(--green); }
.toast--warning { border-left-color: var(--yellow); }
.toast--error { border-left-color: var(--red); }
.toast--info { border-left-color: var(--sky); }
.toast__message { flex: 1; margin: 0; font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
.toast__close { flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; font-size: 16px; line-height: 1; cursor: pointer; }
.toast__close:hover { background: var(--bg-surface0); }
.toast__close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
