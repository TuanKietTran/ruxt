import { afterEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import { clerkOwnerId, getAuthPrincipal, requireAuthUser } from "../../server/utils/auth-user";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated principal mapping", () => {
   it("namespaces Clerk ids away from legacy owner ids", () => {
      expect(clerkOwnerId("user_123")).toBe("clerk:user_123");
      expect(() => clerkOwnerId("")).toThrow("Clerk user id is required");
   });

   it("derives cloud ownership only from verified Clerk request context", async () => {
      const event = {
         context: {
            auth: () => ({ userId: "user_verified" }),
         },
      } as unknown as H3Event;

      await expect(getAuthPrincipal(event)).resolves.toEqual({
         ownerId: "clerk:user_verified",
         provider: "clerk",
         providerUserId: "user_verified",
      });
   });

   it("supports a legacy authenticated owner during migration", async () => {
      vi.stubGlobal("getAuthSession", async () => ({ data: { userId: "legacy-owner" } }));
      const event = { context: {} } as unknown as H3Event;

      await expect(getAuthPrincipal(event)).resolves.toEqual({
         ownerId: "legacy-owner",
         provider: "legacy",
         providerUserId: "legacy-owner",
      });
   });

   it("rejects unauthenticated callers without assigning an owner", async () => {
      vi.stubGlobal("getAuthSession", async () => ({ data: {} }));
      vi.stubGlobal("createError", ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) =>
         Object.assign(new Error(statusMessage), { statusCode }));
      const event = { context: {} } as unknown as H3Event;

      await expect(getAuthPrincipal(event)).resolves.toBeNull();
      await expect(requireAuthUser(event)).rejects.toMatchObject({
         statusCode: 401,
         message: "Authentication required",
      });
   });
});
