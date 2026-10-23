/**
 * Every icon the app renders, as Iconify codes (copy them from Icônes, https://icones.js.org). One
 * collection only: Lucide, served from the local `@iconify-json/lucide` package by `@nuxt/icon` and
 * bundled into the client, never fetched from the Iconify API. Add a code here before using it.
 */
export const ICONS = [
    "lucide:circle-help",
    "lucide:circle-user-round",
    "lucide:file-text",
    "lucide:id-card",
    "lucide:log-in",
    "lucide:settings",
] as const;

export type IconCode = (typeof ICONS)[number];
