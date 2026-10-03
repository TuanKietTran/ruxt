<script setup lang="ts">
import { toRaw } from "vue";
import type { CvContactKind, CvDocumentSummary, CvProfileProps, CvTemplate } from "@core/domain/cv";
import type { ApplyCvProfileOutput } from "@core/handlers/apply-cv-profile";
import { normalizeCvProfile } from "@core/domain/cv/compose";
import { type LocalProfile, newLocalProfileId, readLocalProfiles, saveLocalProfile, writeLocalProfiles } from "~/utils/localProfiles";
import { downloadBlob, safeFilename } from "~/utils/exportCvImage";
import {
    MIN_PASSPHRASE_LENGTH, PROFILE_FILE_EXTENSION, ProfileTransferError,
    decryptProfiles, encryptProfiles, envelopeToFile, envelopeToToken,
} from "~/utils/profileTransfer";

type LocalProfileInput = CvProfileProps;

definePageMeta({ layout: false, public: true, path: "/p" });

const profiles = ref<LocalProfile[]>([]);
/** `null` = nothing open, `""` = a new profile that has not been stored yet. */
const editingId = ref<string | null>(null);
const emptyProfile = (): LocalProfileInput => normalizeCvProfile({});
const draft = ref<LocalProfileInput>(emptyProfile());
const currentProfile = computed(() => profiles.value.find(item => item.id === editingId.value) ?? null);

const readProfiles = () => { profiles.value = readLocalProfiles(); };
const persist = (items: LocalProfile[]) => {
    writeLocalProfiles(items);
    readProfiles();
};

// Every field saves on its own once its value is committed (blur, select change, removal).
type EntrySection = "contacts" | "experiences" | "skills" | "certifications" | "education" | "projects" | "languages";
const touched = reactive(new Set<string>());
const savedFlash = reactive<Record<string, number>>({});
const lastSavedAt = ref<number | null>(null);
let dirty = false;

const blank = (value: string) => !value.trim();
const requiredFields: Record<Exclude<EntrySection, "languages">, Record<string, string>> = {
    contacts: { value: "value" },
    experiences: { title: "job title", company: "company" },
    skills: { name: "group name" },
    certifications: { name: "certification" },
    education: { school: "institution" },
    projects: { name: "project name" },
};
const issues = computed(() => {
    const found: Record<string, string> = {};
    if (blank(draft.value.identity.fullName)) found["identity.fullName"] = "Full name is required to save.";
    for (const [section, fields] of Object.entries(requiredFields)) {
        (draft.value[section as keyof typeof requiredFields] as unknown as Record<string, string>[]).forEach((entry, index) => {
            for (const [field, name] of Object.entries(fields)) {
                if (blank(entry[field] ?? "")) found[`${section}.${index}.${field}`] = `Add a ${name}.`;
            }
        });
    }
    return found;
});
const entryIssues = (section: EntrySection, index: number) =>
    Object.entries(issues.value).filter(([key]) => key.startsWith(`${section}.${index}.`)).map(([key]) => key.split(".")[2]!);
const entryPending = (section: EntrySection, index: number) => entryIssues(section, index).length > 0;
const pendingNote = (section: Exclude<EntrySection, "languages">, index: number) =>
    `Not saved yet — needs ${entryIssues(section, index).map(field => requiredFields[section][field]).join(" and ")}.`;
const pendingCount = computed(() => new Set(Object.keys(issues.value)
    .filter(key => key !== "identity.fullName")
    .map(key => key.split(".").slice(0, 2).join("."))).size);

/** Props for a `ProfileField`: its save flash, and its validation error once the field was committed. */
const field = (key: string) => ({ saved: Boolean(savedFlash[key]), error: touched.has(key) ? issues.value[key] : undefined });

/** The stored copy keeps complete entries only; incomplete ones stay in the form until finished. */
const savableDraft = (): CvProfileProps => {
    const value = structuredClone(toRaw(draft.value));
    const complete = (section: EntrySection) => (_: unknown, index: number) => !entryPending(section, index);
    value.contacts = value.contacts.filter(complete("contacts"));
    value.experiences = value.experiences.filter(complete("experiences"));
    value.skills = value.skills.filter(complete("skills"));
    value.certifications = value.certifications.filter(complete("certifications"));
    value.education = value.education.filter(complete("education"));
    value.projects = value.projects.filter(complete("projects"));
    value.languages = value.languages.map(language => language.trim()).filter(Boolean);
    return value;
};
const persistDraft = (): boolean => {
    dirty = false;
    if (editingId.value === null || blank(draft.value.identity.fullName)) return false;
    const saved = saveLocalProfile(savableDraft(), editingId.value || undefined);
    editingId.value = saved.id;
    lastSavedAt.value = saved.updatedAt;
    readProfiles();
    return true;
};
const flash = (key: string) => {
    const stamp = Date.now();
    savedFlash[key] = stamp;
    setTimeout(() => { if (savedFlash[key] === stamp) delete savedFlash[key]; }, 1800);
};
const commit = (key: string) => {
    touched.add(key);
    if (!persistDraft() || issues.value[key]) return;
    const [section, index] = key.split(".");
    if (/^\d+$/.test(index ?? "") && entryPending(section as EntrySection, Number(index))) return;
    flash(key);
};
const markDirty = () => { dirty = true; };
const flushDraft = () => { if (dirty) persistDraft(); };
const resetFieldState = () => {
    touched.clear();
    for (const key of Object.keys(savedFlash)) delete savedFlash[key];
    lastSavedAt.value = null;
    dirty = false;
};

