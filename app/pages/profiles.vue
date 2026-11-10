<script setup lang="ts">
import { toRaw } from "vue";
import type { CvContactKind, CvDocumentProps, CvDocumentSummary, CvProfileProps, CvTemplate } from "@ruxt/shared/cv";
import { mapProfileApplyResults, profileApplyErrorMessage, type ProfileApplyResponse, type ProfileApplyStatus } from "~/utils/profileApplyResults";
import { composeCvMarkdown, normalizeCvProfile, toCvTemplateSkeleton } from "@ruxt/shared/cv";
import { localCvStore } from "~/utils/localCvStore";
import { type LocalProfile, newLocalProfileId, orderLocalProfiles, readLocalProfiles, saveLocalProfile, writeLocalProfiles } from "~/utils/localProfiles";
import { parseTechnologies } from "~/utils/technologies";
import { downloadBlob, safeFilename } from "~/utils/exportCvImage";
import {
    MIN_PASSPHRASE_LENGTH, PROFILE_FILE_EXTENSION, ProfileTransferError,
    decryptProfiles, encryptProfiles, envelopeToFile, envelopeToToken,
} from "~/utils/profileTransfer";

type LocalProfileInput = CvProfileProps;

definePageMeta({ layout: false, public: true, path: "/p", editorContext: "profiles" });
useSeoMeta({ title: "Profile editor", ogTitle: "Profile editor" });

const profiles = ref<LocalProfile[]>([]);
/** `null` = nothing open, `""` = a new profile that has not been stored yet. */
const editingId = ref<string | null>(null);
const emptyProfile = (): LocalProfileInput => normalizeCvProfile({});
const draft = ref<LocalProfileInput>(emptyProfile());
const currentProfile = computed(() => profiles.value.find(item => item.id === editingId.value) ?? null);
const editorChrome = useEditorChrome();

/** Card order. Fixed while a profile is edited, so saving never makes the open card jump to the top. */
const listOrder = ref<string[]>([]);
const readProfiles = (resort = false) => {
    const stored = readLocalProfiles();
    if (resort) listOrder.value = stored.map(item => item.id);
    profiles.value = orderLocalProfiles(stored, listOrder.value);
    if (!resort) listOrder.value = profiles.value.map(item => item.id);
};
const persist = (items: LocalProfile[]) => {
    writeLocalProfiles(items);
    readProfiles();
};

// Fields are click-to-edit; each one saves on its own when its edit is committed. Whether that happens
// while typing or only on an explicit Save is the `profileSaveMode` preference.
const { preferences, load: loadPreferences, signedIn } = usePreferences();
const appDialog = useAppDialog();
const toast = useToast();
const saveMode = computed(() => preferences.value.profileSaveMode);
type EntrySection = "contacts" | "experiences" | "skills" | "certifications" | "education" | "projects" | "languages";
const touched = reactive(new Set<string>());
const savedFlash = reactive<Record<string, number>>({});
const lastSavedAt = ref<number | null>(null);
/** Manual-mode fields with edits that are neither saved nor cancelled. */
const unsavedKeys = reactive(new Set<string>());
/** The field to open for editing as soon as it renders (new profile, added entry). */
const autoEditKey = ref<string | null>(null);
/** Bumped on profile switch so no field keeps an edit buffer from the previous profile. */
const formKey = ref(0);

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

/** Props for an `EditableField`: save mode, save flash, validation error once committed, and auto-open. */
const field = (key: string) => {
    // Capture this render's form, not the mutable selected ID. During DOM removal an old
    // textarea can blur after startEdit has replaced both the selected ID and the draft.
    const generation = formKey.value;
    const owner = draft.value;
    const isCurrent = () => generation === formKey.value && owner === draft.value;
    return {
        mode: saveMode.value,
        saved: Boolean(savedFlash[key]),
        error: touched.has(key) ? issues.value[key] : undefined,
        startEditing: autoEditKey.value === key,
        isCurrent,
        onDirty: (dirty: boolean) => { if (!isCurrent()) return; if (dirty) unsavedKeys.add(key); else unsavedKeys.delete(key); },
    };
};

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
const persistDraft = (ownerId = editingId.value): boolean => {
    if (ownerId === null || ownerId !== editingId.value || blank(draft.value.identity.fullName)) return false;
    const saved = saveLocalProfile(savableDraft(), ownerId || undefined);
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
    const ownerId = editingId.value;
    touched.add(key);
    if (!persistDraft(ownerId) || issues.value[key]) return;
    const [section, index] = key.split(".");
    if (/^\d+$/.test(index ?? "") && entryPending(section as EntrySection, Number(index))) return;
    flash(key);
};
const resetFieldState = () => {
    touched.clear();
    unsavedKeys.clear();
    for (const key of Object.keys(savedFlash)) delete savedFlash[key];
    lastSavedAt.value = null;
    autoEditKey.value = null;
    formKey.value++;
};
const confirmDiscard = async () => !unsavedKeys.size || await appDialog.confirm({
    title: "Discard unsaved changes?",
    message: `Discard ${unsavedKeys.size} unsaved ${unsavedKeys.size === 1 ? "edit" : "edits"}?`,
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
    danger: true,
});
const warnUnsaved = (event: BeforeUnloadEvent) => {
    if (!unsavedKeys.size) return;
    event.preventDefault();
    event.returnValue = "";
};

