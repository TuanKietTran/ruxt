import { describe, expect, it } from "vitest";
import {
    PROFILE_TOKEN_PREFIX,
    ProfileTransferError,
    decryptProfiles,
    encryptProfiles,
    envelopeToFile,
    envelopeToToken,
    parseEnvelope,
} from "../../app/utils/profileTransfer";
import type { CvProfileProps } from "@ruxt/shared/cv";

const profile: CvProfileProps = {
    version: 1,
    identity: { fullName: "Ada Lovelace", headline: "Engineer", summary: "Builder", location: "London" },
    contacts: [{ kind: "email", label: "Email", value: "ada@example.test" }],
    experiences: [{ title: "Engineer", company: "Analytical Engines", location: "London", start: "1842", end: "1843", highlights: ["Notes"] }],
    skills: [{ name: "Languages", skills: ["Ada"] }],
    certifications: [{ name: "Certificate" }],
    education: [{ degree: "Mathematics", school: "University", location: "London", start: "1835", end: "1839", details: "" }],
    projects: [{ name: "Engine", url: "https://example.test", description: "A project", technologies: ["Ada"] }],
    languages: ["English"],
};
const passphrase = "correct horse battery";

describe("encrypted profile transfer", () => {
    it("round-trips profiles through the clipboard token and the file form", async () => {
        const envelope = await encryptProfiles([profile], passphrase);
        const token = envelopeToToken(envelope);
        expect(token.startsWith(PROFILE_TOKEN_PREFIX)).toBe(true);
        expect(token).not.toContain("Ada");
        expect(envelopeToFile(envelope)).not.toContain("Ada");

        await expect(decryptProfiles(token, passphrase)).resolves.toEqual([profile]);
        await expect(decryptProfiles(envelopeToFile(envelope), passphrase)).resolves.toEqual([profile]);
    });

    it("uses a fresh salt and IV per export", async () => {
        const [first, second] = await Promise.all([encryptProfiles([profile], passphrase), encryptProfiles([profile], passphrase)]);
        expect(first.kdf.salt).not.toBe(second.kdf.salt);
        expect(first.cipher.iv).not.toBe(second.cipher.iv);
        expect(first.data).not.toBe(second.data);
    });

    it("rejects a wrong passphrase and tampered ciphertext", async () => {
        const envelope = await encryptProfiles([profile], passphrase);
        await expect(decryptProfiles(envelopeToToken(envelope), "wrong passphrase")).rejects.toMatchObject({ code: "decrypt" });

        const flipped = envelope.data.startsWith("A") ? `B${envelope.data.slice(1)}` : `A${envelope.data.slice(1)}`;
        await expect(decryptProfiles(JSON.stringify({ ...envelope, data: flipped }), passphrase)).rejects.toMatchObject({ code: "decrypt" });
    });

    it("rejects short passphrases and unsupported input", async () => {
        await expect(encryptProfiles([profile], "short")).rejects.toMatchObject({ code: "passphrase" });
        expect(() => parseEnvelope("hello")).toThrow(ProfileTransferError);
        expect(() => parseEnvelope(`${PROFILE_TOKEN_PREFIX}!!!`)).toThrow(ProfileTransferError);
        const envelope = await encryptProfiles([profile], passphrase);
        expect(() => parseEnvelope(JSON.stringify({ ...envelope, kdf: { ...envelope.kdf, iterations: 1e9 } }))).toThrow(ProfileTransferError);
    });
});
