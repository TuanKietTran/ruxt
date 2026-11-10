import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const profilesPage = () => source("../../app/pages/profiles.vue");

describe("profile row menu contract (static source checks)", () => {
    it("renders the row label via profileLabel (label, then headline, then full name) with a 2-line clamp", () => {
        const page = profilesPage();
        expect(page).toContain("const profileLabel = (profile: LocalProfile) => (profile as { label?: string }).label?.trim() || profile.identity.headline?.trim() || profile.identity.fullName;");
        expect(page).toContain('<strong class="profile-card__label">{{ profileLabel(profile) }}</strong>');
        expect(page).toContain("-webkit-line-clamp: 2");
        expect(page).toContain(".profile-card__meta { white-space: normal; overflow-wrap: anywhere; }");
    });

    it("shows name, project count and a formatted date in the meta line, with the id only in the select title", () => {
        const page = profilesPage();
        expect(page).toContain('new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })');
        expect(page).toContain("{{ profile.identity.fullName }} · {{ profile.projects.length }} projects · {{ profileDate(profile.updatedAt) }}");
        expect(page).toContain(':title="`Profile ID: ${profile.id}`"');
        expect(page).not.toContain("profile.id.slice(-8)");
        expect(page).not.toContain("new Date(profile.updatedAt).toLocaleDateString()");
    });

    it("hides row actions behind one overflow menu button revealed on hover, focus-within or when expanded", () => {
        const page = profilesPage();
        expect(page).not.toContain("profile-card__actions");
        expect(page).toContain("const openMenuId = ref<string | null>(null);");
        expect(page).toContain(':id="`profile-menu-button-${profile.id}`"');
        expect(page).toContain('class="profile-card__menu-button" type="button" aria-haspopup="menu" :aria-expanded="openMenuId === profile.id"');
        expect(page).toContain(':aria-label="`Actions for ${profileLabel(profile)}`"');
        expect(page).toContain('@click.stop="toggleProfileMenu(profile)"');
        expect(page).toContain("min-width: 32px; min-height: 32px");
        expect(page).toContain('.profile-card:hover .profile-card__menu-button, .profile-card:focus-within .profile-card__menu-button, .profile-card__menu-button[aria-expanded="true"] { opacity: 1; }');
        expect(page).toContain('.profile-card__menu-button:focus-visible { opacity: 1;');
    });

    it("menu offers Rename, Duplicate and Delete as menuitems and closes on action, Escape (refocusing the button) and outside pointerdown", () => {
        const page = profilesPage();
        expect(page).toContain('<div v-if="openMenuId === profile.id" class="profile-card__menu" role="menu">');
        expect(page).toContain('role="menuitem" @click="profileMenuAction(renameProfile, profile)">Rename</button>');
        expect(page).toContain('role="menuitem" @click="profileMenuAction(duplicateProfile, profile)">Duplicate</button>');
        expect(page).toContain('role="menuitem" :aria-label="`Delete ${profile.identity.fullName}`" @click="profileMenuAction(remove, profile)">Delete</button>');
        expect(page).toContain("closeProfileMenu(); await action(profile);");
        expect(page).toContain('@keydown="onProfileMenuKeydown($event, profile)"');
        expect(page).toContain('if (event.key !== "Escape") return;');
        expect(page).toContain("document.getElementById(`profile-menu-button-${profile.id}`)?.focus();");
        expect(page).toContain('document.addEventListener("pointerdown", onDocumentPointerDown)');
        expect(page).toContain('document.removeEventListener("pointerdown", onDocumentPointerDown)');
        expect(page).toContain('closest?.(".profile-card__menu-wrap")');
    });
});

describe("profile delete confirm contract (static source checks)", () => {
    it("delete confirm names the profile and headline, is destructive and cannot be undone", () => {
        const page = profilesPage();
        expect(page).toContain('title: "Delete profile?"');
        expect(page).toContain("Delete ${profile.identity.fullName}'s profile");
        expect(page).toContain('${profile.identity.headline || "No headline"}? This cannot be undone.');
        expect(page).toContain('confirmLabel: "Delete profile"');
        expect(page).toContain('cancelLabel: "Keep profile"');
        expect(page).toContain("danger: true,");
    });

    it("header Delete is styled as danger and carries its own aria-label, distinct from the row menu Delete", () => {
        const page = profilesPage();
        expect(page).toContain('class="profile-danger"');
        expect(page).toContain(":aria-label=\"`Delete ${currentProfile.identity.fullName}'s profile`\"");
        expect(page).toContain('title="Delete this profile permanently"');
        expect(page).toContain('@click="remove(currentProfile)">Delete</button>');
        expect(page).toContain(':aria-label="`Delete ${profile.identity.fullName}`"');
        expect(page).toContain(".profiles-page .profile-danger { border-color: var(--danger, #f38ba8); color: var(--danger, #f38ba8); }");
        expect(page).toContain(".profiles-page .profile-danger:focus-visible { outline: 2px solid var(--danger, #f38ba8); outline-offset: 2px; }");
    });
});
