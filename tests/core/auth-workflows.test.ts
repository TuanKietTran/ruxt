import { describe, expect, it } from "vitest";
import { createLoginUserHandler } from "@core/handlers/login-user";
import { createRegisterUserHandler } from "@core/handlers/register-user";
import { HashedPassword, type PasswordHasher, type PlainPassword } from "@core/domain/iam/password";
import type { StoredUser, UserRepository } from "@core/repos/user.repo";
import { safeAuthRedirect } from "../../app/utils/auth-redirect";

class InMemoryUsers implements UserRepository {
   readonly users = new Map<string, StoredUser>();

   async findByEmail(email: string) {
      return [...this.users.values()].find(user => user.email === email) ?? null;
   }

   async findById(id: string) {
      return this.users.get(id) ?? null;
   }

   async save(user: StoredUser) {
      this.users.set(user.id, structuredClone(user));
   }
}

class DeterministicHasher implements PasswordHasher {
   async hash(plain: PlainPassword) {
      return HashedPassword.fromHash(`test-hash:${plain.value}`);
   }

   async verify(plain: PlainPassword, hashed: HashedPassword) {
      return hashed.hash === `test-hash:${plain.value}`;
   }
}

const execute = async <I, O>(handler: {
   execute(input: I): Promise<{ success: true; data: O } | { success: false; error: string }>;
}, input: I) => handler.execute(input);

describe("sign-up and login workflows", () => {
   it("signs up with a canonical email and never persists the plain password", async () => {
      const users = new InMemoryUsers();
      const result = await execute(createRegisterUserHandler(users, new DeterministicHasher()), {
         email: "  Ada@Example.COM ",
         password: "correct horse battery staple",
      });

      expect(result.success).toBe(true);
      const stored = [...users.users.values()][0];
      expect(stored).toMatchObject({
         email: "ada@example.com",
         passwordHash: "test-hash:correct horse battery staple",
      });
      expect(JSON.stringify(stored)).not.toContain('"password":"');
   });

   it("rejects duplicate canonical email addresses without creating another owner", async () => {
      const users = new InMemoryUsers();
      const signUp = createRegisterUserHandler(users, new DeterministicHasher());
      await execute(signUp, { email: "ada@example.com", password: "first password" });
      const duplicate = await execute(signUp, { email: " ADA@example.com ", password: "second password" });

      expect(duplicate).toEqual({ success: false, error: "Email already registered" });
      expect(users.users.size).toBe(1);
   });

   it("logs in after sign-up using normalized credentials", async () => {
      const users = new InMemoryUsers();
      const hasher = new DeterministicHasher();
      const signUp = await execute(createRegisterUserHandler(users, hasher), {
         email: "ada@example.com",
         password: "correct password",
      });
      expect(signUp.success).toBe(true);
      if (!signUp.success) throw new Error(signUp.error);

      await expect(execute(createLoginUserHandler(users, hasher), {
         email: " ADA@EXAMPLE.COM ",
         password: "correct password",
      })).resolves.toEqual({ success: true, data: { userId: signUp.data.userId } });
   });

   it.each([
      ["missing@example.com", "anything"],
      ["ada@example.com", "wrong password"],
   ])("returns one generic failure for unknown users and incorrect passwords", async (email, password) => {
      const users = new InMemoryUsers();
      const hasher = new DeterministicHasher();
      await execute(createRegisterUserHandler(users, hasher), {
         email: "ada@example.com",
         password: "correct password",
      });

      await expect(execute(createLoginUserHandler(users, hasher), { email, password }))
         .resolves.toEqual({ success: false, error: "Invalid email or password" });
   });
});

describe("authentication redirects", () => {
   it.each(["/", "/d", "/settings/cloud-data", "/?s=cv-1&tab=style"])(
      "accepts same-origin path %s",
      path => expect(safeAuthRedirect(path)).toBe(path),
   );

   it.each([undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example"])(
      "rejects unsafe redirect %s",
      value => expect(safeAuthRedirect(value)).toBeNull(),
   );
});
