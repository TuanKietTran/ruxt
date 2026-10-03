<script setup lang="ts">
/** Labelled profile form control that reports its own save outcome next to the label. */
defineProps<{ label: string; saved?: boolean; error?: string }>();
</script>

<template>
    <label class="profile-field" :class="{ 'profile-field--error': error }">
        <span class="profile-field__label">
            {{ label }}
            <Transition name="profile-field-fade">
                <span v-if="saved && !error" class="profile-field__saved">✓ saved</span>
            </Transition>
        </span>
        <slot />
        <small v-if="error" class="profile-field__error" role="alert">{{ error }}</small>
    </label>
</template>

<style scoped>
.profile-field { display: grid; align-content: start; gap: 5px; min-width: 0; color: var(--fg-subtext1, #aaa); font-size: 11px; }
.profile-field__label { display: flex; align-items: baseline; gap: 8px; min-height: 14px; }
.profile-field__saved { color: var(--success, #a6e3a1); font-size: 10px; }
.profile-field__error { color: var(--danger, #f38ba8); font-size: 10px; }
.profile-field--error :slotted(textarea),
.profile-field--error :slotted(select) { border-color: var(--danger, #f38ba8); }
.profile-field-fade-leave-active { transition: opacity .4s ease; }
.profile-field-fade-leave-to { opacity: 0; }
</style>
