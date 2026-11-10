import { normalizeCvProfile } from "@ruxt/shared/cv";
import type { CvProfileProps } from "@ruxt/shared/cv";

/** Browser-only profiles shared by the profile editor and CV sessions. */
export type LocalProfile = CvProfileProps & { id: string; createdAt: number; updatedAt: number; label?: string };

/**
 * A profile's label is its short display name in lists, distinct from the CV's `identity.fullName`.
 * It is local-only metadata: `normalizeCvProfile` drops it, so the read/save paths below extract it
 * before normalizing and re-attach it after. Optional in the type because import/duplicate code
 * builds profile-shaped objects before persistence; records returned by `readLocalProfiles` and
 * `saveLocalProfile` always carry one. Read it through `profileLabel`, not the raw field.
 */
export const defaultProfileLabel = (profile: CvProfileProps): string =>
    profile.identity.headline.trim() || profile.identity.fullName.trim();

/** Short display label for a profile: its stored `label` when set, otherwise the default. */
export const profileLabel = (profile: CvProfileProps & { label?: string }): string =>
    (typeof profile.label === "string" && profile.label.trim()) || defaultProfileLabel(profile);

export const LOCAL_PROFILES_KEY = "cv-sv:local-profiles:v1";

export const newLocalProfileId = () => `profile-${crypto.randomUUID()}`;

/** Newest first; the id breaks ties so equal timestamps never reorder between reads. */
const byNewest = (a: LocalProfile, b: LocalProfile) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

/**
 * Read stored profiles (newest first), upgrading legacy flat records. Anything the upgrade had to invent
 * (an id, a timestamp, a label) is written back once, so a profile keeps the same id and `updatedAt` on
 * every read and a selection keyed by id stays valid. Reading never touches a timestamp already stored.
 */
export function readLocalProfiles(): LocalProfile[] {
    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        let upgraded = false;
        const now = Date.now();
        const profiles = stored
            .filter(profile => profile && typeof profile === "object")
            .map((profile: any): LocalProfile => {
                const hasId = typeof profile.id === "string" && profile.id;
                const createdAt = Number(profile.createdAt) || Number(profile.updatedAt) || now;
                const updatedAt = Number(profile.updatedAt) || createdAt;
                const normalized = normalizeCvProfile(profile);
                const label = typeof profile.label === "string" && profile.label.trim() ? profile.label.trim() : defaultProfileLabel(normalized);
                if (!hasId || !Number(profile.createdAt) || !Number(profile.updatedAt) || profile.label !== label) upgraded = true;
                return { ...normalized, label, id: hasId ? profile.id : newLocalProfileId(), createdAt, updatedAt };
            })
            .sort(byNewest);
        if (upgraded) writeLocalProfiles(profiles);
        return profiles;
    } catch {
        return [];
    }
}

/**
 * Arrange profiles by a remembered id order. Profiles missing from `order` (just created, imported)
 * come first, newest first. Saving a profile bumps its `updatedAt`, so sorting by it while a profile is
 * open would move that card under the pointer; the page re-sorts only when the list is rebuilt.
 */
export function orderLocalProfiles(profiles: LocalProfile[], order: readonly string[]): LocalProfile[] {
    const rank = new Map(order.map((id, index) => [id, index]));
    const known = profiles.filter(profile => rank.has(profile.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    const fresh = profiles.filter(profile => !rank.has(profile.id)).sort(byNewest);
    return [...fresh, ...known];
}

export function writeLocalProfiles(profiles: LocalProfile[]): void {
    const withLabels = profiles.map(profile => ({
        ...profile,
        label: typeof profile.label === "string" && profile.label.trim() ? profile.label.trim() : defaultProfileLabel(profile),
    }));
    localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(withLabels));
}

/**
 * Insert a profile, or replace the one with `id`. Returns the stored record. An explicit `label` in
 * the input wins; an update without one keeps the stored label (editing the headline must not clobber
 * a custom label); a new profile without one gets `defaultProfileLabel`.
 */
export function saveLocalProfile(profile: CvProfileProps & { label?: string }, id?: string): LocalProfile {
    const profiles = readLocalProfiles();
    const now = Date.now();
    const index = id ? profiles.findIndex(item => item.id === id) : -1;
    const value = normalizeCvProfile(profile);
    const explicit = typeof profile.label === "string" ? profile.label.trim() : "";
    const label = explicit || (index >= 0 ? profiles[index]!.label : undefined) || defaultProfileLabel(value);
    const saved: LocalProfile = index >= 0
        ? { ...value, label, id: profiles[index]!.id, createdAt: profiles[index]!.createdAt, updatedAt: now }
        : { ...value, label, id: newLocalProfileId(), createdAt: now, updatedAt: now };
    if (index >= 0) profiles[index] = saved;
    else profiles.push(saved);
    writeLocalProfiles(profiles);
    return saved;
}

export const localProfileLabel = (profile: CvProfileProps) =>
    profile.identity.headline ? `${profile.identity.fullName} — ${profile.identity.headline}` : profile.identity.fullName;
