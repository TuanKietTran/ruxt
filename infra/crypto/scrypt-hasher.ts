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

export class ScryptHasher implements PasswordHasher {
   async hash(plain: PlainPassword): Promise<HashedPassword> {
      const salt = randomBytes(32);
      const derived = await scryptAsync(plain.value, salt, keylen, { N, r, p });
      const encoded = `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
      return HashedPassword.fromHash(encoded);
   }

   async verify(
      plain: PlainPassword,
      hashed: HashedPassword,
   ): Promise<boolean> {
      const parts = hashed.hash.split("$");
      if (parts.length !== 6 || parts[0] !== "scrypt") return false;
      const [, N_s, r_s, p_s, saltHex, hashHex] = parts as [
         string,
         string,
         string,
         string,
         string,
         string,
      ];
      const saltBuf = Buffer.from(saltHex, "hex");
      const expectedBuf = Buffer.from(hashHex, "hex");
      const derived = await scryptAsync(plain.value, saltBuf, keylen, {
         N: parseInt(N_s),
         r: parseInt(r_s),
         p: parseInt(p_s),
      });
      return timingSafeEqual(derived, expectedBuf);
   }
}
