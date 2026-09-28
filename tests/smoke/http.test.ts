import { beforeAll, describe, expect, it } from "vitest";

/**
 * Opt-in smoke suite. It runs only when SMOKE_BASE_URL points at a running
 * server (`pnpm dev`, then `pnpm test:smoke`); otherwise every case is skipped
 * so the default `pnpm test` stays hermetic.
 */
const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const smoke = baseUrl ? describe : describe.skip;

const call = async (path: string, init?: RequestInit) => {
   const response = await fetch(`${baseUrl}${path}`, init);
   const text = await response.text();
   let body: unknown = text;
   try { body = JSON.parse(text); } catch { /* non-JSON responses stay raw */ }
   return { status: response.status, body, headers: response.headers };
};

const json = (payload: unknown): RequestInit => ({
   method: "POST",
   headers: { "content-type": "application/json" },
   body: JSON.stringify(payload),
});

smoke("HTTP smoke", () => {
   beforeAll(async () => {
      const reachable = await fetch(`${baseUrl}/api/health`).then(() => true).catch(() => false);
      if (!reachable) throw new Error(`No server at ${baseUrl}; start \`pnpm dev\` first`);
   }, 30_000);

   it("serves health", async () => {
      expect((await call("/api/health")).status).toBe(200);
   });

   it("requires a session to inspect CV pipeline capabilities", async () => {
      expect((await call("/api/cv-capabilities")).status).toBe(401);
   });

   it("lists public CV templates unauthenticated", async () => {
      const { status, body } = await call("/api/public/templates");
      expect(status).toBe(200);
      expect(Array.isArray(body) || Array.isArray((body as { templates?: unknown[] }).templates)).toBe(true);
   });

   it("requires a session to save a CV template", async () => {
      const { status } = await call("/api/cv-templates", json({ name: "x", markdownSkeleton: "# X", css: "" }));
      expect(status).toBe(401);
   });

   it("requires a session to read or change cloud-data consent", async () => {
      expect((await call("/api/cloud-data/consent")).status).toBe(401);
      expect((await call("/api/cloud-data/consent", {
         method: "PUT",
         headers: { "content-type": "application/json" },
         body: JSON.stringify({ category: "cloudSessions", granted: true }),
      })).status).toBe(401);
   });

   it("keeps cloud-data consent denied by default and stores an explicit grant", async () => {
      const registration = await call("/api/auth/register", json({
         email: `smoke-consent-${Date.now()}@example.com`,
         password: "smoke-test-password",
      }));
      expect(registration.status).toBe(201);
      const cookie = registration.headers.get("set-cookie")?.split(";", 1)[0];
      expect(cookie).toBeTruthy();

      const initial = await call("/api/cloud-data/consent", { headers: { cookie: cookie! } });
      expect(initial.status).toBe(200);
      expect(initial.body).toMatchObject({
         cloudSessions: { granted: false },
         cloudTemplates: { granted: false },
      });

      const changed = await call("/api/cloud-data/consent", {
         method: "PUT",
         headers: { "content-type": "application/json", cookie: cookie! },
         body: JSON.stringify({ category: "cloudSessions", granted: true }),
      });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({
         cloudSessions: { granted: true },
         cloudTemplates: { granted: false },
      });
   });

   it("completes the legacy sign-up, session, logout, and login compatibility scenario", async () => {
      const email = `smoke-auth-${Date.now()}@example.com`;
      const password = "smoke-test-password";
      const registration = await call("/api/auth/register", json({ email: `  ${email.toUpperCase()}  `, password }));
      expect(registration.status).toBe(201);
      const signupCookie = registration.headers.get("set-cookie")?.split(";", 1)[0];
      expect(signupCookie).toBeTruthy();

      const signedUp = await call("/api/auth/me", { headers: { cookie: signupCookie! } });
      expect(signedUp.status).toBe(200);
      expect(signedUp.body).toMatchObject({ email });
      expect(signedUp.body).not.toHaveProperty("passwordHash");

      const logout = await call("/api/auth/logout", { method: "POST", headers: { cookie: signupCookie! } });
      expect(logout.status).toBe(200);
      const clearedCookie = logout.headers.get("set-cookie")?.split(";", 1)[0];
      expect(clearedCookie).toBeTruthy();
      expect((await call("/api/auth/me", { headers: { cookie: clearedCookie! } })).status).toBe(401);

      expect((await call("/api/auth/login", json({ email, password: "incorrect" }))).status).toBe(401);
      const login = await call("/api/auth/login", json({ email: email.toUpperCase(), password }));
      expect(login.status).toBe(200);
      const loginCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
      expect(loginCookie).toBeTruthy();
      expect((await call("/api/auth/me", { headers: { cookie: loginCookie! } })).status).toBe(200);
   });

   it("keeps authenticated cloud-data ownership isolated and ignores body owner ids", async () => {
      const stamp = `${Date.now()}-${Math.random()}`;
      const register = async (label: string) => {
         const response = await call("/api/auth/register", json({
            email: `smoke-owner-${label}-${stamp}@example.com`,
            password: "smoke-test-password",
         }));
         expect(response.status).toBe(201);
         const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
         expect(cookie).toBeTruthy();
         return { cookie: cookie!, userId: (response.body as { userId: string }).userId };
      };
      const alice = await register("alice");
      const bob = await register("bob");

      const changed = await call("/api/cloud-data/consent", {
         method: "PUT",
         headers: { "content-type": "application/json", cookie: alice.cookie },
         body: JSON.stringify({
            category: "cloudTemplates",
            granted: true,
            userId: bob.userId,
            ownerId: bob.userId,
         }),
      });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ cloudTemplates: { granted: true } });

      const aliceView = await call("/api/cloud-data/consent", { headers: { cookie: alice.cookie } });
      const bobView = await call("/api/cloud-data/consent", { headers: { cookie: bob.cookie } });
      expect(aliceView.body).toMatchObject({ cloudTemplates: { granted: true } });
      expect(bobView.body).toMatchObject({ cloudTemplates: { granted: false } });
   });

   it("rejects malformed registration before touching persistence", async () => {
      const { status } = await call("/api/auth/register", json({ email: "", password: "" }));
      expect(status).toBe(400);
   });

   it("rejects invalid credentials", async () => {
      const { status } = await call("/api/auth/login", json({ email: "nobody@example.com", password: "wrong-password" }));
      expect(status).toBe(401);
   });

   it("reports no session for an anonymous caller", async () => {
      const { status, body } = await call("/api/auth/me");
      expect([200, 401]).toContain(status);
      if (status === 200) expect(body).not.toHaveProperty("passwordHash");
   });

   it("answers MCP initialize over Streamable HTTP", async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
         method: "POST",
         headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
         body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
         }),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("cv-sv");
   });

   it("serves the editor shell", async () => {
      const { status, body } = await call("/");
      expect(status).toBe(200);
      expect(String(body)).toContain("<html");
   });

   it("serves the unauthenticated local profile editor", async () => {
      expect((await call("/p")).status).toBe(200);
   });

});