const profileSections = [
    { id: "identity", label: "Identity" },
    { id: "about", label: "About" },
    { id: "contact", label: "Contact" },
    { id: "experience", label: "Experience" },
    { id: "skills", label: "Skills" },
    { id: "education", label: "Education" },
    { id: "projects", label: "Projects" },
    { id: "certifications", label: "Certifications" },
    { id: "languages", label: "Languages" },
] as const;
type ProfileSectionId = typeof profileSections[number]["id"];
const activeSection = ref<ProfileSectionId>("identity");
let sectionObserver: IntersectionObserver | null = null;
const setupSectionObserver = async () => {
    sectionObserver?.disconnect();
    sectionObserver = null;
    await nextTick();
    if (editingId.value === null || typeof IntersectionObserver === "undefined") return;
    const scroller = document.querySelector(".profile-form");
    const sections = document.querySelectorAll<HTMLElement>("[data-profile-section]");
    if (!scroller || !sections.length) return;
    sectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) activeSection.value = entry.target.getAttribute("data-profile-section") as ProfileSectionId;
        }
    }, { root: scroller, rootMargin: "-170px 0px -55% 0px", threshold: 0 });
    sections.forEach((section) => sectionObserver?.observe(section));
};
const scrollToSection = (id: ProfileSectionId) => {
    activeSection.value = id;
    document.querySelector(`[data-profile-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

onMounted(() => {
    readProfiles(true);
    loadPreferences();
    setupSectionObserver();
    window.addEventListener("beforeunload", warnUnsaved);
});
onBeforeUnmount(() => {
    sectionObserver?.disconnect();
    window.removeEventListener("beforeunload", warnUnsaved);
    editorChrome.clear();
});
watch(signedIn, loadPreferences);
watch(editingId, setupSectionObserver);

const startCreate = async () => {
    if (!await confirmDiscard()) return;
    resetFieldState();
    editingId.value = "";
    draft.value = emptyProfile();
    autoEditKey.value = "identity.fullName";
};
const startEdit = async (profile: LocalProfile, discardConfirmed = false) => {
    if (profile.id === editingId.value || (!discardConfirmed && !await confirmDiscard())) return;
    resetFieldState();
    const cloned = structuredClone(toRaw(profile));
    const { id: _id, createdAt: _createdAt, updatedAt, ...profileValue } = cloned;
    draft.value = profileValue;
    editingId.value = profile.id;
    lastSavedAt.value = updatedAt;
};
const duplicateName = (profile: LocalProfile) => profiles.value.some(item => item.id !== profile.id && item.identity.fullName.trim().toLocaleLowerCase() === profile.identity.fullName.trim().toLocaleLowerCase());
/** Sidebar primary line: the editable profile label when w-server's label field is present, else the headline, else the CV full name. */
const profileLabel = (profile: LocalProfile) => (profile as { label?: string }).label?.trim() || profile.identity.headline?.trim() || profile.identity.fullName;
const profileDate = (timestamp: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
const openMenuId = ref<string | null>(null);
const toggleProfileMenu = (profile: LocalProfile) => { openMenuId.value = openMenuId.value === profile.id ? null : profile.id; };
const closeProfileMenu = () => { openMenuId.value = null; };
const profileMenuAction = async (action: (profile: LocalProfile) => Promise<void>, profile: LocalProfile) => { closeProfileMenu(); await action(profile); };
const onProfileMenuKeydown = (event: KeyboardEvent, profile: LocalProfile) => {
    if (event.key !== "Escape") return;
    closeProfileMenu();
    document.getElementById(`profile-menu-button-${profile.id}`)?.focus();
};
const onDocumentPointerDown = (event: PointerEvent) => {
    if (!openMenuId.value) return;
    if ((event.target as Element | null)?.closest?.(".profile-card__menu-wrap")) return;
    closeProfileMenu();
};
onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
const renameProfile = async (profile: LocalProfile) => {
    const response = await appDialog.prompt({
        title: "Rename profile",
        message: "Choose a name for this profile.",
        label: "Profile name",
        initial: profile.identity.fullName,
        confirmLabel: "Save name",
        validate: value => value.trim() ? null : "Enter a profile name.",
    });
    const name = response?.trim();
    if (!name || name === profile.identity.fullName) return;
    if (profiles.value.some(item => item.id !== profile.id && item.identity.fullName.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
        && !await appDialog.confirm({
            title: "Keep duplicate profile name?",
            message: `Another profile is already named “${name}”.`,
            confirmLabel: "Keep duplicate name",
            cancelLabel: "Choose another name",
        })) return;
    const updated = { ...profile, identity: { ...profile.identity, fullName: name }, updatedAt: Date.now() };
    persist(profiles.value.map(item => item.id === profile.id ? updated : item));
    if (editingId.value === profile.id) { draft.value.identity.fullName = name; lastSavedAt.value = updated.updatedAt; }
};
const duplicateProfile = async (profile: LocalProfile) => {
    if (!await confirmDiscard()) return;
    const base = profile.identity.fullName;
    const taken = new Set(profiles.value.map(item => item.identity.fullName.trim().toLocaleLowerCase()));
    let candidate = `${base} (copy)`;
    for (let n = 2; taken.has(candidate.toLocaleLowerCase()); n++) candidate = `${base} (copy ${n})`;
    const props = toProfileProps(profile);
    props.identity = { ...props.identity, fullName: candidate };
    const copy = saveLocalProfile(props);
    readProfiles();
    toast.push("Profile duplicated", { tone: "success" });
    await startEdit(copy, true);
};
const remove = async (profile: LocalProfile) => {
    if (!await appDialog.confirm({
        title: "Delete profile?",
        message: `Delete ${profile.identity.fullName}'s profile — ${profile.identity.headline || "No headline"}? This cannot be undone.`,
        confirmLabel: "Delete profile",
        cancelLabel: "Keep profile",
        danger: true,
    })) return;
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
    certifications: () => ({ name: "", issuer: "", start: "", end: "" }),
    education: () => ({ school: "", degree: "", location: "", start: "", end: "", details: "" }),
    projects: () => ({ name: "", url: "", description: "", technologies: [] }),
    languages: () => "",
};
const firstFields: Record<EntrySection, string> = {
    contacts: "value", experiences: "title", skills: "name", certifications: "name", education: "school", projects: "name", languages: "",
};
const addEntry = (section: EntrySection) => {
    const entries = draft.value[section] as unknown[];
    entries.push(newEntries[section]());
    autoEditKey.value = [section, entries.length - 1, firstFields[section]].filter(part => part !== "").join(".");
};
const removeEntry = (section: EntrySection, index: number) => {
    (draft.value[section] as unknown[]).splice(index, 1);
    for (const key of [...touched]) if (key.startsWith(`${section}.`)) touched.delete(key);
    for (const key of [...unsavedKeys]) if (key.startsWith(`${section}.`)) unsavedKeys.delete(key);
    for (const key of Object.keys(savedFlash)) if (key.startsWith(`${section}.`)) delete savedFlash[key];
    persistDraft();
};
const pendingSections: Exclude<EntrySection, "languages">[] = ["contacts", "experiences", "skills", "certifications", "education", "projects"];
const cancelAllPending = async () => {
    if (!pendingCount.value) return;
    if (!await appDialog.confirm({
        title: "Cancel all incomplete entries?",
        message: `${pendingCount.value} incomplete ${pendingCount.value === 1 ? "entry isn't" : "entries aren't"} saved yet. Cancelling removes ${pendingCount.value === 1 ? "it" : "them"} from this profile; saved entries won't change.`,
        confirmLabel: "Cancel all incomplete",
        cancelLabel: "Keep editing",
        danger: true,
    })) return;
    for (const section of pendingSections) {
        const entries = draft.value[section] as unknown[];
        let removedAny = false;
        for (let index = entries.length - 1; index >= 0; index--) {
            if (!entryPending(section, index)) continue;
            entries.splice(index, 1);
            removedAny = true;
        }
        if (!removedAny) continue;
        for (const key of [...touched]) if (key.startsWith(`${section}.`)) touched.delete(key);
        for (const key of [...unsavedKeys]) if (key.startsWith(`${section}.`)) unsavedKeys.delete(key);
        for (const key of Object.keys(savedFlash)) if (key.startsWith(`${section}.`)) delete savedFlash[key];
        if (autoEditKey.value?.startsWith(`${section}.`)) autoEditKey.value = null;
    }
    persistDraft();
};
const splitList = parseTechnologies;
const splitLines = (value: string) => value.split("\n").filter(line => line.trim());
const contactKinds: CvContactKind[] = ["email", "phone", "linkedin", "github", "website", "other"];