onMounted(() => {
    readProfiles();
    window.addEventListener("beforeunload", flushDraft);
});
onBeforeUnmount(() => {
    flushDraft();
    window.removeEventListener("beforeunload", flushDraft);
});

const startCreate = () => {
    flushDraft();
    resetFieldState();
    editingId.value = "";
    draft.value = emptyProfile();
    nextTick(() => document.querySelector<HTMLElement>(".profile-identity textarea")?.focus());
};
const startEdit = (profile: LocalProfile) => {
    if (profile.id === editingId.value) return;
    flushDraft();
    resetFieldState();
    const cloned = structuredClone(toRaw(profile));
    const { id: _id, createdAt: _createdAt, updatedAt, ...profileValue } = cloned;
    draft.value = profileValue;
    editingId.value = profile.id;
    lastSavedAt.value = updatedAt;
};
const selectProfile = (id: string) => {
    const profile = profiles.value.find(item => item.id === id);
    if (profile) startEdit(profile);
};
const remove = (profile: LocalProfile) => {
    if (!confirm(`Delete ${profile.identity.fullName}'s profile?`)) return;
    persist(profiles.value.filter(item => item.id !== profile.id));
    if (editingId.value === profile.id) {
        editingId.value = null;
        resetFieldState();
    }
};

const newEntries = {
    contacts: () => ({ kind: "email" as CvContactKind, label: "", value: "" }),
    experiences: () => ({ title: "", company: "", location: "", start: "", end: "", highlights: [] }),
    skills: () => ({ name: "", skills: [] }),
    certifications: () => ({ name: "" }),
    education: () => ({ school: "", degree: "", location: "", start: "", end: "", details: "" }),
    projects: () => ({ name: "", url: "", description: "", technologies: [] }),
    languages: () => "",
};
const addEntry = (section: EntrySection) => {
    const entries = draft.value[section] as unknown[];
    entries.push(newEntries[section]());
    const index = entries.length - 1;
    nextTick(() => document.querySelector<HTMLElement>(`[data-entry="${section}-${index}"] textarea`)?.focus());
};
const removeEntry = (section: EntrySection, index: number) => {
    (draft.value[section] as unknown[]).splice(index, 1);
    for (const key of [...touched]) if (key.startsWith(`${section}.`)) touched.delete(key);
    for (const key of Object.keys(savedFlash)) if (key.startsWith(`${section}.`)) delete savedFlash[key];
    persistDraft();
};
const splitList = (value: string) => value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
const splitLines = (value: string) => value.split("\n").filter(line => line.trim());
const contactKinds: CvContactKind[] = ["email", "phone", "linkedin", "github", "website", "other"];

