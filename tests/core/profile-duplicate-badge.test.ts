import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const profilesPage = () => source("../../app/pages/profiles.vue");

type Fixture = {
    id: string;
    label?: string;
    identity: { fullName: string; headline?: string };
};

const make = (id: string, fullName: string, options?: { label?: string; headline?: string }): Fixture => ({
    id,
    ...(options?.label !== undefined ? { label: options.label } : {}),
    identity: { fullName, headline: options?.headline ?? "" },
});

/** Strip the page-local TS syntax so the extracted arrow functions run as plain JS. */
const asJs = (code: string) =>
    code.replaceAll(": LocalProfile", "").replaceAll("(profile as { label?: string })", "profile");

/**
 * Build the page's real `profileLabel` + `duplicateName` from source and run them
 * against fixtures, so the cases below test the shipped logic, not a copy of it.
 */
const loadDuplicateCheck = (profiles: Fixture[]) => {
    const page = profilesPage();
    const profileLabelLine = page.split("\n").find(line => line.startsWith("const profileLabel = "));
    const duplicateNameLine = page.split("\n").find(line => line.startsWith("const duplicateName = "));
    expect(profileLabelLine).toBeDefined();
    expect(duplicateNameLine).toBeDefined();
    const profileLabelCode = asJs(profileLabelLine!.replace("const profileLabel = ", "").replace(/;\s*$/, ""));
    const duplicateNameCode = asJs(duplicateNameLine!.replace("const duplicateName = ", "").replace(/;\s*$/, ""));
    const profileLabel = new Function(`return ${profileLabelCode};`)() as unknown as (profile: Fixture) => string;
    const state = { value: profiles };
    const duplicateName = new Function("profiles", "profileLabel", `return ${duplicateNameCode};`)(state, profileLabel) as unknown as (profile: Fixture) => boolean;
    return { profileLabel, duplicateName };
};

describe("profile duplicate badge (BUG-1)", () => {
    it("compares the displayed label (profileLabel), not the owner fullName", () => {
        const page = profilesPage();
        const line = page.split("\n").find(item => item.startsWith("const duplicateName = "));
        expect(line).toBeDefined();
        expect(line).toContain("profileLabel(profile)");
        expect(line).toContain("profileLabel(item)");
        expect(line).toContain("item.id !== profile.id");
        expect(line).not.toContain("identity.fullName");
    });

    it("does not flag unique titles that share one owner fullName", () => {
        const a = make("p1", "Kyle Nguyen", { label: "Python" });
        const b = make("p2", "Kyle Nguyen", { label: "AI and agents" });
        const { duplicateName } = loadDuplicateCheck([a, b]);
        expect(duplicateName(a)).toBe(false);
        expect(duplicateName(b)).toBe(false);
    });

    it("does not flag unique headlines that share one owner fullName", () => {
        const a = make("p1", "Kyle Nguyen", { headline: "Backend-focused" });
        const b = make("p2", "Kyle Nguyen", { headline: "Python" });
        const { duplicateName } = loadDuplicateCheck([a, b]);
        expect(duplicateName(a)).toBe(false);
        expect(duplicateName(b)).toBe(false);
    });

    it("flags the same label twice, case- and whitespace-insensitively", () => {
        const a = make("p1", "Kyle Nguyen", { label: "Python" });
        const b = make("p2", "Kyle Nguyen", { label: "  python " });
        const { duplicateName } = loadDuplicateCheck([a, b]);
        expect(duplicateName(a)).toBe(true);
        expect(duplicateName(b)).toBe(true);
    });

    it("flags the same headline twice when no label is set", () => {
        const a = make("p1", "Kyle Nguyen", { headline: "Generic" });
        const b = make("p2", "Kyle Nguyen", { headline: "Generic" });
        const { duplicateName } = loadDuplicateCheck([a, b]);
        expect(duplicateName(a)).toBe(true);
        expect(duplicateName(b)).toBe(true);
    });

    it("never flags a single profile: a profile is not its own duplicate", () => {
        const a = make("p1", "Kyle Nguyen", { label: "Python" });
        const { duplicateName } = loadDuplicateCheck([a]);
        expect(duplicateName(a)).toBe(false);
    });

    it("never flags an empty label", () => {
        const a = make("p1", "", {});
        const b = make("p2", "", {});
        const { profileLabel, duplicateName } = loadDuplicateCheck([a, b]);
        expect(profileLabel(a)).toBe("");
        expect(profileLabel(b)).toBe("");
        expect(duplicateName(a)).toBe(false);
        expect(duplicateName(b)).toBe(false);
    });
});

describe("duplicate warning marker (BUG-5)", () => {
    const warningRule = () => {
        const page = profilesPage();
        const match = page.match(/\.duplicate-warning \{([^}]*)\}/);
        expect(match).not.toBeNull();
        return match![1]!;
    };

    it("keeps the 'Duplicate name' wording on the card", () => {
        expect(profilesPage()).toContain('<em v-if="duplicateName(profile)" class="duplicate-warning">Duplicate name</em>');
    });

    it("is a small inline marker, not a full-width yellow pill", () => {
        const rule = warningRule();
        expect(rule).toContain("justify-self: start");
        expect(rule).toContain("font-size: 11px");
        expect(rule).toContain("var(--warning");
        expect(rule).not.toContain("background");
        expect(rule).not.toContain("border-radius");
        expect(rule).not.toContain("999px");
        expect(rule).not.toContain("padding");
    });
});
