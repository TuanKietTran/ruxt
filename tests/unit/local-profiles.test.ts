import { beforeEach, describe, expect, it } from "vitest";
import { normalizeCvProfile } from "@ruxt/shared/cv";
import { LOCAL_PROFILES_KEY, orderLocalProfiles, readLocalProfiles, saveLocalProfile } from "../../app/utils/localProfiles";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
};
const named = (fullName: string) => normalizeCvProfile({ identity: { fullName } });
const stored = () => JSON.parse(store.get(LOCAL_PROFILES_KEY) ?? "[]") as { id: string; updatedAt: number }[];

describe("local profiles", () => {
    beforeEach(() => store.clear());

    it("editing one profile never changes another profile's updatedAt", () => {
        const a = saveLocalProfile(named("A"));
        const b = saveLocalProfile(named("B"));
        store.set(LOCAL_PROFILES_KEY, JSON.stringify(stored().map(p => ({ ...p, updatedAt: p.id === a.id ? 1000 : 2000 }))));
        const edited = saveLocalProfile(named("A2"), a.id);
        expect(edited.id).toBe(a.id);
        expect(stored().find(p => p.id === b.id)!.updatedAt).toBe(2000);
        expect(stored().find(p => p.id === a.id)!.updatedAt).toBeGreaterThan(1000);
    });

    it("reading is stable: ids and timestamps of legacy records are fixed once and never change", () => {
        store.set(LOCAL_PROFILES_KEY, JSON.stringify([{ identity: { fullName: "Old" } }, { id: "keep", updatedAt: 5, createdAt: 4, identity: { fullName: "New" } }]));
        const first = readLocalProfiles();
        const second = readLocalProfiles();
        expect(second.map(p => [p.id, p.createdAt, p.updatedAt])).toEqual(first.map(p => [p.id, p.createdAt, p.updatedAt]));
        expect(first.find(p => p.id === "keep")!.updatedAt).toBe(5);
    });

    it("orderLocalProfiles keeps the remembered order even after a save bumps updatedAt", () => {
        const a = saveLocalProfile(named("A"));
        const b = saveLocalProfile(named("B"));
        const c = saveLocalProfile(named("C"));
        const order = [a.id, b.id, c.id];
        store.set(LOCAL_PROFILES_KEY, JSON.stringify([{ ...a, updatedAt: 1 }, { ...b, updatedAt: 2 }, { ...c, updatedAt: 3 }]));
        saveLocalProfile(named("C edited"), c.id);
        expect(readLocalProfiles()[0]!.id).toBe(c.id);
        saveLocalProfile(named("A edited"), a.id);
        expect(orderLocalProfiles(readLocalProfiles(), order).map(p => p.id)).toEqual(order);
    });

    it("orderLocalProfiles puts profiles it has not seen first, newest first", () => {
        const known = { ...normalizeCvProfile({}), id: "k", createdAt: 1, updatedAt: 1 };
        const n1 = { ...known, id: "n1", updatedAt: 10 };
        const n2 = { ...known, id: "n2", updatedAt: 20 };
        expect(orderLocalProfiles([known, n1, n2], ["k"]).map(p => p.id)).toEqual(["n2", "n1", "k"]);
    });
});
