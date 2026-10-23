/** Accept only same-origin path redirects carried through authentication. */
export function safeAuthRedirect(value?: string | null): string | null {
    return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
        ? value
        : null;
}
