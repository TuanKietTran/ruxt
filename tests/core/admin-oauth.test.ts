import { describe, expect, it } from "vitest";
import { validateAdminProductionAuth } from "../../admin/server/lib/admin-env";
import {
   isAllowedGithubUser,
   isTrustedAdminOrigin,
   normalizeAdminOrigin,
   parseGithubAllowlist,
   resolveOauthRedirectUri,
   safeRedirectPath,
} from "../../admin/server/lib/oauth";

describe("admin OAuth policy", () => {
   it("matches immutable numeric GitHub ids only", () => {
      expect([...parseGithubAllowlist("35926768, nope, 42")]).toEqual(["35926768", "42"]);
      expect([...parseGithubAllowlist(35926768)]).toEqual(["35926768"]);
      expect(isAllowedGithubUser(35926768, "35926768")).toBe(true);
      expect(isAllowedGithubUser(35926768, 35926768)).toBe(true);
      expect(isAllowedGithubUser("35926768", "35926768")).toBe(true);
      expect(isAllowedGithubUser("TuanKietTran", "35926768")).toBe(false);
      expect(isAllowedGithubUser(1.2, "1")).toBe(false);
   });

   it("accepts only same-origin path redirects", () => {
      expect(safeRedirectPath("/templates?draft=1")).toBe("/templates?draft=1");
      expect(safeRedirectPath("https://evil.example")).toBe("/");
      expect(safeRedirectPath("//evil.example")).toBe("/");
      expect(safeRedirectPath("/\\evil.example")).toBe("/");
      expect(safeRedirectPath("/login?redirect=/templates")).toBe("/");
      expect(safeRedirectPath("/oauth/github")).toBe("/");
      expect(safeRedirectPath("/api/me")).toBe("/");
   });

   it("canonicalizes the configured production origin", () => {
      expect(normalizeAdminOrigin("https://admin.example.com")).toBe("https://admin.example.com");
      expect(normalizeAdminOrigin("https://admin.example.com/")).toBe("https://admin.example.com");
      expect(normalizeAdminOrigin("https://admin.example.com/path")).toBeNull();
      expect(normalizeAdminOrigin("https://user:pass@admin.example.com")).toBeNull();
      expect(isTrustedAdminOrigin("https://admin.example.com", "https://admin.example.com")).toBe(true);
      expect(isTrustedAdminOrigin("https://evil.example", "https://admin.example.com")).toBe(false);
      expect(isTrustedAdminOrigin(undefined, "https://admin.example.com")).toBe(false);
   });

   it("pins the OAuth callback to the configured admin origin", () => {
      const origin = "https://admin.example.com";
      expect(resolveOauthRedirectUri(origin, "")).toBe(`${origin}/oauth/github`);
      expect(resolveOauthRedirectUri(origin, `${origin}/oauth/github`)).toBe(`${origin}/oauth/github`);
      expect(resolveOauthRedirectUri(origin, "https://evil.example/oauth/github")).toBe(`${origin}/oauth/github`);
      expect(resolveOauthRedirectUri(origin, `${origin}/other`)).toBe(`${origin}/oauth/github`);
   });

   it("rejects incomplete or ambiguous production auth configuration", () => {
      const valid = {
         adminOrigin: "https://admin.example.com",
         sessionSecret: "a-unique-session-secret-with-more-than-32-characters",
         github: { clientId: "client", clientSecret: "secret", allowedIds: "35926768", redirectUrl: "https://admin.example.com/oauth/github" },
      };
      expect(validateAdminProductionAuth(valid)).toEqual([]);
      expect(validateAdminProductionAuth({
         adminOrigin: "http://admin.example.com/path",
         sessionSecret: "short",
         github: { clientId: "", clientSecret: "", allowedIds: "login-name", redirectUrl: "https://evil.example/oauth/github" },
      })).toEqual(expect.arrayContaining([
         expect.stringContaining("NUXT_SESSION_SECRET"),
         expect.stringContaining("NUXT_ADMIN_ORIGIN"),
         expect.stringContaining("NUXT_GITHUB_CLIENT_ID"),
         expect.stringContaining("NUXT_GITHUB_ALLOWED_IDS"),
      ]));
      expect(validateAdminProductionAuth({
         ...valid,
         github: { ...valid.github, redirectUrl: "https://evil.example/oauth/github" },
      })).toContain("NUXT_GITHUB_REDIRECT_URL must equal NUXT_ADMIN_ORIGIN + /oauth/github");
   });
});
