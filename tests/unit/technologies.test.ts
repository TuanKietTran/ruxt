import { describe, expect, it } from "vitest";
import { normalizeCvProfile } from "@ruxt/shared/cv";
import { commitTechnologies, parseTechnologies } from "../../app/utils/technologies";

describe("technologies", () => {
    it("keeps every comma-separated token, including 1-2 character names", () => {
        expect(parseTechnologies("Go, C, R,  Vue ,\nSQL,,")).toEqual(["Go", "C", "R", "Vue", "SQL"]);
    });
    it("commits exactly the box value after the existing chips", () => {
        expect(commitTechnologies(["Rust"], "Go")).toEqual(["Rust", "Go"]);
        expect(commitTechnologies(["Rust"], "  ")).toEqual(["Rust"]);
        expect(commitTechnologies([], "Go, Py")).toEqual(["Go", "Py"]);
    });
    it("short tokens survive profile normalization", () => {
        const profile = normalizeCvProfile({ projects: [{ name: "p", technologies: parseTechnologies("Go, C, TS") }] });
        expect(profile.projects[0]!.technologies).toEqual(["Go", "C", "TS"]);
    });
});
