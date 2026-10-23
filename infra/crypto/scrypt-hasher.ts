import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "@ruxt/core/domain/iam";
import { HashedPassword, PlainPassword } from "@ruxt/core/domain/iam";

type ScryptFn = (
   password: string | Buffer,
   salt: string | Buffer,
   keylen: number,
   options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const scryptAsync = promisify(scrypt) as unknown as ScryptFn;
const N = 16384,
   r = 8,
   p = 1,
   keylen = 64;
const WORKER_PBKDF2_ITERATIONS = 120_000;

type WorkerEnv = { __env__?: { RUXT_DB?: unknown } };
const isCloudflareWorker = () => Boolean((globalThis as typeof globalThis & WorkerEnv).__env__?.RUXT_DB);
const toHex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => Uint8Array.from(hex.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16));

async function deriveWorkerPassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
   const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
   const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
   return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, 256));
}

export class ScryptHasher implements PasswordHasher {
   async hash(plain: PlainPassword): Promise<HashedPassword> {
      if (isCloudflareWorker()) {
         const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
         const derived = await deriveWorkerPassword(plain.value, salt, WORKER_PBKDF2_ITERATIONS);
         return HashedPassword.fromHash(`pbkdf2$${WORKER_PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derived)}`);
      }
      const salt = randomBytes(32);
      const derived = await scryptAsync(plain.value, salt, keylen, { N, r, p });
      return HashedPassword.fromHash(`scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`);
   }

   async verify(plain: PlainPassword, hashed: HashedPassword): Promise<boolean> {
      const parts = hashed.hash.split("$");
      if (parts[0] === "pbkdf2" && parts.length === 4 && isCloudflareWorker()) {
         const iterations = Number(parts[1]);
         if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 500_000) return false;
         const salt = fromHex(parts[2]!);
         const expected = fromHex(parts[3]!);
         if (salt.length !== 32 || expected.length !== 32) return false;
         const actual = await deriveWorkerPassword(plain.value, salt, iterations);
         if (actual.length !== expected.length) return false;
         let difference = 0;
         for (let i = 0; i < actual.length; i++) difference |= actual[i]! ^ expected[i]!;
         return difference === 0;
      }
      if (parts.length !== 6 || parts[0] !== "scrypt") return false;
      const [, N_s, r_s, p_s, saltHex, hashHex] = parts as [string, string, string, string, string, string];
      const saltBuf = Buffer.from(saltHex, "hex");
      const expectedBuf = Buffer.from(hashHex, "hex");
      const derived = await scryptAsync(plain.value, saltBuf, keylen, {
         N: parseInt(N_s),
         r: parseInt(r_s),
         p: parseInt(p_s),
      });
      return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
   }
}
