/** An account request is never sent anonymously; an expired session falls back locally without retry. */
export async function accountRequest<T>(signedIn: boolean, expire: () => void, send: () => Promise<T>): Promise<T | null> {
    if (!signedIn) return null;
    try {
        return await send();
    } catch (error: unknown) {
        const cause = error as { status?: number; statusCode?: number; response?: { status?: number }; data?: { statusCode?: number } };
        if ((cause?.statusCode ?? cause?.status ?? cause?.response?.status ?? cause?.data?.statusCode) !== 401) throw error;
        expire();
        return null;
    }
}
