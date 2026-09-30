<script setup lang="ts">
import {
    CV_PROFILE_SECTIONS, mergeCvProfileSections,
    type CvDetectedField, type CvProfileDetection, type CvProfileProps, type CvProfileSection,
} from "@core/domain/cv";
import { normalizeCvProfile } from "@core/domain/cv/compose";
import { localProfileLabel, readLocalProfiles, saveLocalProfile, type LocalProfile } from "~/utils/localProfiles";

const props = defineProps<{
    detection: CvProfileDetection | null;
    activePath?: string;
}>();

const emit = defineEmits<{
    reveal: [field: CvDetectedField];
    close: [];
    saved: [profile: LocalProfile];
}>();

const SECTION_LABELS: Record<CvProfileSection, string> = {
    identity: "Identity", contacts: "Contacts", experiences: "Experience", education: "Education",
    projects: "Projects", skills: "Skills", certifications: "Certifications", languages: "Languages",
};
const KEY_LABELS: Record<string, string> = {
    fullName: "Name", headline: "Headline", location: "Location", summary: "Summary",
    title: "Title", company: "Company", start: "Start", end: "End", highlight: "Highlight",
    school: "School", degree: "Degree", details: "Details", name: "Name", url: "URL",
    description: "Description", technology: "Tech", skill: "Skill", language: "Language",
};

const included = ref<Set<CvProfileSection>>(new Set(CV_PROFILE_SECTIONS));
const target = ref("");
const profiles = ref<LocalProfile[]>([]);
const status = ref("");
const error = ref("");
const expanded = ref<Set<CvProfileSection>>(new Set(["identity", "contacts"]));

const refreshProfiles = () => {
    profiles.value = readLocalProfiles().filter(profile => profile.identity.fullName.trim());
    if (target.value && !profiles.value.some(profile => profile.id === target.value)) target.value = "";
};
onMounted(refreshProfiles);

const groups = computed(() => CV_PROFILE_SECTIONS.map(section => {
    const fields = props.detection?.fields.filter(field => field.section === section) ?? [];
    return { section, fields, located: fields.filter(field => field.ranges.length).length };
}).filter(group => group.fields.length));

const toggled = (set: Set<CvProfileSection>, section: CvProfileSection) => {
    const next = new Set(set);
    if (next.has(section)) next.delete(section); else next.add(section);
    return next;
};
const toggleIncluded = (section: CvProfileSection) => { included.value = toggled(included.value, section); };
const toggleExpanded = (section: CvProfileSection) => { expanded.value = toggled(expanded.value, section); };

const fieldLabel = (field: CvDetectedField) => {
    const key = field.section === "contacts" ? field.key : KEY_LABELS[field.key] ?? field.key;
    return field.entry === undefined || field.section === "contacts" ? key : `${field.entry + 1} · ${key}`;
};

/** The detected profile restricted to the included sections. */
const selectedProfile = (): CvProfileProps | null => {
    if (!props.detection) return null;
    return mergeCvProfileSections(normalizeCvProfile({}), props.detection.profile, [...included.value]);
};

const save = () => {
    status.value = "";
    error.value = "";
    const detected = selectedProfile();
    if (!detected || !included.value.size) { error.value = "Choose at least one section to save."; return; }
    const existing = target.value ? profiles.value.find(profile => profile.id === target.value) : undefined;
    const value = existing ? mergeCvProfileSections(existing, detected, [...included.value]) : detected;
    if (!value.identity.fullName.trim()) {
        error.value = existing ? "The saved profile would have no name." : "A new profile needs the Identity section with a name.";
        return;
    }
    const saved = saveLocalProfile(value, existing?.id);
    refreshProfiles();
    target.value = saved.id;
    status.value = existing ? `Updated ${saved.identity.fullName}.` : `Saved ${saved.identity.fullName} as a new profile.`;
    emit("saved", saved);
};
</script>

