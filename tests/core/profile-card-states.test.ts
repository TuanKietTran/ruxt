import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const profilesPage = () => source("../../app/pages/profiles.vue");

// Return the declaration block of the first rule whose selector matches `pattern`,
// or null when no such rule exists. The pattern must not match a longer selector
// (e.g. `.profile-card__menu-button` must not match `:focus-visible` variants).
const ruleBlock = (page: string, pattern: RegExp): string | null => {
    const match = page.match(pattern);
    return match?.[1] ?? null;
};

describe("BUG-3 profile card hover vs selected (static source checks)", () => {
    it("hover is not grouped with .active: hover and selected have separate rules", () => {
        const page = profilesPage();
        expect(page).not.toContain(".profiles-new:hover, .profile-card:hover, .profile-card.active");
        expect(page).not.toContain(".profile-card:hover, .profile-card.active");
        expect(ruleBlock(page, /\.profile-card:hover \{([^}]*)\}/)).not.toBeNull();
        expect(ruleBlock(page, /\.profile-card\.active \{([^}]*)\}/)).not.toBeNull();
    });

    it("hover is subtler: surface background and strong border, no accent background", () => {
        const page = profilesPage();
        const hover = ruleBlock(page, /\.profile-card:hover \{([^}]*)\}/);
        expect(hover).not.toBeNull();
        expect(hover).toMatch(/border-color:\s*var\(--border-strong/);
        expect(hover).toMatch(/background:\s*var\(--bg-surface0/);
        expect(hover).not.toContain("--accent");
        expect(hover).not.toContain("--bg-base");
        expect(hover).not.toContain("box-shadow");
    });

    it(".profiles-new hover is unchanged: accent border on bg-base", () => {
        const page = profilesPage();
        const hover = ruleBlock(page, /\.profiles-new:hover \{([^}]*)\}/);
        expect(hover).not.toBeNull();
        expect(hover).toContain("border-color: var(--accent, #89b4fa)");
        expect(hover).toContain("background: var(--bg-base, #1e1e2e)");
    });

    it(".active keeps the accent border, bg-base and inset 3px accent bar", () => {
        const page = profilesPage();
        const active = ruleBlock(page, /\.profile-card\.active \{([^}]*)\}/);
        expect(active).not.toBeNull();
        expect(active).toContain("border-color: var(--accent, #89b4fa)");
        expect(active).toContain("background: var(--bg-base, #1e1e2e)");
        expect(active).toContain("box-shadow: inset 3px 0 0 var(--accent, #89b4fa)");
    });
});

describe("BUG-4 profile card menu button border and focus ring (static source checks)", () => {
    it("menu-button base rule has border: 0 at rest", () => {
        const page = profilesPage();
        const base = ruleBlock(page, /\.profile-card__menu-button \{([^}]*)\}/);
        expect(base).not.toBeNull();
        expect(base).toMatch(/border:\s*0(\s*!important)?;/);
        expect(base).not.toContain("outline");
    });

    it("outline appears only in the :focus-visible rule for the menu button (2px accent, offset 1px)", () => {
        const page = profilesPage();
        const focusVisible = ruleBlock(page, /\.profile-card__menu-button:focus-visible \{([^}]*)\}/);
        expect(focusVisible).not.toBeNull();
        expect(focusVisible).toContain("outline: 2px solid var(--accent, #89b4fa)");
        expect(focusVisible).toContain("outline-offset: 1px");
        // No plain :focus rule (without -visible) may target the menu button.
        expect(page).not.toMatch(/\.profile-card__menu-button:focus(?!-visible)/);
        expect(page).not.toMatch(/\.profile-card__menu-button:focus \{/);
    });

    it("opacity reveal behavior is unchanged: hidden at rest, shown on hover / focus-within / expanded", () => {
        const page = profilesPage();
        const base = ruleBlock(page, /\.profile-card__menu-button \{([^}]*)\}/);
        expect(base).toContain("opacity: 0");
        expect(page).toContain('.profile-card:hover .profile-card__menu-button, .profile-card:focus-within .profile-card__menu-button, .profile-card__menu-button[aria-expanded="true"] { opacity: 1; }');
        expect(page).toContain(".profile-card__menu-button:focus-visible { opacity: 1;");
    });
});
