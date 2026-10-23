import { normalizeCvProfile, type CvProfileProps } from "@ruxt/shared/cv";

/**
 * Passphrase-encrypted transport for local CV profiles.
 *
 * Profiles are serialized to JSON, encrypted with AES-256-GCM using a key
 * derived from the passphrase via PBKDF2-SHA256, and wrapped in a versioned
 * envelope. The same envelope is used for files (pretty JSON) and for the
 * clipboard (a single-line `cvsv-profile:` token), so either form imports.
 */

export const PROFILE_TOKEN_PREFIX = "cvsv-profile:";
export const PROFILE_FILE_EXTENSION = ".cvsv";
export const MIN_PASSPHRASE_LENGTH = 8;

const FORMAT = "cvsv-profile";
const PBKDF2_ITERATIONS = 310_000;
const MAX_PBKDF2_ITERATIONS = 5_000_000;

export interface EncryptedProfileEnvelope {
    format: typeof FORMAT;
    v: 1;
    kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
    cipher: { name: "AES-GCM"; iv: string };
    data: string;
}

export class ProfileTransferError extends Error {
    constructor(message: string, readonly code: "passphrase" | "format" | "decrypt") {
        super(message);
        this.name = "ProfileTransferError";
    }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array) => {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new ProfileTransferError("The encrypted data is malformed.", "format");
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const deriveKey = async (passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage) => {
    const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        [usage],
    );
};

const assertPassphrase = (passphrase: string) => {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new ProfileTransferError(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`, "passphrase");
    }
};

export async function encryptProfiles(profiles: CvProfileProps[], passphrase: string): Promise<EncryptedProfileEnvelope> {
    assertPassphrase(passphrase);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, "encrypt");
    const plaintext = encoder.encode(JSON.stringify({ profiles: profiles.map(normalizeCvProfile) }));
    const header = { format: FORMAT, v: 1 } as const;
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(JSON.stringify(header)) },
        key,
        plaintext,
    );
    return {
        ...header,
        kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: toBase64Url(salt) },
        cipher: { name: "AES-GCM", iv: toBase64Url(iv) },
        data: toBase64Url(new Uint8Array(ciphertext)),
    };
}

export const envelopeToToken = (envelope: EncryptedProfileEnvelope) =>
    PROFILE_TOKEN_PREFIX + toBase64Url(encoder.encode(JSON.stringify(envelope)));

export const envelopeToFile = (envelope: EncryptedProfileEnvelope) => `${JSON.stringify(envelope, null, 2)}\n`;

/** Parses either a clipboard token or the JSON contents of an exported file. */
export function parseEnvelope(input: string): EncryptedProfileEnvelope {
    const text = input.trim();
    let raw: unknown;
    try {
        raw = text.startsWith(PROFILE_TOKEN_PREFIX)
            ? JSON.parse(decoder.decode(fromBase64Url(text.slice(PROFILE_TOKEN_PREFIX.length).replace(/\s+/g, ""))))
            : JSON.parse(text);
    } catch (error) {
        if (error instanceof ProfileTransferError) throw error;
        throw new ProfileTransferError("This is not an encrypted profile export.", "format");
    }
    const value = raw as Partial<EncryptedProfileEnvelope> | null;
    const iterations = value?.kdf?.iterations;
    if (
        value?.format !== FORMAT || value.v !== 1
        || value.kdf?.name !== "PBKDF2" || value.kdf.hash !== "SHA-256"
        || typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS
        || typeof value.kdf.salt !== "string" || value.cipher?.name !== "AES-GCM"
        || typeof value.cipher.iv !== "string" || typeof value.data !== "string"
    ) {
        throw new ProfileTransferError("This is not a supported encrypted profile export.", "format");
    }
    return value as EncryptedProfileEnvelope;
}

export async function decryptProfiles(input: string, passphrase: string): Promise<CvProfileProps[]> {
    const envelope = parseEnvelope(input);
    const salt = fromBase64Url(envelope.kdf.salt);
    const iv = fromBase64Url(envelope.cipher.iv);
    const ciphertext = fromBase64Url(envelope.data);
    const key = await deriveKey(passphrase, salt, envelope.kdf.iterations, "decrypt");
    let plaintext: ArrayBuffer;
    try {
        plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv, additionalData: encoder.encode(JSON.stringify({ format: envelope.format, v: envelope.v })) },
            key,
            ciphertext,
        );
    } catch {
        throw new ProfileTransferError("Wrong passphrase or corrupted data.", "decrypt");
    }
    let payload: { profiles?: unknown };
    try {
        payload = JSON.parse(decoder.decode(plaintext));
    } catch {
        throw new ProfileTransferError("The decrypted data is not valid profile JSON.", "format");
    }
    if (!Array.isArray(payload?.profiles)) throw new ProfileTransferError("The export contains no profiles.", "format");
    return payload.profiles.map(normalizeCvProfile);
}