<template>
    <section class="detect-panel" aria-label="Detected profile">
        <header class="detect-panel__header">
            <strong>Detected profile</strong>
            <small v-if="detection">{{ detection.fields.length }} values · click to jump</small>
            <button type="button" aria-label="Close detected profile" @click="emit('close')">×</button>
        </header>

        <p v-if="!groups.length" class="detect-panel__empty">No profile information found in this session.</p>
        <div v-else class="detect-panel__groups">
            <div v-for="group in groups" :key="group.section" class="detect-group" :class="`cm-profile-field--${group.section}`">
                <div class="detect-group__heading">
                    <input
                        type="checkbox"
                        :checked="included.has(group.section)"
                        :aria-label="`Include ${SECTION_LABELS[group.section]} when saving`"
                        @change="toggleIncluded(group.section)"
                    >
                    <button type="button" class="detect-group__toggle" :aria-expanded="expanded.has(group.section)" @click="toggleExpanded(group.section)">
                        <span class="detect-swatch" />
                        {{ SECTION_LABELS[group.section] }}
                        <small>{{ group.located }}/{{ group.fields.length }}</small>
                    </button>
                </div>
                <ul v-if="expanded.has(group.section)">
                    <li v-for="field in group.fields" :key="field.path">
                        <button
                            type="button"
                            class="detect-field"
                            :class="{ 'detect-field--active': field.path === activePath, 'detect-field--missing': !field.ranges.length }"
                            :disabled="!field.ranges.length"
                            :title="field.ranges.length ? `Line ${field.line}` : 'Not found in the source'"
                            @click="emit('reveal', field)"
                        >
                            <span>{{ fieldLabel(field) }}</span>
                            <span class="detect-field__value">{{ field.value }}</span>
                        </button>
                    </li>
                </ul>
            </div>
        </div>

        <footer class="detect-panel__footer">
            <select v-model="target" aria-label="Save detected profile to" @focus="refreshProfiles">
                <option value="">New profile</option>
                <option v-for="profile in profiles" :key="profile.id" :value="profile.id">Update {{ localProfileLabel(profile) }}</option>
            </select>
            <button type="button" class="detect-save" :disabled="!groups.length" @click="save">Save to profiles</button>
            <span v-if="error" class="detect-panel__error" role="alert">{{ error }}</span>
            <span v-else-if="status" class="detect-panel__status" role="status">{{ status }} <NuxtLink to="/p">Open profiles</NuxtLink></span>
        </footer>
    </section>
</template>

<style>
/* Shared by the panel legend and the source highlights. */
.cm-profile-field--identity { --highlight-color: var(--mauve, #cba6f7); }
.cm-profile-field--contacts { --highlight-color: var(--sky, #89dceb); }
.cm-profile-field--experiences { --highlight-color: var(--peach, #fab387); }
.cm-profile-field--education { --highlight-color: var(--green, #a6e3a1); }
.cm-profile-field--projects { --highlight-color: var(--pink, #f5c2e7); }
.cm-profile-field--skills { --highlight-color: var(--yellow, #f9e2af); }
.cm-profile-field--certifications { --highlight-color: var(--teal, #94e2d5); }
.cm-profile-field--languages { --highlight-color: var(--sapphire, #74c7ec); }
</style>

<style scoped>
.detect-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; max-height: 100%; border-top: 1px solid var(--border, #333); background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font-size: 12px; }
.detect-panel__header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border, #333); }
.detect-panel__header small { color: var(--fg-subtext0, #888); }
.detect-panel__header button { margin-left: auto; border: 0; background: transparent; color: var(--fg-subtext0, #888); font: inherit; font-size: 16px; cursor: pointer; }
.detect-panel__empty { margin: 0; padding: 12px 10px; color: var(--fg-subtext0, #888); }
.detect-panel__groups { overflow: auto; padding: 4px 0; }
.detect-group__heading { display: flex; align-items: center; gap: 6px; padding: 2px 10px; }
.detect-group__toggle { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.detect-group__toggle small { color: var(--fg-subtext0, #888); }
.detect-swatch { width: 8px; height: 8px; border-radius: 2px; background: var(--highlight-color); }
.detect-group ul { margin: 0 0 4px; padding: 0 10px 0 34px; list-style: none; }
.detect-field { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; width: 100%; padding: 2px 4px; border: 0; border-radius: 3px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.detect-field span:first-child { color: var(--fg-subtext0, #888); }
.detect-field__value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detect-field:hover, .detect-field--active { background: color-mix(in srgb, var(--highlight-color) 20%, transparent); }
.detect-field--missing { opacity: .5; cursor: default; }
.detect-panel__footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border, #333); }
.detect-panel__footer select { max-width: 220px; height: 24px; border: 1px solid var(--border, #333); border-radius: 4px; background: transparent; color: inherit; font: inherit; }
.detect-save { height: 24px; padding: 0 10px; border: 1px solid var(--accent, #89b4fa); border-radius: 4px; background: var(--accent, #89b4fa); color: #111; font: inherit; cursor: pointer; }
.detect-save:disabled { opacity: .5; cursor: default; }
.detect-panel__error { color: var(--red, #f38ba8); }
.detect-panel__status { color: var(--green, #a6e3a1); }
.detect-panel__status a { color: var(--accent, #89b4fa); }
</style>
