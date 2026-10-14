import { normalizeCvProfile } from "@core/domain/cv/compose";
import type { CvProfileProps } from "@core/domain/cv";

/** Browser-only profiles shared by the profile editor and CV sessions. */
export type LocalProfile = CvProfileProps & { id: string; createdAt: number; updatedAt: number };

export const LOCAL_PROFILES_KEY = "cv-sv:local-profiles:v1";

/** Portfolio entry added for the profile's current public project set. Replace the placeholder URL once deployment is published. */
export const SYMBOTIC_PORTFOLIO_PROJECT = {
    name: "Real-time warehouse systems portfolio",
    url: "https://symbotic-3d-portfolio.pages.dev",
    description: "Interactive warehouse digital twin and WebGPU performance lab built with React, TypeScript, and Three.js.",
    technologies: ["React", "TypeScript", "Three.js", "WebGPU", "WebGL"],
};

const portfolioOwner = (profile: CvProfileProps) =>
    /trần hà tuấn kiệt|tran ha tuan kiet|kyle tran/i.test(profile.identity.fullName);

/** Keep the public portfolio list stable when older browser-local copies are opened. */
function migratePortfolio(profile: CvProfileProps): CvProfileProps {
    if (!portfolioOwner(profile)) return profile;
    const seen = new Set<string>();
    const projects = profile.projects
        .map(project => ({
            ...project,
            description: project.description.replace(/\s+/g, " ").trim(),
            technologies: [...new Set(project.technologies.map(item => item.trim()).filter(Boolean))],
        }))
        .filter(project => {
            const key = `${project.name.trim().toLowerCase()}|${project.url.trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    const existing = projects.find(project => project.name === SYMBOTIC_PORTFOLIO_PROJECT.name);
    return {
        ...profile,
        projects: [existing ?? SYMBOTIC_PORTFOLIO_PROJECT, ...projects.filter(project => project !== existing)],
    };
}

export const newLocalProfileId = () => `profile-${crypto.randomUUID()}`;

/** Read stored profiles (newest first), upgrading legacy flat records. */
export function readLocalProfiles(): LocalProfile[] {
    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY) || "[]");
        if (!Array.isArray(stored)) return [];
        return stored
            .filter(profile => profile && typeof profile === "object")
            .map((profile: any): LocalProfile => {
                const value = migratePortfolio(normalizeCvProfile(profile));
                return {
                    ...value,
                    id: typeof profile.id === "string" && profile.id ? profile.id : newLocalProfileId(),
                    createdAt: Number(profile.createdAt) || Date.now(),
                    updatedAt: Number(profile.updatedAt) || Date.now(),
                };
            })
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
    const value = migratePortfolio(normalizeCvProfile(profile));
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
