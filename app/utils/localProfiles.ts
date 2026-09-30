import { normalizeCvProfile } from "@core/domain/cv/compose";
import type { CvProfileProps } from "@core/domain/cv";

/** Browser-only profiles shared by the profile editor and CV sessions. */
export type LocalProfile = CvProfileProps & { id: string; createdAt: number; updatedAt: number };

export const LOCAL_PROFILES_KEY = "cv-sv:local-profiles:v1";

export const newLocalProfileId = () => `profile-${crypto.randomUUID()}`;

/** Read stored profiles (newest first), upgrading legacy flat records. */
export function readLocalProfiles(): LocalProfile[] {
    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        return stored
            .filter(profile => profile && typeof profile === "object")
            .map((profile: any): LocalProfile => ({
                ...normalizeCvProfile(profile),
                id: typeof profile.id === "string" && profile.id ? profile.id : newLocalProfileId(),
                createdAt: Number(profile.createdAt) || Date.now(),
                updatedAt: Number(profile.updatedAt) || Date.now(),
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return [];
    }
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
