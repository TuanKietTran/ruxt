import type { FetchOptions } from "ofetch";
import { accountRequest } from "~/utils/accountRequest";

/** Account-only API boundary. Always disables transport retries, including after an expired session. */
export function useAccountFetch() {
    const { user, expireSession } = useAppAuth();
    const { authenticated } = useFeatureFlags();
    // Use the transport signature rather than Nitro's route-inferred response union.
    const fetch = useRequestFetch() as typeof import("ofetch").$fetch;
    return <T>(url: string, options?: FetchOptions<"json">): Promise<T | null> => accountRequest(
        authenticated.value && Boolean(user.value),
        expireSession,
        () => fetch<T>(url, { ...options, retry: 0 }),
    );
}
