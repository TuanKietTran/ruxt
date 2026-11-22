import { existsSync, readFileSync } from "node:fs";
import type { Page } from "playwright-core";

/**
 * Real Clerk sessions for browser tests, with no mocks and no captcha: the Backend API creates a
 * throwaway user and a one-time sign-in ticket, and the page redeems the ticket through ClerkJS, so the
 * browser holds a genuine Clerk session cookie that the app's server verifies.
 *
 * Needs a Clerk development instance. Set E2E_CLERK_SECRET_KEY (sk_test_...), or run `pnpm dev` without
 * Clerk keys: Nuxt's keyless mode writes a throwaway instance's key to .clerk/.tmp/keyless.json, which
 * is read here. A live (sk_live_) key is refused.
 */
export function clerkTestSecret(): string | null {
   const fromEnv = process.env.E2E_CLERK_SECRET_KEY;
   let secret = fromEnv ?? null;
   const keyless = new URL("../../.clerk/.tmp/keyless.json", import.meta.url);
   if (!secret && existsSync(keyless)) {
      try { secret = (JSON.parse(readFileSync(keyless, "utf8")) as { secretKey?: string }).secretKey ?? null; } catch { secret = null; }
   }
   if (secret && !secret.startsWith("sk_test_")) throw new Error("Clerk e2e tests only run against a development (sk_test_) instance");
   return secret;
}

async function clerkApi<T>(secret: string, path: string, init: RequestInit = {}): Promise<T> {
   let lastError: unknown;
   // The Backend API is reached over the public internet from the test runner; retry transient network errors.
   for (let attempt = 0; attempt < 4; attempt++) {
      try {
         const response = await fetch(`https://api.clerk.com/v1${path}`, {
            ...init,
            signal: AbortSignal.timeout(15_000),
            headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...(init.headers ?? {}) },
         });
         const text = await response.text();
         if (response.status >= 500 || response.status === 429) throw new Error(`Clerk ${path} ${response.status}`);
         if (!response.ok) throw Object.assign(new Error(`Clerk ${path} ${response.status}: ${text.slice(0, 200)}`), { permanent: true });
         return (text ? JSON.parse(text) : {}) as T;
      } catch (error) {
         lastError = error;
         if ((error as { permanent?: boolean }).permanent) throw error;
         await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
   }
   throw lastError;
}

export interface ClerkTestUser { id: string; email: string; ownerId: string }

export async function createClerkTestUser(secret: string, label: string): Promise<ClerkTestUser> {
   const email = `ruxt-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}+clerk_test@example.com`;
   const user = await clerkApi<{ id: string }>(secret, "/users", {
      method: "POST",
      body: JSON.stringify({ email_address: [email], password: "Ruxt-E2e-Passw0rd!x9q", skip_password_checks: true }),
   });
   return { id: user.id, email, ownerId: `clerk:${user.id}` };
}

export async function deleteClerkTestUser(secret: string, user: ClerkTestUser): Promise<void> {
   await clerkApi(secret, `/users/${user.id}`, { method: "DELETE" }).catch(() => undefined);
}

/** Sign the page's browser in as `user` without leaving the page (exactly what the sign-in dialog does). */
export async function signInPage(secret: string, page: Page, user: ClerkTestUser): Promise<void> {
   const ticket = (await clerkApi<{ token: string }>(secret, "/sign_in_tokens", {
      method: "POST",
      body: JSON.stringify({ user_id: user.id, expires_in_seconds: 300 }),
   })).token;
   await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded), null, { timeout: 30_000 });
   await page.evaluate(async (value) => {
      const clerk = (window as unknown as { Clerk: { client: { signIn: { create(input: object): Promise<{ createdSessionId: string }> } }; setActive(input: object): Promise<void> } }).Clerk;
      const attempt = await clerk.client.signIn.create({ strategy: "ticket", ticket: value });
      await clerk.setActive({ session: attempt.createdSessionId });
   }, ticket);
}

export function clerkUserId(page: Page): Promise<string | null> {
   return page.evaluate(() => (window as unknown as { Clerk?: { user?: { id: string } | null } }).Clerk?.user?.id ?? null);
}

/** End a session on Clerk's side, as an administrator or an expiry would, without any browser action. */
export async function revokeClerkSession(secret: string, page: Page): Promise<void> {
   const sessionId = await page.evaluate(() => (window as unknown as { Clerk?: { session?: { id: string } | null } }).Clerk?.session?.id ?? null);
   if (!sessionId) throw new Error("The page has no Clerk session to revoke");
   await clerkApi(secret, `/sessions/${sessionId}/revoke`, { method: "POST" });
}
