import { describe, expect, it } from "vitest";
import { formatAppVersion, resolveAppVersion } from "../../app/utils/app-version";

describe("app version resolution", () => {
    it("prefers the git tag over the env ref name", () => {
        expect(resolveAppVersion({ gitTag: "0.1.7", envRefName: "main", gitSha: "", envSha: "" }).version).toBe("0.1.7");
    });

    it("falls back to the env ref name when there is no git tag", () => {
        expect(resolveAppVersion({ gitTag: "  ", envRefName: "0.1.8", gitSha: "", envSha: "" }).version).toBe("0.1.8");
    });

    it("falls back to dev when both version sources are empty", () => {
        expect(resolveAppVersion({ gitTag: "", envRefName: "", gitSha: "", envSha: "" })).toEqual({ version: "dev", commit: "" });
    });

    it("prefers the git sha over the env sha", () => {
        expect(resolveAppVersion({ gitTag: "", envRefName: "", gitSha: "58fe01d999", envSha: "aaaaaaa111" }).commit).toBe("58fe01d");
    });

    it("slices the commit to 7 chars", () => {
        expect(resolveAppVersion({ gitTag: "", envRefName: "", gitSha: "", envSha: "1234567890" }).commit).toBe("1234567");
    });

    it("trims whitespace on all inputs", () => {
        expect(resolveAppVersion({ gitTag: "  0.1.7  ", envRefName: "", gitSha: "  58fe01d  ", envSha: "" })).toEqual({ version: "0.1.7", commit: "58fe01d" });
    });
});

describe("app version formatting", () => {
    it("adds v to a bare numeric tag", () => {
        expect(formatAppVersion("0.1.7", "")).toBe("v0.1.7");
    });

    it("does not double-prefix a version that already starts with v", () => {
        expect(formatAppVersion("v0.1.7", "")).toBe("v0.1.7");
    });

    it("appends the commit only for a valid 7-char hex", () => {
        expect(formatAppVersion("0.1.7", "58fe01d")).toBe("v0.1.7 (58fe01d)");
        expect(formatAppVersion("0.1.7", "58FE01D")).toBe("v0.1.7 (58fe01d)");
        expect(formatAppVersion("0.1.7", "58fe01")).toBe("v0.1.7");
        expect(formatAppVersion("0.1.7", "58fe01d9")).toBe("v0.1.7");
        expect(formatAppVersion("0.1.7", "zzzzzzz")).toBe("v0.1.7");
    });

    it("returns dev alone when there is neither a version nor a commit", () => {
        const { version, commit } = resolveAppVersion({ gitTag: "", envRefName: "", gitSha: "", envSha: "" });
        expect(formatAppVersion(version, commit)).toBe("dev");
        expect(formatAppVersion("dev", "")).toBe("dev");
    });
});