const saveStatus = computed(() => {
    if (unsavedKeys.size) return `${unsavedKeys.size} unsaved ${unsavedKeys.size === 1 ? "edit" : "edits"} — Save or Cancel ${unsavedKeys.size === 1 ? "it" : "each one"}.`;
    if (blank(draft.value.identity.fullName)) return editingId.value ? "Add a full name to keep saving." : "Add a full name to start saving.";
    if (pendingCount.value) return `${pendingCount.value} incomplete ${pendingCount.value === 1 ? "entry isn't" : "entries aren't"} saved yet.`;
    if (!lastSavedAt.value) return "Click a field to edit it.";
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
const transferDialogElement = ref<HTMLElement | null>(null);
useModalBehavior({ isOpen: () => transfer.mode !== null, onClose: closeTransfer, container: () => transferDialogElement.value });
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

const apply = reactive({
    open: false,
    profile: null as LocalProfile | null,
    selected: [] as string[],
    layout: "",
    busy: false,
    error: "",
    results: {} as Record<string, ProfileApplyStatus>,
    confirmed: false,
    previews: {} as Record<string, { before: { markdown: string; css: string; revision: number }; after: { markdown: string; css: string } }>,
    previewProfile: null as LocalProfile | null,
    undoable: {} as Record<string, { revision: number; markdown: string; css: string }>,

});
const sessionActions = useCvSessionActions();
const { data: templateIndex } = useNuxtData<{ templates: CvTemplate[] }>("editor-template-list");
const applySessions = sessionActions.documents;
const applyTemplates = computed(() => templateIndex.value?.templates ?? []);
const sessionLabel = (session: CvDocumentSummary) => session.title?.trim() || session.id;
const openApply = async (profile: LocalProfile) => {
    Object.assign(apply, { open: true, profile, selected: [], layout: "", busy: false, error: "", results: {}, confirmed: false, previews: {}, undoable: {} });
    sessionActions.reloadDocuments();
};
const closeApply = () => { if (!apply.busy) apply.open = false; };
const applyDialogElement = ref<HTMLElement | null>(null);
useModalBehavior({ isOpen: () => apply.open, onClose: closeApply, container: () => applyDialogElement.value });
const toggleAllSessions = () => {
    apply.selected = apply.selected.length === applySessions.value.length ? [] : applySessions.value.map(session => session.id);
};
watch(() => [apply.selected.join("|"), apply.layout, apply.profile?.id].join(";"), () => {
    apply.previews = {}; apply.previewProfile = null; apply.confirmed = false;
});
const previewApply = async () => {
    if (!apply.profile || !apply.selected.length) { apply.error = "Choose at least one session."; return; }
    const profileSnapshot = structuredClone(toRaw(apply.profile));
    apply.previewProfile = profileSnapshot;
    apply.busy = true; apply.error = ""; apply.previews = {}; apply.confirmed = false;
    const [templateId, templateVersion] = apply.layout.split("@");
    try {
        for (const id of apply.selected) {
            const before = localCvStore.get(id);
            if (!before) throw new Error("Session not found in this browser.");
            const template = templateId ? applyTemplates.value.find(item => item.id === templateId && item.version === Number(templateVersion)) : null;
            if (templateId && !template) throw new Error("Template not found.");
            const after = {
                markdown: composeCvMarkdown(template?.markdownSkeleton ?? toCvTemplateSkeleton(before.markdown), toProfileProps(profileSnapshot)),
                css: template?.css ?? before.css,
            };
            apply.previews[id] = { before, after };
        }
    } catch (cause: any) { apply.previews = {}; apply.previewProfile = null; apply.error = cause?.data?.statusMessage ?? cause?.message ?? "Preview failed."; }
    finally { apply.busy = false; }
};
const undoApply = async (id: string) => {
    const previous = apply.previews[id]?.before;
    const currentRevision = apply.undoable[id]?.revision;
    if (!previous || !currentRevision) return;
    apply.busy = true;
    try {
        if (localCvStore.get(id)?.revision !== currentRevision) throw new Error("Session changed since applying the profile.");
        const restored = localCvStore.save(id, { markdown: previous.markdown, css: previous.css });
        if (!restored) throw new Error("Browser storage refused the write.");
        delete apply.undoable[id];
        apply.results[id] = { ok: true, message: `Restored previous content (revision ${restored.revision})` };
        sessionActions.upsertDocument(restored);
    } catch (cause: any) { apply.error = cause?.data?.statusMessage ?? cause?.message ?? "Undo failed."; }
    finally { apply.busy = false; }
};
const runApply = async () => {
    if (!apply.previewProfile) return;
    if (!apply.selected.length) { apply.error = "Choose at least one session."; return; }
    if (!apply.confirmed || apply.selected.some(id => !apply.previews[id])) { apply.error = "Review the preview and confirm the overwrite first."; return; }
    const [templateId, templateVersion] = apply.layout.split("@");
    apply.busy = true;
    apply.error = "";
    apply.results = {};
    try {
        const output: ProfileApplyResponse = { applied: 0, failed: 0, results: [] };
        for (const id of apply.selected) {
            try {
                const preview = apply.previews[id]!;
                if (localCvStore.get(id)?.revision !== preview.before.revision) throw new Error("Session changed since the preview. Review it again.");
                const document = localCvStore.save(id, preview.after);
                if (!document) throw new Error("Browser storage refused the write.");
                output.results.push({ documentId: id, ok: true, document });
                output.applied++;
            } catch (cause: any) {
                output.results.push({ documentId: id, ok: false, error: cause?.message ?? "Profile switch failed." });
                output.failed++;
            }
        }
        apply.results = mapProfileApplyResults(output);
        for (const result of output.results) if (result.ok) {
            sessionActions.upsertDocument(result.document);
            if (apply.previews[result.documentId]) apply.undoable[result.documentId] = { ...apply.previews[result.documentId]!.before, revision: result.document.revision };
        }
    } catch (cause: any) {
        apply.error = profileApplyErrorMessage(cause);
    } finally {
        apply.busy = false;
    }
};

// Publish the open profile into the global editor header; the layout renders
// the title, save status and actions and owns the overflow menu.
watchEffect(() => {
    const profile = currentProfile.value;
    if (!profile) {
        editorChrome.clear();
        return;
    }
    const saved = !unsavedKeys.size && !blank(draft.value.identity.fullName) && !pendingCount.value && !!lastSavedAt.value;
    editorChrome.publish({
        title: profileLabel(profile),
        saveStatus: { kind: saved ? "saved" : "saving", label: saveStatus.value },
        actions: [
            { id: "export", label: "Export", primary: true, ariaLabel: `Export ${profile.identity.fullName} as an encrypted file`, action: () => openTransfer("export", [profile]) },
            { id: "copy-encrypted", label: "Copy encrypted", action: () => openTransfer("copy", [profile]) },
            { id: "apply-to-sessions", label: "Apply to sessions…", action: () => { void openApply(profile); } },
            { id: "duplicate", label: "Duplicate", action: () => { void duplicateProfile(profile); } },
            ...Object.keys(apply.undoable).map(id => ({
                id: `undo-apply-${id}`,
                label: `Undo ${sessionLabel(applySessions.value.find(item => item.id === id) ?? { id, title: id, revision: 0, updatedAt: "" })}`,
                disabled: apply.busy,
                action: () => { void undoApply(id); },
            })),
            { id: "delete", label: "Delete", danger: true, dividerBefore: true, ariaLabel: `Delete ${profile.identity.fullName}'s profile`, action: () => { void remove(profile); } },
        ],
    });
});
</script>

<template>
    <NuxtLayout name="editor" title="Profile editor" app-label="LOCAL">
        <template #sidebar>
            <nav class="profiles-list" aria-label="Local profiles">
                <header class="profiles-list__header"><span>Profiles</span></header>
                <button class="profiles-new" type="button" @click="startCreate">＋ New profile</button>
                <div class="profiles-transfer">
                    <button type="button" @click="openTransfer('import')">Import</button>
                    <button type="button" :disabled="!profiles.length" @click="openTransfer('export', profiles)">Export all</button>
                </div>
                <article v-if="editingId === ''" class="profile-card profile-card--draft active">
                    <div class="profile-card__select"><strong>{{ draft.identity.fullName || "Untitled profile" }} <em class="draft-badge">Draft</em></strong><small class="profile-card__headline">{{ draft.identity.headline || "No headline" }}</small><small>{{ blank(draft.identity.fullName) ? "Not saved yet — add a full name to save it." : "Not saved yet." }}</small></div>
                </article>
                <article v-for="profile in profiles" :key="profile.id" class="profile-card" :class="{ active: editingId === profile.id }" @keydown="onProfileMenuKeydown($event, profile)">
                    <button class="profile-card__select" type="button" :title="`Profile ID: ${profile.id}`" @click="closeProfileMenu(); startEdit(profile)"><strong class="profile-card__label">{{ profileLabel(profile) }}</strong><em v-if="duplicateName(profile)" class="duplicate-warning">Duplicate name</em><small class="profile-card__meta">{{ profile.identity.fullName }} · {{ profile.projects.length }} projects · {{ profileDate(profile.updatedAt) }}</small></button>
                    <div class="profile-card__menu-wrap"><button :id="`profile-menu-button-${profile.id}`" class="profile-card__menu-button" type="button" aria-haspopup="menu" :aria-expanded="openMenuId === profile.id" :aria-label="`Actions for ${profileLabel(profile)}`" @click.stop="toggleProfileMenu(profile)">…</button><div v-if="openMenuId === profile.id" class="profile-card__menu" role="menu"><button type="button" role="menuitem" @click="profileMenuAction(renameProfile, profile)">Rename</button><button type="button" role="menuitem" @click="profileMenuAction(duplicateProfile, profile)">Duplicate</button><hr class="profile-card__menu-divider"><button class="profile-delete" type="button" role="menuitem" :aria-label="`Delete ${profile.identity.fullName}`" @click="profileMenuAction(remove, profile)">Delete</button></div></div>
                </article>
            </nav>
        </template>

        <template #workspace>
            <main class="profiles-page">
            <section class="profile-form">
                <div v-if="editingId === null" class="profile-placeholder">
                    <p>{{ profiles.length ? "Select a profile or create a new one." : "No local profiles yet." }}</p>
                    <div><button type="button" class="profile-save" @click="startCreate">＋ New profile</button><button type="button" @click="openTransfer('import')">Import</button></div>
                </div>
                <div v-else :key="formKey" class="profile-sheet">
                    <nav class="profile-section-nav" aria-label="Profile sections">
                        <button v-for="section in profileSections" :key="section.id" type="button" :class="{ active: activeSection === section.id }" :aria-current="activeSection === section.id ? 'true' : undefined" @click="scrollToSection(section.id)">{{ section.label }}</button>
                    </nav>

                    <div v-if="pendingCount" class="profile-pending-bar">
                        <span>{{ pendingCount }} incomplete {{ pendingCount === 1 ? "entry isn't" : "entries aren't" }} saved yet — finish the missing fields or cancel {{ pendingCount === 1 ? "it" : "them" }}.</span>
                        <button type="button" @click="cancelAllPending">Cancel all incomplete</button>
                    </div>

                    <section class="profile-section profile-name-section" data-profile-section="identity">
                        <div class="profile-section-heading"><h2>Profile identity</h2></div>
                        <EditableField class="identity-name" label="Full name" placeholder="Your name" maxlength="120" autocomplete="name" v-bind="field('identity.fullName')" :model-value="draft.identity.fullName" @commit="draft.identity.fullName = $event; commit('identity.fullName')" />
                    </section>

                    <section class="profile-section" data-profile-section="about">
                        <div class="profile-section-heading"><h2>About</h2></div>
                        <div class="profile-identity">
                            <EditableField class="identity-headline" label="Headline" placeholder="Software engineer, product designer…" optional v-bind="field('identity.headline')" :model-value="draft.identity.headline" @commit="draft.identity.headline = $event; commit('identity.headline')" />
                            <EditableField class="identity-location" label="Location" placeholder="City, Country" v-bind="field('identity.location')" :model-value="draft.identity.location" @commit="draft.identity.location = $event; commit('identity.location')" />
                            <EditableField class="span-all" label="Summary" placeholder="A few lines about you" multiline optional v-bind="field('identity.summary')" :model-value="draft.identity.summary" @commit="draft.identity.summary = $event; commit('identity.summary')" />
                        </div>
                    </section>

                    <section class="profile-section" data-profile-section="contact">
                        <div class="profile-section-heading"><h2>Contact information</h2><button type="button" @click="addEntry('contacts')">＋ Add</button></div>
                        <div v-for="(contact, index) in draft.contacts" :key="index" class="entry-row contact-row" :data-entry="`contacts-${index}`">
                            <EditableField class="contact-kind" label="Type" :options="contactKinds" v-bind="field(`contacts.${index}.kind`)" :model-value="contact.kind" @commit="contact.kind = $event as CvContactKind; commit(`contacts.${index}.kind`)" />
                            <EditableField class="contact-value" label="Value or link" placeholder="name@example.com, https://…" v-bind="field(`contacts.${index}.value`)" :model-value="contact.value" @commit="contact.value = $event; commit(`contacts.${index}.value`)" />
                            <EditableField class="contact-label" label="Display text" placeholder="Same as value" optional v-bind="field(`contacts.${index}.label`)" :model-value="contact.label" @commit="contact.label = $event; commit(`contacts.${index}.label`)" />
                            <button type="button" class="entry-remove" :aria-label="'Remove contact ' + (index + 1) + (contact.value ? ': ' + contact.value : '')" @click="removeEntry('contacts', index)">×</button>
                        </div>
                    </section>

                    <section class="profile-section" data-profile-section="experience">
                        <div class="profile-section-heading"><h2>Experience</h2><button type="button" @click="addEntry('experiences')">＋ Add</button></div>
                        <article v-for="(experience, index) in draft.experiences" :key="index" class="entry-card" :data-entry="`experiences-${index}`">
                            <button type="button" class="entry-remove" :aria-label="'Remove experience ' + (index + 1) + (experience.title ? ': ' + experience.title : '')" @click="removeEntry('experiences', index)">×</button>
                            <div class="entry-grid">
                                <EditableField class="span-2" label="Job title" v-bind="field(`experiences.${index}.title`)" :model-value="experience.title" @commit="experience.title = $event; commit(`experiences.${index}.title`)" />
                                <EditableField class="span-2" label="Company" v-bind="field(`experiences.${index}.company`)" :model-value="experience.company" @commit="experience.company = $event; commit(`experiences.${index}.company`)" />
                                <EditableField class="span-2" label="Location" optional v-bind="field(`experiences.${index}.location`)" :model-value="experience.location" @commit="experience.location = $event; commit(`experiences.${index}.location`)" />
                                <EditableField label="Start" placeholder="Jan 2024" optional v-bind="field(`experiences.${index}.start`)" :model-value="experience.start" @commit="experience.start = $event; commit(`experiences.${index}.start`)" />
                                <EditableField label="End" placeholder="Present" optional v-bind="field(`experiences.${index}.end`)" :model-value="experience.end" @commit="experience.end = $event; commit(`experiences.${index}.end`)" />
                                <EditableField class="span-all" label="Highlights · one per line" placeholder="What you shipped, owned or improved" multiline optional v-bind="field(`experiences.${index}.highlights`)" :model-value="experience.highlights.join('\n')" @commit="experience.highlights = splitLines($event); commit(`experiences.${index}.highlights`)">
                                    <template #display><ul><li v-for="(line, lineIndex) in experience.highlights" :key="lineIndex">{{ line }}</li></ul></template>
                                </EditableField>
                            </div>
                            <p v-if="entryPending('experiences', index)" class="entry-pending">{{ pendingNote('experiences', index) }}</p>
                        </article>
                    </section>

                    <div class="profile-columns profile-columns--wide">
                    <section class="profile-section" data-profile-section="skills">
                        <div class="profile-section-heading"><h2>Skills</h2><button type="button" @click="addEntry('skills')">＋ Add</button></div>
                        <div v-for="(skill, index) in draft.skills" :key="index" class="entry-row skill-row" :data-entry="`skills-${index}`">
                            <EditableField class="skill-name" label="Group" placeholder="Languages" v-bind="field(`skills.${index}.name`)" :model-value="skill.name" @commit="skill.name = $event; commit(`skills.${index}.name`)" />
                            <EditableField class="skill-list" label="Skills · comma-separated" placeholder="TypeScript, Go, SQL" v-bind="field(`skills.${index}.skills`)" :model-value="skill.skills.join(', ')" @commit="skill.skills = splitList($event); commit(`skills.${index}.skills`)">
                                <template #display><span class="chips"><span v-for="item in skill.skills" :key="item">{{ item }}</span></span></template>
                            </EditableField>
                            <button type="button" class="entry-remove" :aria-label="'Remove skill group ' + (index + 1) + (skill.name ? ': ' + skill.name : '')" @click="removeEntry('skills', index)">×</button>
                        </div>
                    </section>

                    <section class="profile-section" data-profile-section="education">
                        <div class="profile-section-heading"><h2>Education</h2><button type="button" @click="addEntry('education')">＋ Add</button></div>
                        <article v-for="(education, index) in draft.education" :key="index" class="entry-card" :data-entry="`education-${index}`">
                            <button type="button" class="entry-remove" :aria-label="'Remove education ' + (index + 1) + (education.school ? ': ' + education.school : '')" @click="removeEntry('education', index)">×</button>
                            <div class="entry-grid">
                                <EditableField class="span-2" label="Institution" v-bind="field(`education.${index}.school`)" :model-value="education.school" @commit="education.school = $event; commit(`education.${index}.school`)" />
                                <EditableField class="span-2" label="Degree and field of study" optional v-bind="field(`education.${index}.degree`)" :model-value="education.degree" @commit="education.degree = $event; commit(`education.${index}.degree`)" />
                                <EditableField class="span-2" label="Location" optional v-bind="field(`education.${index}.location`)" :model-value="education.location" @commit="education.location = $event; commit(`education.${index}.location`)" />
                                <EditableField label="Start" optional v-bind="field(`education.${index}.start`)" :model-value="education.start" @commit="education.start = $event; commit(`education.${index}.start`)" />
                                <EditableField label="End" optional v-bind="field(`education.${index}.end`)" :model-value="education.end" @commit="education.end = $event; commit(`education.${index}.end`)" />
                                <EditableField class="span-all" label="Details" placeholder="GPA, honours, coursework" multiline optional v-bind="field(`education.${index}.details`)" :model-value="education.details" @commit="education.details = $event; commit(`education.${index}.details`)" />
                            </div>
                            <p v-if="entryPending('education', index)" class="entry-pending">{{ pendingNote('education', index) }}</p>
                        </article>
                    </section>

                    </div>

                    <section class="profile-section" data-profile-section="projects">
                        <div class="profile-section-heading"><h2>Projects</h2><button type="button" @click="addEntry('projects')">＋ Add</button></div>
                        <article v-for="(project, index) in draft.projects" :key="index" class="entry-card" :data-entry="`projects-${index}`">
                            <button type="button" class="entry-remove" :aria-label="'Remove project ' + (index + 1) + (project.name ? ': ' + project.name : '')" @click="removeEntry('projects', index)">×</button>
                            <div class="entry-grid">
                                <EditableField class="span-2" label="Project name" v-bind="field(`projects.${index}.name`)" :model-value="project.name" @commit="project.name = $event; commit(`projects.${index}.name`)" />
                                <EditableField class="span-2" label="URL" placeholder="https://…" optional v-bind="field(`projects.${index}.url`)" :model-value="project.url" @commit="project.url = $event; commit(`projects.${index}.url`)" />
                                <TechnologiesInput class="span-all" label="Technologies" :model-value="project.technologies" :saved="Boolean(savedFlash[`projects.${index}.technologies`])" :is-current="field(`projects.${index}.technologies`).isCurrent" @update:model-value="project.technologies = $event" @commit="commit(`projects.${index}.technologies`)" />
                                <EditableField class="span-all" label="Description" multiline optional v-bind="field(`projects.${index}.description`)" :model-value="project.description" @commit="project.description = $event; commit(`projects.${index}.description`)" />
                            </div>
                            <p v-if="entryPending('projects', index)" class="entry-pending">{{ pendingNote('projects', index) }}</p>
                        </article>
                    </section>

                    <div class="profile-columns">
                        <section class="profile-section" data-profile-section="certifications">
                            <div class="profile-section-heading"><h2>Certifications</h2><button type="button" @click="addEntry('certifications')">＋ Add</button></div>
                            <div v-for="(certification, index) in draft.certifications" :key="index" class="entry-card" :data-entry="`certifications-${index}`">
                                <button type="button" class="entry-remove" :aria-label="'Remove certification ' + (index + 1) + (certification.name ? ': ' + certification.name : '')" @click="removeEntry('certifications', index)">×</button>
                                <div class="entry-grid">
                                    <EditableField class="span-2" :label="`Certification ${index + 1}`" v-bind="field(`certifications.${index}.name`)" :model-value="certification.name" @commit="certification.name = $event; commit(`certifications.${index}.name`)" />
                                    <EditableField class="span-2" label="Issuer" optional v-bind="field(`certifications.${index}.issuer`)" :model-value="certification.issuer || ''" @commit="certification.issuer = $event; commit(`certifications.${index}.issuer`)" />
                                    <EditableField label="Start" optional v-bind="field(`certifications.${index}.start`)" :model-value="certification.start || ''" @commit="certification.start = $event; commit(`certifications.${index}.start`)" />
                                    <EditableField label="End" optional v-bind="field(`certifications.${index}.end`)" :model-value="certification.end || ''" @commit="certification.end = $event; commit(`certifications.${index}.end`)" />
                                </div>
                            </div>
                        </section>
                        <section class="profile-section" data-profile-section="languages">
                            <div class="profile-section-heading"><h2>Languages</h2><button type="button" @click="addEntry('languages')">＋ Add</button></div>
                            <div v-for="(language, index) in draft.languages" :key="index" class="entry-row single-row" :data-entry="`languages-${index}`">
                                <EditableField :label="`Language ${index + 1}`" placeholder="English — fluent" v-bind="field(`languages.${index}`)" :model-value="language" @commit="draft.languages[index] = $event; commit(`languages.${index}`)" />
                                <button type="button" class="entry-remove" :aria-label="'Remove language ' + (index + 1) + (language ? ': ' + language : '')" @click="removeEntry('languages', index)">×</button>
                            </div>
                        </section>
                    </div>
                </div>
            </section>
            <div v-if="transfer.mode" class="transfer-backdrop" @click.self="closeTransfer">
                <form ref="transferDialogElement" class="transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title" @submit.prevent="runTransfer">
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
            <div v-if="apply.open" class="transfer-backdrop" @click.self="closeApply">
                <form ref="applyDialogElement" class="transfer-dialog apply-dialog" role="dialog" aria-modal="true" aria-labelledby="apply-title" @submit.prevent="runApply">
                    <h2 id="apply-title">Apply {{ apply.profile?.identity.fullName }} to sessions</h2>
                    <p class="transfer-hint">Each selected session keeps its layout (or switches to the chosen template) and gets this profile's personal content. Sessions are updated independently.</p>
                    <label>Layout
                        <select v-model="apply.layout" :disabled="apply.busy || Object.keys(apply.results).length > 0">
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
                            <input v-model="apply.selected" type="checkbox" :value="session.id" :disabled="apply.busy || Object.keys(apply.results).length > 0">
                            <span>{{ sessionLabel(session) }}</span>
                            <small v-if="apply.results[session.id]" :class="apply.results[session.id]!.ok ? 'transfer-status' : 'profile-error'">{{ apply.results[session.id]!.message }}</small>
                        </label>
                    </div>
                    <section v-if="Object.keys(apply.previews).length" class="overwrite-preview" aria-label="Overwrite preview">
                        <h3>Before / after preview</h3>
                        <article v-for="id in apply.selected" :key="id"><strong>{{ applySessions.find(item => item.id === id)?.title || id }}</strong>
                            <pre><strong>Before · Markdown</strong>\n{{ apply.previews[id]?.before.markdown }}\n\n<strong>After · Markdown</strong>\n{{ apply.previews[id]?.after.markdown }}\n\n<strong>Before · CSS</strong>\n{{ apply.previews[id]?.before.css }}\n\n<strong>After · CSS</strong>\n{{ apply.previews[id]?.after.css }}</pre>
                            <button v-if="apply.undoable[id]" type="button" :disabled="apply.busy" @click="undoApply(id)">Undo this profile change</button>
                        </article>
                    </section>
                    <label v-if="Object.keys(apply.previews).length" class="overwrite-confirm"><input v-model="apply.confirmed" type="checkbox"> I reviewed the before/after preview and understand this replaces session content.</label>
                    <p v-if="apply.error" class="profile-error" role="alert">{{ apply.error }}</p>
                    <footer>
                        <button type="button" :disabled="apply.busy" @click="closeApply">{{ Object.keys(apply.results).length ? "Done" : "Cancel" }}</button>
                        <button v-if="!Object.keys(apply.previews).length" type="button" class="profile-save" :disabled="apply.busy || !apply.selected.length" @click="previewApply">{{ apply.busy ? "Preparing preview…" : "Preview overwrite" }}</button>
                        <button v-else class="profile-save" type="submit" :disabled="apply.busy || !apply.confirmed">{{ apply.busy ? "Applying…" : `Confirm & apply to ${apply.selected.length} session${apply.selected.length === 1 ? "" : "s"}` }}</button>
                    </footer>
                </form>
            </div>
            </main>
        </template>
    </NuxtLayout>
</template>

<style scoped>
.profiles-page { display: grid; grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; height: 100%; overflow: hidden; background: var(--bg-base, #111); color: var(--fg-text, #ddd); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.profiles-list { box-sizing: border-box; height: 100%; padding: 14px 12px; overflow: auto; background: var(--bg-mantle, #171717); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.profiles-list__header { margin: 0 4px 12px; color: var(--fg-subtext1, #bac2de); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }
.profiles-new, .profile-card { width: 100%; border: 1px solid var(--border, #333); border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: left; }
.profile-card__select { display: grid; flex: 1; min-width: 0; gap: 4px; border: 0 !important; background: transparent; text-align: left !important; cursor: pointer; }
.profile-card__menu-wrap { position: relative; flex-shrink: 0; }
.profile-card__menu-button { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; min-width: 32px; min-height: 32px; padding: 0 !important; background: transparent; font-size: 16px !important; line-height: 1; opacity: 0; }
.profile-card:hover .profile-card__menu-button, .profile-card:focus-within .profile-card__menu-button, .profile-card__menu-button[aria-expanded="true"] { opacity: 1; }
.profile-card__menu-button:focus-visible { opacity: 1; outline: 2px solid var(--accent, #89b4fa); outline-offset: 1px; }
.profile-card__menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; display: grid; min-width: 140px; padding: 4px; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-surface0, #313244); box-shadow: 0 8px 24px rgb(0 0 0 / .35); }
.profile-card__menu-divider { margin: 4px 0; border: 0; border-top: 1px solid var(--border, #333); }
.profile-card__menu button { padding: 6px 8px !important; border: 0 !important; background: transparent; font-size: 12px !important; text-align: left; white-space: nowrap; }
.profile-card__menu button:hover, .profile-card__menu button:focus-visible { background: var(--bg-base, #1e1e2e); }
.duplicate-warning { display: inline-block; padding: 1px 6px; border-radius: 999px; background: var(--yellow, #f9e2af); color: #11111b; font-size: 12px; font-style: normal; font-weight: 600; white-space: nowrap; }
.profiles-new { padding: 9px; margin-bottom: 12px; }
.profiles-new:hover, .profile-card:hover, .profile-card.active { border-color: var(--accent, #89b4fa); background: var(--bg-base, #1e1e2e); }
.profiles-empty { color: var(--fg-subtext1, #bac2de); font-size: 12px; }
.profile-card { position: relative; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 10px; margin-bottom: 7px; }
.profile-card.active { border-color: var(--accent, #89b4fa); background: var(--bg-base, #1e1e2e); box-shadow: inset 3px 0 0 var(--accent, #89b4fa); }
.profile-card span:first-child { display: grid; min-width: 0; gap: 4px; }
.profile-card__label { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.profile-card__meta { white-space: normal; overflow-wrap: anywhere; }
.profile-card small { white-space: normal; overflow-wrap: break-word; }
.profile-card small { color: var(--fg-subtext1, #bac2de); font-size: 12px; line-height: 1.45; }
.profile-card__headline { color: var(--fg-text, #cdd6f4); }
.profile-delete { display: flex; align-items: center; width: 100%; background: transparent !important; color: var(--danger, #f38ba8); }
.profile-delete:hover { color: var(--danger, #f38ba8); }

/* Shared controls */
.profiles-page button { border: 1px solid var(--border, #333); border-radius: 3px; padding: 6px 10px; background: transparent; color: inherit; font: inherit; cursor: pointer; white-space: nowrap; }
.profiles-page button:hover { border-color: var(--accent, #89b4fa); }
.profiles-page .profile-save { border-color: var(--accent, #89b4fa); background: var(--accent, #89b4fa); color: var(--bg-crust, #11111b); }
.profiles-page .profile-danger { border-color: var(--danger, #f38ba8); color: var(--danger, #f38ba8); }
.profiles-page .profile-danger:hover { background: color-mix(in srgb, var(--danger, #f38ba8) 12%, transparent); border-color: var(--danger, #f38ba8); color: var(--danger, #f38ba8); }
.profiles-page .profile-danger:focus-visible { outline: 2px solid var(--danger, #f38ba8); outline-offset: 2px; }
.profiles-page select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 34px; padding: 7px 8px; border: 1px solid var(--border, #333); border-radius: 3px; outline: none; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; }
.profiles-page select:focus { border-color: var(--accent, #89b4fa); }
.profiles-page button:focus-visible, .profiles-page a:focus-visible, .profiles-page select:focus-visible, .profiles-page input:focus-visible { outline: 2px solid var(--accent, #89b4fa); outline-offset: 2px; }


.profile-form { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.profile-placeholder { display: grid; align-content: center; justify-items: center; gap: 14px; min-height: 100%; padding: 24px 16px; box-sizing: border-box; color: var(--fg-subtext0, #888); text-align: center; }
.profile-placeholder p { margin: 0; }
.profile-placeholder div { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

.profile-sheet { container: sheet / inline-size; box-sizing: border-box; width: 100%; max-width: 1160px; margin: 0 auto; padding: 0 28px 40px; }
.profile-section-nav { position: sticky; top: 0; z-index: 2; display: flex; gap: 4px; overflow-x: auto; margin: 0 -28px 18px; padding: 10px 28px 8px; border-bottom: 1px solid var(--border, #333); background: var(--bg-base, #111); scrollbar-width: thin; }
.profile-section-nav button { padding: 3px 8px; font-size: 11px; color: var(--fg-subtext1, #aaa); }
.profile-section-nav button.active { border-color: var(--accent, #89b4fa); color: var(--accent, #89b4fa); }
.profile-pending-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-bottom: 16px; padding: 9px 12px; border: 1px solid var(--warning, #f9e2af); border-radius: 4px; background: color-mix(in srgb, var(--warning, #f9e2af) 12%, transparent); font-size: 12px; }
.profile-card--draft { border-style: dashed; }
.profile-card--draft .profile-card__select { cursor: default; }
.draft-badge { color: var(--warning, #f9e2af); font-style: normal; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }

.profile-identity { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px 14px; }
.profile-section { min-width: 0; margin-top: 22px; scroll-margin-top: 176px; }
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
.entry-remove { align-self: start; margin-top: 19px; width: 34px; height: 34px; padding: 0 !important; color: var(--fg-subtext0, #888) !important; line-height: 1; }
.entry-card .entry-remove { width: 24px; height: 24px; margin-top: 0; border-color: transparent !important; }
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
    .contact-row { grid-template-columns: 112px minmax(0, 1.25fr) minmax(0, 1fr) auto; }
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
/* Wide sheet: short sections pair two-up; below 1100px the wrapper stacks. */
@container sheet (min-width: 1100px) {
    .profile-columns--wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .profile-columns--wide .entry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .profile-columns--wide .span-2 { grid-column: span 2; }
    .profile-columns--wide .skill-row { grid-template-columns: minmax(0, 1fr) auto; }
    .profile-columns--wide .skill-row .skill-list { grid-column: 1 / -1; }
    .profile-columns--wide .skill-row .entry-remove { grid-column: 2; grid-row: 1; }
}
@media (max-width: 560px) {
    .profile-sheet { padding: 0 16px 32px; }
}

.profiles-transfer { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: -4px 0 12px; }
.profiles-transfer button, .transfer-dialog footer button { border: 1px solid var(--border, #333); border-radius: 3px; padding: 6px 9px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.profiles-transfer button:disabled, .transfer-dialog button:disabled { opacity: .5; cursor: default; }
.transfer-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / .55); }
.transfer-dialog { box-sizing: border-box; width: min(460px, 100%); padding: 20px; border: 1px solid var(--border, #333); border-radius: 6px; background: var(--bg-base, #111); }
.transfer-dialog h2 { margin: 0 0 14px; font-size: 13px; font-weight: 500; }
.transfer-dialog label { display: grid; gap: 6px; margin-bottom: 12px; color: var(--fg-subtext1, #aaa); font-size: 12px; }
.transfer-dialog input, .transfer-dialog textarea { min-width: 0; padding: 8px; border: 1px solid var(--border, #333); border-radius: 3px; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; resize: vertical; }
.transfer-hint { margin: 0 0 12px; color: var(--fg-subtext0, #888); font-size: 11px; line-height: 1.5; }
.transfer-status { color: var(--success, #a6e3a1); }
.transfer-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.transfer-dialog footer .profile-save { border-color: var(--accent, #89b4fa); background: var(--accent, #89b4fa); color: var(--bg-crust, #11111b); }
.profile-error { color: var(--danger, #f38ba8); }
.apply-dialog { width: min(760px, 100%); max-height: 90vh; overflow: auto; }
.apply-dialog select { min-width: 0; padding: 8px; border: 1px solid var(--border, #333); border-radius: 3px; background: var(--bg-mantle, #171717); color: var(--fg-text, #ddd); font: inherit; }
.apply-sessions { display: grid; gap: 2px; max-height: 280px; margin-bottom: 12px; overflow: auto; }
.overwrite-preview { max-height: 320px; overflow: auto; border: 1px solid var(--border, #333); padding: 10px; margin: 8px 0; }
.overwrite-preview h3 { margin: 0 0 8px; font-size: 12px; }
.overwrite-preview article + article { margin-top: 12px; border-top: 1px solid var(--border, #333); padding-top: 8px; }
.overwrite-preview pre { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10px; }
.overwrite-confirm { display: flex !important; grid-template-columns: auto 1fr !important; align-items: start; gap: 8px !important; }
.apply-select-all { justify-self: start; margin-bottom: 6px; border: 1px solid var(--border, #333); border-radius: 3px; padding: 4px 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.transfer-dialog .apply-session { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; margin: 0; padding: 4px 2px; color: var(--fg-text, #ddd); font-size: 12px; }
.apply-session span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