const saveStatus = computed(() => {
    if (blank(draft.value.identity.fullName)) return editingId.value ? "Add a full name to keep saving." : "Add a full name to start saving.";
    if (pendingCount.value) return `${pendingCount.value} incomplete ${pendingCount.value === 1 ? "entry isn't" : "entries aren't"} saved yet.`;
    if (!lastSavedAt.value) return "Changes save as you leave each field.";
    return `All changes saved · ${new Date(lastSavedAt.value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
});

type TransferMode = "export" | "copy" | "import";
const transfer = reactive({
    mode: null as TransferMode | null,
    targets: [] as LocalProfile[],
    passphrase: "", confirm: "", input: "", fileName: "",
    error: "", status: "", busy: false,
});
const toProfileProps = (profile: LocalProfile): CvProfileProps => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...value } = structuredClone(toRaw(profile));
    return value;
};
const openTransfer = (mode: TransferMode, targets: LocalProfile[] = []) => {
    Object.assign(transfer, { mode, targets, passphrase: "", confirm: "", input: "", fileName: "", error: "", status: "", busy: false });
};
const closeTransfer = () => { if (!transfer.busy) transfer.mode = null; };
const transferLabel = computed(() => transfer.targets.length === 1
    ? transfer.targets[0]!.identity.fullName || "profile"
    : `${transfer.targets.length} profiles`);
const readTransferFile = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { transfer.error = "File is too large."; return; }
    transfer.input = await file.text();
    transfer.fileName = file.name;
    transfer.error = "";
};
const runTransfer = async () => {
    transfer.error = "";
    transfer.status = "";
    if (transfer.mode !== "import") {
        if (transfer.passphrase.length < MIN_PASSPHRASE_LENGTH) { transfer.error = `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`; return; }
        if (transfer.passphrase !== transfer.confirm) { transfer.error = "Passphrases do not match."; return; }
    } else if (!transfer.input.trim()) { transfer.error = "Choose a file or paste an encrypted profile."; return; }
    transfer.busy = true;
    try {
        if (transfer.mode === "import") {
            const imported = await decryptProfiles(transfer.input, transfer.passphrase);
            if (!imported.length) throw new ProfileTransferError("The export contains no profiles.", "format");
            const now = Date.now();
            persist([...profiles.value, ...imported.map((profile, index) => ({ ...profile, id: newLocalProfileId(), createdAt: now, updatedAt: now + index }))]);
            transfer.busy = false;
            transfer.mode = null;
            return;
        }
        const envelope = await encryptProfiles(transfer.targets.map(toProfileProps), transfer.passphrase);
        if (transfer.mode === "copy") {
            await navigator.clipboard.writeText(envelopeToToken(envelope));
            transfer.status = "Encrypted profile copied. Share the passphrase separately.";
        } else {
            const name = transfer.targets.length === 1 ? safeFilename(transferLabel.value) : "profiles";
            downloadBlob(new Blob([envelopeToFile(envelope)], { type: "application/json" }), `${name}${PROFILE_FILE_EXTENSION}`);
            transfer.status = "Encrypted file downloaded. Share the passphrase separately.";
        }
        transfer.passphrase = "";
        transfer.confirm = "";
    } catch (cause) {
        transfer.error = cause instanceof ProfileTransferError ? cause.message
            : transfer.mode === "copy" ? "Clipboard access was denied." : "Transfer failed.";
    } finally {
        transfer.busy = false;
    }
};

type ApplyStatus = { ok: boolean; message: string };
const apply = reactive({
    open: false,
    profile: null as LocalProfile | null,
    selected: [] as string[],
    layout: "",
    busy: false,
    error: "",
    results: {} as Record<string, ApplyStatus>,
});
const { data: sessionIndex } = useNuxtData<{ documents: CvDocumentSummary[] }>("editor-document-list");
const { data: templateIndex } = useNuxtData<{ templates: CvTemplate[] }>("editor-template-list");
const applySessions = computed(() => sessionIndex.value?.documents ?? []);
const applyTemplates = computed(() => templateIndex.value?.templates ?? []);
const sessionLabel = (session: CvDocumentSummary) => session.title?.trim() || session.id;
const openApply = async (profile: LocalProfile) => {
    Object.assign(apply, { open: true, profile, selected: [], layout: "", busy: false, error: "", results: {} });
    await refreshNuxtData("editor-document-list");
};
const closeApply = () => { if (!apply.busy) apply.open = false; };
const toggleAllSessions = () => {
    apply.selected = apply.selected.length === applySessions.value.length ? [] : applySessions.value.map(session => session.id);
};
const runApply = async () => {
    if (!apply.profile) return;
    if (!apply.selected.length) { apply.error = "Choose at least one session."; return; }
    if (!confirm(`Replace the personal content of ${apply.selected.length} session(s) with ${apply.profile.identity.fullName}'s profile?`)) return;
    const [templateId, templateVersion] = apply.layout.split("@");
    apply.busy = true;
    apply.error = "";
    apply.results = {};
    try {
        const output = await $fetch<ApplyCvProfileOutput>("/api/cv-profiles/apply", {
            method: "POST",
            body: {
                profile: toProfileProps(apply.profile),
                profileId: apply.profile.id,
                documentIds: apply.selected,
                template: templateId ? { id: templateId, version: Number(templateVersion) } : undefined,
            },
        });
        apply.results = Object.fromEntries(output.results.map(result => [result.documentId, result.ok
            ? { ok: true, message: "Applied" }
            : { ok: false, message: result.error }]));
        await refreshNuxtData("editor-document-list");
    } catch (cause: any) {
        apply.error = cause?.data?.statusMessage ?? cause?.message ?? "Apply failed.";
    } finally {
        apply.busy = false;
    }
};
</script>

<template>
    <NuxtLayout name="editor" title="Profile editor" app-label="LOCAL" :formatting-enabled="false">
        <template #sidebar>
            <nav class="profiles-list" aria-label="Local profiles">
                <header class="profiles-list__header"><span>Profiles</span></header>
                <button class="profiles-new" type="button" @click="startCreate">＋ New profile</button>
                <div class="profiles-transfer">
                    <button type="button" @click="openTransfer('import')">Import</button>
                    <button type="button" :disabled="!profiles.length" @click="openTransfer('export', profiles)">Export all</button>
                </div>
                <p v-if="!profiles.length" class="profiles-empty">No local profiles yet.</p>
                <button v-for="profile in profiles" :key="profile.id" class="profile-card" :class="{ active: editingId === profile.id }" type="button" @click="startEdit(profile)">
                    <span><strong>{{ profile.identity.fullName }}</strong><small>{{ profile.identity.headline || "No headline" }}</small></span>
                    <span class="profile-delete" role="button" tabindex="0" :aria-label="`Delete ${profile.identity.fullName}`" @click.stop="remove(profile)">×</span>
                </button>
            </nav>
        </template>

        <template #workspace>
            <main class="profiles-page">
            <div class="profiles-mobile-bar">
                <select :value="editingId ?? ''" aria-label="Profile" @change="selectProfile(($event.target as HTMLSelectElement).value)">
                    <option value="" disabled>{{ editingId === "" ? "New profile" : profiles.length ? "Choose a profile…" : "No profiles yet" }}</option>
                    <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.identity.fullName }}</option>
                </select>
                <button type="button" @click="startCreate">＋ New</button>
                <button type="button" @click="openTransfer('import')">Import</button>
            </div>
            <section class="profile-form" @input="markDirty">
                <div v-if="editingId === null" class="profile-placeholder">
                    <p>{{ profiles.length ? "Select a profile or create a new one." : "No local profiles yet." }}</p>
                    <div><button type="button" class="profile-save" @click="startCreate">＋ New profile</button><button type="button" @click="openTransfer('import')">Import</button></div>
                </div>
                <div v-else class="profile-sheet">
                    <header class="profile-toolbar">
                        <div class="profile-toolbar__title">
                            <h1>{{ draft.identity.fullName.trim() || "New profile" }}</h1>
                            <p :class="{ 'profile-toolbar__warn': blank(draft.identity.fullName) || pendingCount }" role="status" aria-live="polite">{{ saveStatus }}</p>
                        </div>
                        <div v-if="currentProfile" class="profile-toolbar__actions">
                            <button type="button" title="Copy this saved profile to the clipboard, encrypted" @click="openTransfer('copy', [currentProfile])">Copy encrypted</button>
                            <button type="button" title="Download this saved profile as an encrypted file" @click="openTransfer('export', [currentProfile])">Export</button>
                            <button type="button" title="Re-render CV sessions with this saved profile" @click="openApply(currentProfile)">Apply to sessions…</button>
                            <button type="button" class="profile-danger" @click="remove(currentProfile)">Delete</button>
                        </div>
                    </header>

                    <div class="profile-identity">
                        <ProfileField class="identity-name" label="Full name" v-bind="field('identity.fullName')">
                            <ProfileInput v-model="draft.identity.fullName" maxlength="120" autocomplete="name" @change="commit('identity.fullName')" />
                        </ProfileField>
                        <ProfileField class="identity-headline" label="Headline" v-bind="field('identity.headline')">
                            <ProfileInput v-model="draft.identity.headline" placeholder="Software engineer, product designer…" @change="commit('identity.headline')" />
                        </ProfileField>
                        <ProfileField class="identity-location" label="Location" v-bind="field('identity.location')">
                            <ProfileInput v-model="draft.identity.location" placeholder="City, Country" @change="commit('identity.location')" />
                        </ProfileField>
                        <ProfileField class="span-all" label="Summary" v-bind="field('identity.summary')">
                            <ProfileInput v-model="draft.identity.summary" multiline placeholder="A few lines about you" @change="commit('identity.summary')" />
                        </ProfileField>
                    </div>

                    <section class="profile-section">
                        <div class="profile-section-heading"><h2>Contact information</h2><button type="button" @click="addEntry('contacts')">＋ Add</button></div>
                        <div v-for="(contact, index) in draft.contacts" :key="index" class="entry-row contact-row" :data-entry="`contacts-${index}`">
                            <ProfileField class="contact-kind" label="Type" v-bind="field(`contacts.${index}.kind`)">
                                <select v-model="contact.kind" @change="commit(`contacts.${index}.kind`)"><option v-for="kind in contactKinds" :key="kind" :value="kind">{{ kind }}</option></select>
                            </ProfileField>
                            <ProfileField class="contact-label" label="Display text" v-bind="field(`contacts.${index}.label`)">
                                <ProfileInput v-model="contact.label" placeholder="Shown on the CV" @change="commit(`contacts.${index}.label`)" />
                            </ProfileField>
                            <ProfileField class="contact-value" label="Value or link" v-bind="field(`contacts.${index}.value`)">
                                <ProfileInput v-model="contact.value" placeholder="name@example.com, https://…" @change="commit(`contacts.${index}.value`)" />
                            </ProfileField>
                            <button type="button" class="entry-remove" aria-label="Remove contact" @click="removeEntry('contacts', index)">×</button>
                        </div>
                    </section>

                    <section class="profile-section">
                        <div class="profile-section-heading"><h2>Experience</h2><button type="button" @click="addEntry('experiences')">＋ Add</button></div>
                        <article v-for="(experience, index) in draft.experiences" :key="index" class="entry-card" :data-entry="`experiences-${index}`">
                            <button type="button" class="entry-remove" aria-label="Remove experience" @click="removeEntry('experiences', index)">×</button>
                            <div class="entry-grid">
                                <ProfileField class="span-2" label="Job title" v-bind="field(`experiences.${index}.title`)"><ProfileInput v-model="experience.title" @change="commit(`experiences.${index}.title`)" /></ProfileField>
                                <ProfileField class="span-2" label="Company" v-bind="field(`experiences.${index}.company`)"><ProfileInput v-model="experience.company" @change="commit(`experiences.${index}.company`)" /></ProfileField>
                                <ProfileField class="span-2" label="Location" v-bind="field(`experiences.${index}.location`)"><ProfileInput v-model="experience.location" @change="commit(`experiences.${index}.location`)" /></ProfileField>
                                <ProfileField label="Start" v-bind="field(`experiences.${index}.start`)"><ProfileInput v-model="experience.start" placeholder="Jan 2024" @change="commit(`experiences.${index}.start`)" /></ProfileField>
                                <ProfileField label="End" v-bind="field(`experiences.${index}.end`)"><ProfileInput v-model="experience.end" placeholder="Present" @change="commit(`experiences.${index}.end`)" /></ProfileField>
                                <ProfileField class="span-all" label="Highlights · one per line" v-bind="field(`experiences.${index}.highlights`)">
                                    <ProfileInput :model-value="experience.highlights.join('\n')" multiline placeholder="What you shipped, owned or improved" @update:model-value="experience.highlights = splitLines($event)" @change="commit(`experiences.${index}.highlights`)" />
                                </ProfileField>
                            </div>
                            <p v-if="entryPending('experiences', index)" class="entry-pending">{{ pendingNote('experiences', index) }}</p>
                        </article>
                    </section>

                    <section class="profile-section">
                        <div class="profile-section-heading"><h2>Skills</h2><button type="button" @click="addEntry('skills')">＋ Add</button></div>
                        <div v-for="(skill, index) in draft.skills" :key="index" class="entry-row skill-row" :data-entry="`skills-${index}`">
                            <ProfileField class="skill-name" label="Group" v-bind="field(`skills.${index}.name`)"><ProfileInput v-model="skill.name" placeholder="Languages" @change="commit(`skills.${index}.name`)" /></ProfileField>
                            <ProfileField class="skill-list" label="Skills · comma-separated" v-bind="field(`skills.${index}.skills`)">
                                <ProfileInput :model-value="skill.skills.join(', ')" placeholder="TypeScript, Go, SQL" @update:model-value="skill.skills = splitList($event)" @change="commit(`skills.${index}.skills`)" />
                            </ProfileField>
                            <button type="button" class="entry-remove" aria-label="Remove skill group" @click="removeEntry('skills', index)">×</button>
                        </div>
                    </section>

                    <section class="profile-section">
                        <div class="profile-section-heading"><h2>Education</h2><button type="button" @click="addEntry('education')">＋ Add</button></div>
                        <article v-for="(education, index) in draft.education" :key="index" class="entry-card" :data-entry="`education-${index}`">
                            <button type="button" class="entry-remove" aria-label="Remove education" @click="removeEntry('education', index)">×</button>
                            <div class="entry-grid">
                                <ProfileField class="span-2" label="Institution" v-bind="field(`education.${index}.school`)"><ProfileInput v-model="education.school" @change="commit(`education.${index}.school`)" /></ProfileField>
                                <ProfileField class="span-2" label="Degree and field of study" v-bind="field(`education.${index}.degree`)"><ProfileInput v-model="education.degree" @change="commit(`education.${index}.degree`)" /></ProfileField>
                                <ProfileField class="span-2" label="Location" v-bind="field(`education.${index}.location`)"><ProfileInput v-model="education.location" @change="commit(`education.${index}.location`)" /></ProfileField>
                                <ProfileField label="Start" v-bind="field(`education.${index}.start`)"><ProfileInput v-model="education.start" @change="commit(`education.${index}.start`)" /></ProfileField>
                                <ProfileField label="End" v-bind="field(`education.${index}.end`)"><ProfileInput v-model="education.end" @change="commit(`education.${index}.end`)" /></ProfileField>
                                <ProfileField class="span-all" label="Details" v-bind="field(`education.${index}.details`)"><ProfileInput v-model="education.details" multiline placeholder="GPA, honours, coursework" @change="commit(`education.${index}.details`)" /></ProfileField>
                            </div>
                            <p v-if="entryPending('education', index)" class="entry-pending">{{ pendingNote('education', index) }}</p>
                        </article>
                    </section>

                    <section class="profile-section">
                        <div class="profile-section-heading"><h2>Projects</h2><button type="button" @click="addEntry('projects')">＋ Add</button></div>
                        <article v-for="(project, index) in draft.projects" :key="index" class="entry-card" :data-entry="`projects-${index}`">
                            <button type="button" class="entry-remove" aria-label="Remove project" @click="removeEntry('projects', index)">×</button>
                            <div class="entry-grid">
                                <ProfileField class="span-2" label="Project name" v-bind="field(`projects.${index}.name`)"><ProfileInput v-model="project.name" @change="commit(`projects.${index}.name`)" /></ProfileField>
                                <ProfileField class="span-2" label="URL" v-bind="field(`projects.${index}.url`)"><ProfileInput v-model="project.url" placeholder="https://…" @change="commit(`projects.${index}.url`)" /></ProfileField>
                                <ProfileField class="span-all" label="Technologies · comma-separated" v-bind="field(`projects.${index}.technologies`)">
                                    <ProfileInput :model-value="project.technologies.join(', ')" @update:model-value="project.technologies = splitList($event)" @change="commit(`projects.${index}.technologies`)" />
                                </ProfileField>
                                <ProfileField class="span-all" label="Description" v-bind="field(`projects.${index}.description`)"><ProfileInput v-model="project.description" multiline @change="commit(`projects.${index}.description`)" /></ProfileField>
                            </div>
                            <p v-if="entryPending('projects', index)" class="entry-pending">{{ pendingNote('projects', index) }}</p>
                        </article>
                    </section>

                    <div class="profile-columns">
                        <section class="profile-section">
                            <div class="profile-section-heading"><h2>Certifications</h2><button type="button" @click="addEntry('certifications')">＋ Add</button></div>
                            <div v-for="(certification, index) in draft.certifications" :key="index" class="entry-row single-row" :data-entry="`certifications-${index}`">
                                <ProfileField :label="`Certification ${index + 1}`" v-bind="field(`certifications.${index}.name`)"><ProfileInput v-model="certification.name" @change="commit(`certifications.${index}.name`)" /></ProfileField>
                                <button type="button" class="entry-remove" aria-label="Remove certification" @click="removeEntry('certifications', index)">×</button>
                            </div>
                        </section>
                        <section class="profile-section">
                            <div class="profile-section-heading"><h2>Languages</h2><button type="button" @click="addEntry('languages')">＋ Add</button></div>
                            <div v-for="(_, index) in draft.languages" :key="index" class="entry-row single-row" :data-entry="`languages-${index}`">
                                <ProfileField :label="`Language ${index + 1}`" v-bind="field(`languages.${index}`)"><ProfileInput v-model="draft.languages[index]" placeholder="English — fluent" @change="commit(`languages.${index}`)" /></ProfileField>
                                <button type="button" class="entry-remove" aria-label="Remove language" @click="removeEntry('languages', index)">×</button>
                            </div>
                        </section>
                    </div>
                </div>
            </section>
            <div v-if="transfer.mode" class="transfer-backdrop" @click.self="closeTransfer" @keydown.esc="closeTransfer">
                <form class="transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title" @submit.prevent="runTransfer">
                    <h2 id="transfer-title">
                        {{ transfer.mode === "import" ? "Import encrypted profiles" : transfer.mode === "copy" ? `Copy ${transferLabel} encrypted` : `Export ${transferLabel} encrypted` }}
                    </h2>
                    <template v-if="transfer.mode === 'import'">
                        <label>Encrypted file<input type="file" :accept="`${PROFILE_FILE_EXTENSION},application/json,text/plain`" @change="readTransferFile"></label>
                        <label>…or paste from clipboard<textarea v-model="transfer.input" rows="4" placeholder="cvsv-profile:…" spellcheck="false" @input="transfer.fileName = ''" /></label>
                        <label>Passphrase<input v-model="transfer.passphrase" type="password" autocomplete="off" autofocus></label>
                    </template>
                    <template v-else>
                        <p class="transfer-hint">Profiles are encrypted in your browser with AES-256-GCM. Anyone with the passphrase can read them; it cannot be recovered.</p>
                        <label>Passphrase<input v-model="transfer.passphrase" type="password" autocomplete="new-password" :minlength="MIN_PASSPHRASE_LENGTH" autofocus></label>
                        <label>Confirm passphrase<input v-model="transfer.confirm" type="password" autocomplete="new-password"></label>
                    </template>
                    <p v-if="transfer.error" class="profile-error" role="alert">{{ transfer.error }}</p>
                    <p v-if="transfer.status" class="transfer-status" role="status">{{ transfer.status }}</p>
                    <footer>
                        <button type="button" :disabled="transfer.busy" @click="closeTransfer">{{ transfer.status ? "Done" : "Cancel" }}</button>
                        <button class="profile-save" type="submit" :disabled="transfer.busy">
                            {{ transfer.busy ? "Working…" : transfer.mode === "import" ? "Decrypt & import" : transfer.mode === "copy" ? "Encrypt & copy" : "Encrypt & download" }}
                        </button>
                    </footer>
                </form>
            </div>
            <div v-if="apply.open" class="transfer-backdrop" @click.self="closeApply" @keydown.esc="closeApply">
                <form class="transfer-dialog apply-dialog" role="dialog" aria-modal="true" aria-labelledby="apply-title" @submit.prevent="runApply">
                    <h2 id="apply-title">Apply {{ apply.profile?.identity.fullName }} to sessions</h2>
                    <p class="transfer-hint">Each selected session keeps its layout (or switches to the chosen template) and gets this profile's personal content. Sessions are updated independently.</p>
                    <label>Layout
                        <select v-model="apply.layout" :disabled="apply.busy">
                            <option value="">Keep each session's layout</option>
                            <option v-for="template in applyTemplates" :key="`${template.id}@${template.version}`" :value="`${template.id}@${template.version}`">{{ template.name }} v{{ template.version }}</option>
                        </select>
                    </label>
                    <div class="apply-sessions">
                        <button type="button" class="apply-select-all" :disabled="apply.busy || !applySessions.length" @click="toggleAllSessions">
                            {{ apply.selected.length === applySessions.length && applySessions.length ? "Clear selection" : "Select all" }}
                        </button>
                        <p v-if="!applySessions.length" class="transfer-hint">No sessions yet.</p>
                        <label v-for="session in applySessions" :key="session.id" class="apply-session">
                            <input v-model="apply.selected" type="checkbox" :value="session.id" :disabled="apply.busy">
                            <span>{{ sessionLabel(session) }}</span>
                            <small v-if="apply.results[session.id]" :class="apply.results[session.id]!.ok ? 'transfer-status' : 'profile-error'">{{ apply.results[session.id]!.message }}</small>
                        </label>
                    </div>
                    <p v-if="apply.error" class="profile-error" role="alert">{{ apply.error }}</p>
                    <footer>
                        <button type="button" :disabled="apply.busy" @click="closeApply">{{ Object.keys(apply.results).length ? "Done" : "Cancel" }}</button>
                        <button class="profile-save" type="submit" :disabled="apply.busy || !apply.selected.length">{{ apply.busy ? "Applying…" : `Apply to ${apply.selected.length || ""} session${apply.selected.length === 1 ? "" : "s"}` }}</button>
                    </footer>
                </form>
            </div>
            </main>
        </template>
    </NuxtLayout>
