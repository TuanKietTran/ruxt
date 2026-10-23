import { normalizeCvProfile } from "@ruxt/shared/cv";
import type { CvProfileProps } from "@ruxt/shared/cv";

/** Browser-only profiles shared by the profile editor and CV sessions. */
export type LocalProfile = CvProfileProps & { id: string; createdAt: number; updatedAt: number };

export const LOCAL_PROFILES_KEY = "cv-sv:local-profiles:v1";

export const newLocalProfileId = () => `profile-${crypto.randomUUID()}`;

/** Newest first; the id breaks ties so equal timestamps never reorder between reads. */
const byNewest = (a: LocalProfile, b: LocalProfile) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

/**
 * Read stored profiles (newest first), upgrading legacy flat records. Anything the upgrade had to invent
 * (an id, a timestamp) is written back once, so a profile keeps the same id and `updatedAt` on every read
 * and a selection keyed by id stays valid. Reading never touches a timestamp that is already stored.
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
                if (!hasId || !Number(profile.createdAt) || !Number(profile.updatedAt)) upgraded = true;
                return { ...normalizeCvProfile(profile), id: hasId ? profile.id : newLocalProfileId(), createdAt, updatedAt };
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
    localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(profiles));
}

/** Insert a profile, or replace the one with `id`. Returns the stored record. */
export function saveLocalProfile(profile: CvProfileProps, id?: string): LocalProfile {
    const profiles = readLocalProfiles();
    const now = Date.now();
    const index = id ? profiles.findIndex(item => item.id === id) : -1;
    const value = normalizeCvProfile(profile);
    const saved: LocalProfile = index >= 0
        ? { ...value, id: profiles[index]!.id, createdAt: profiles[index]!.createdAt, updatedAt: now }
        : { ...value, id: newLocalProfileId(), createdAt: now, updatedAt: now };
    if (index >= 0) profiles[index] = saved;
    else profiles.push(saved);
    writeLocalProfiles(profiles);
    return saved;
}

export const localProfileLabel = (profile: CvProfileProps) =>
    profile.identity.headline ? `${profile.identity.fullName} — ${profile.identity.headline}` : profile.identity.fullName;
