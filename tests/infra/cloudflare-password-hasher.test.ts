import { afterEach, describe, expect, it } from "vitest";
import { HashedPassword, PlainPassword } from "@ruxt/core/domain/iam";
import { ScryptHasher } from "../../infra/crypto/scrypt-hasher";

const globalEnv = globalThis as typeof globalThis & { __env__?: Record<string, unknown> };
afterEach(() => { delete globalEnv.__env__; });

describe("Cloudflare password hashing", () => {
   it("uses WebCrypto PBKDF2 in Workers and verifies without Node scrypt", async () => {
      globalEnv.__env__ = { RUXT_DB: {} };
      const hasher = new ScryptHasher();
      const plain = new PlainPassword({ value: "local-test-password" });
      const hashed = await hasher.hash(plain);
      expect(hashed.hash).toMatch(/^pbkdf2\$120000\$/);
      expect(await hasher.verify(plain, hashed)).toBe(true);
      expect(await hasher.verify(new PlainPassword({ value: "wrong-password" }), hashed)).toBe(false);
   });

   it("rejects malformed or unreasonable PBKDF2 parameter strings", async () => {
      globalEnv.__env__ = { RUXT_DB: {} };
      const hasher = new ScryptHasher();
      expect(await hasher.verify(new PlainPassword({ value: "password" }), HashedPassword.fromHash("pbkdf2$1$aa$bb"))).toBe(false);
   });
});
