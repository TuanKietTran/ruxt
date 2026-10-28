import { describe, expect, it, vi } from "vitest";
import { accountRequest } from "../../app/utils/accountRequest";

describe("account request boundary", () => {
    it("makes zero requests when signed out", async () => {
        const send = vi.fn();
        const expire = vi.fn();
        expect(await accountRequest(false, expire, send)).toBeNull();
        expect(send).not.toHaveBeenCalled();
        expect(expire).not.toHaveBeenCalled();
    });

    it("expires quietly on 401, never retries, and suppresses later requests", async () => {
        let signedIn = true;
        const expire = vi.fn(() => { signedIn = false; });
        const send = vi.fn(async () => { throw { statusCode: 401 }; });
        expect(await accountRequest(signedIn, expire, send)).toBeNull();
        expect(await accountRequest(signedIn, expire, send)).toBeNull();
        expect(send).toHaveBeenCalledTimes(1);
        expect(expire).toHaveBeenCalledTimes(1);
    });

    it("does not hide non-auth failures", async () => {
        await expect(accountRequest(true, vi.fn(), async () => { throw new Error("network"); })).rejects.toThrow("network");
    });
});
