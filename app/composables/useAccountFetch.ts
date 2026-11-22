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
        // Name the account this page believes it is, so a tab that missed an account switch is refused, not obeyed.
        () => fetch<T>(url, { ...options, retry: 0, headers: { ...(options?.headers as Record<string, string> | undefined), "x-ruxt-expected-owner": user.value?.id ?? "" } }),
    );
}