</template>

<style scoped>
.profiles-page { grid-column: 1 / -1; display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; height: 100%; overflow: hidden; background: var(--bg-base, #111); color: var(--fg-text, #ddd); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.profiles-list { box-sizing: border-box; height: 100%; padding: 14px 12px; overflow: auto; background: var(--bg-mantle, #171717); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.profiles-list__header { margin: 0 4px 12px; color: var(--fg-subtext0, #888); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
.profiles-new, .profile-card { width: 100%; border: 1px solid var(--border, #333); border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.profiles-new { padding: 9px; margin-bottom: 12px; }
.profiles-new:hover, .profile-card:hover, .profile-card.active { border-color: var(--accent, #89b4fa); background: var(--bg-surface0, #242424); }
.profiles-empty { color: var(--fg-subtext0, #888); font-size: 11px; }
.profile-card { display: flex; justify-content: space-between; gap: 8px; padding: 10px; margin-bottom: 7px; }
.profile-card span:first-child { display: grid; min-width: 0; gap: 4px; }
.profile-card strong, .profile-card small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-card small { color: var(--fg-subtext0, #888); font-size: 10px; }
.profile-delete { padding: 0 3px; color: var(--fg-subtext0, #888); }

/* Shared controls */
.profiles-page button { border: 1px solid var(--border, #333); border-radius: 3px; padding: 6px 10px; background: transparent; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
.profiles-page button:hover { border-color: var(--accent, #89b4fa); }
.profiles-page .profile-save { border-color: var(--accent, #89b4fa); background: var(--accent, #89b4fa); color: #111; }
.profiles-page .profile-danger:hover { border-color: var(--danger, #f38ba8); color: var(--danger, #f38ba8); }
.profiles-page select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 34px; padding: 7px 8px; border: 1px solid var(--border, #333); border-radius: 3px; outline: none; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; }
.profiles-page select:focus { border-color: var(--accent, #89b4fa); }

/* The layout hides the profile sidebar on narrow screens; this bar replaces it there. */
.profiles-mobile-bar { display: none; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border, #333); background: var(--bg-mantle, #171717); }
@media (max-width: 900px) { .profiles-mobile-bar { display: grid; } }

.profile-form { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.profile-placeholder { display: grid; align-content: center; justify-items: center; gap: 14px; min-height: 100%; padding: 24px 16px; box-sizing: border-box; color: var(--fg-subtext0, #888); text-align: center; }
.profile-placeholder p { margin: 0; }
.profile-placeholder div { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

.profile-sheet { container: sheet / inline-size; box-sizing: border-box; width: 100%; max-width: 920px; margin: 0 auto; padding: 0 28px 40px; }
.profile-toolbar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin: 0 -28px 18px; padding: 16px 28px 12px; border-bottom: 1px solid var(--border, #333); background: var(--bg-base, #111); }
.profile-toolbar__title { min-width: 0; }
.profile-toolbar h1 { margin: 0; overflow-wrap: anywhere; font-size: 15px; font-weight: 600; }
.profile-toolbar p { margin: 4px 0 0; color: var(--fg-subtext0, #888); font-size: 11px; }
.profile-toolbar .profile-toolbar__warn { color: var(--warning, #f9e2af); }
.profile-toolbar__actions { display: flex; flex-wrap: wrap; gap: 6px; }

.profile-identity { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px 14px; }
.profile-section { min-width: 0; margin-top: 22px; }
.profile-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border, #333); }
.profile-section-heading h2 { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; }
.profile-section-heading button { padding: 4px 9px; }

.entry-row, .entry-grid { display: grid; gap: 10px 12px; }
.entry-row { margin-bottom: 10px; }
.entry-card { position: relative; margin-bottom: 10px; padding: 12px; border: 1px solid var(--border, #333); border-radius: 4px; background: color-mix(in srgb, var(--bg-mantle, #171717) 45%, transparent); }
.entry-card .entry-remove { position: absolute; top: 6px; right: 6px; }
.entry-card .entry-grid { padding-right: 0; }
.entry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.span-2, .span-all { grid-column: 1 / -1; }
.entry-remove { align-self: end; width: 34px; height: 34px; padding: 0 !important; color: var(--fg-subtext0, #888) !important; line-height: 1; }
.entry-card .entry-remove { width: 24px; height: 24px; border-color: transparent !important; }
.entry-remove:hover { border-color: var(--danger, #f38ba8) !important; color: var(--danger, #f38ba8) !important; }
.entry-pending { margin: 10px 0 0; color: var(--warning, #f9e2af); font-size: 11px; }

/* Narrow: stack every row, keep the remove button beside the first field. */
.contact-row { grid-template-columns: minmax(0, 1fr) auto; }
.contact-row .contact-kind { grid-column: 1; grid-row: 1; }
.contact-row .entry-remove { grid-column: 2; grid-row: 1; }
.contact-row .contact-label, .contact-row .contact-value { grid-column: 1 / -1; }
.skill-row { grid-template-columns: minmax(0, 1fr) auto; }
.skill-row .skill-list { grid-column: 1 / -1; }
.single-row { grid-template-columns: minmax(0, 1fr) auto; }
.profile-columns { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 24px; }
.contact-row + .contact-row, .skill-row + .skill-row { padding-top: 10px; border-top: 1px dashed var(--border, #333); }

@container sheet (min-width: 520px) {
    .profile-identity { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .identity-location { grid-column: 1 / -1; }
    .entry-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .span-2 { grid-column: span 2; }
    .profile-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container sheet (min-width: 560px) {
    .contact-row { grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1.25fr) auto; }
    .contact-row .contact-kind, .contact-row .contact-label, .contact-row .contact-value, .contact-row .entry-remove { grid-column: auto; grid-row: auto; }
    .skill-row { grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) auto; }
    .skill-row .skill-name, .skill-row .skill-list { grid-column: auto; grid-row: auto; }
    .skill-row .entry-remove { grid-column: 3; grid-row: 1; }
    .contact-row + .contact-row, .skill-row + .skill-row { padding-top: 0; border-top: 0; }
}
@container sheet (min-width: 780px) {
    .profile-identity { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .identity-location { grid-column: auto; }
}
@media (max-width: 560px) {
    .profile-sheet { padding: 0 16px 32px; }
    .profile-toolbar { margin: 0 -16px 14px; padding: 12px 16px 10px; }
    .profile-toolbar__actions { width: 100%; }
    .profile-toolbar__actions button { flex: 1 1 auto; }
    .profiles-mobile-bar { padding: 10px 16px; }
}

.profiles-transfer { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: -4px 0 12px; }
.profiles-transfer button, .transfer-dialog footer button { border: 1px solid var(--border, #333); border-radius: 3px; padding: 6px 9px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.profiles-transfer button:disabled, .transfer-dialog button:disabled { opacity: .5; cursor: default; }
.transfer-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / .55); }
.transfer-dialog { box-sizing: border-box; width: min(460px, 100%); padding: 20px; border: 1px solid var(--border, #333); border-radius: 6px; background: var(--bg-base, #111); }
.transfer-dialog h2 { margin: 0 0 14px; font-size: 13px; font-weight: 500; }
.transfer-dialog label { display: grid; gap: 6px; margin-bottom: 12px; color: var(--fg-subtext1, #aaa); font-size: 11px; }
.transfer-dialog input, .transfer-dialog textarea { min-width: 0; padding: 8px; border: 1px solid var(--border, #333); border-radius: 3px; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; resize: vertical; }
.transfer-hint { margin: 0 0 12px; color: var(--fg-subtext0, #888); font-size: 11px; line-height: 1.5; }
.transfer-status { color: var(--success, #a6e3a1); }
.transfer-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.transfer-dialog footer .profile-save { border-color: var(--accent, #89b4fa); background: var(--accent, #89b4fa); color: #111; }
.profile-error { color: var(--danger, #f38ba8); }
.apply-dialog { width: min(520px, 100%); }
.apply-dialog select { min-width: 0; padding: 8px; border: 1px solid var(--border, #333); border-radius: 3px; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; }
.apply-sessions { display: grid; gap: 2px; max-height: 280px; margin-bottom: 12px; overflow: auto; }
.apply-select-all { justify-self: start; margin-bottom: 6px; border: 1px solid var(--border, #333); border-radius: 3px; padding: 4px 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.transfer-dialog .apply-session { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; margin: 0; padding: 4px 2px; color: var(--fg-text, #ddd); font-size: 12px; }
.apply-session span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
