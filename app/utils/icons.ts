/**
 * Every icon the app renders, as Iconify codes (copy them from Icônes, https://icones.js.org). One
 * collection only: Lucide, served from the local `@iconify-json/lucide` package by `@nuxt/icon` and
 * bundled into the client, never fetched from the Iconify API. Add a code here before using it.
 */
export const ICONS = [
    "lucide:archive-restore",
    "lucide:briefcase",
    "lucide:check",
    "lucide:circle-alert",
    "lucide:circle-help",
    "lucide:circle-user-round",
    "lucide:cloud",
    "lucide:cloud-download",
    "lucide:cloud-off",
    "lucide:cloud-upload",
    "lucide:copy",
    "lucide:download",
    "lucide:file-text",
    "lucide:folder",
    "lucide:git-compare",
    "lucide:git-merge",
    "lucide:history",
    "lucide:id-card",
    "lucide:link",
    "lucide:loader-circle",
    "lucide:log-in",
    "lucide:refresh-cw",
    "lucide:settings",
    "lucide:shield-check",
    "lucide:trash-2",
    "lucide:triangle-alert",
    "lucide:unlink",
    "lucide:wifi-off",
] as const;

export type IconCode = (typeof ICONS)[number];
