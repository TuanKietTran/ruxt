import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveAppVersion } from "./app/utils/app-version";
import { ICONS } from "./app/utils/icons";

const infraPath = fileURLToPath(new URL("./infra", import.meta.url));
// Nitro's custom storage drivers are dynamically loaded as ESM; preserve file:// URLs on Windows.
const chunkedDenoKvDriver = pathToFileURL(fileURLToPath(new URL("./server/storage/chunked-deno-kv.ts", import.meta.url))).href;
const chunkedCloudflareKvDriver = pathToFileURL(fileURLToPath(new URL("./server/storage/chunked-cloudflare-kv.ts", import.meta.url))).href;
// Deno's native Nuxt builder uses the lightweight `deno-server` preset. The
// explicit build flag still selects Deno KV without forcing Nitro's much larger
// `deno-deploy` bundle, which exceeds Deno's standard build-memory limit.
const denoStorage = process.env.RUXT_DENO_STORAGE === "1" || process.env.NITRO_PRESET === "deno-deploy";
const cloudflareStorage = process.env.RUXT_CLOUDFLARE_STORAGE === "1";
// Libraries used only in the browser (dynamic imports in click handlers, editor mount hooks). Keeping them out of
// the Worker bundle is required to fit the 1 MiB compressed limit of the Workers Free plan.
const clientOnlyStub = fileURLToPath(new URL("./server/stubs/client-only.mjs", import.meta.url));
const cloudflareServerAlias = cloudflareStorage
   ? Object.fromEntries(["html2canvas", "jszip", "docx", "@codemirror/language-data", "@codemirror/theme-one-dark"].map((name) => [name, clientOnlyStub]))
   : {};
const durableStorage = (base: string, directory: string, kvOptions: Record<string, unknown> = {}) => denoStorage
   ? { driver: chunkedDenoKvDriver, base }
   : cloudflareStorage
      ? { driver: chunkedCloudflareKvDriver, base, binding: "RUXT_KV", ...kvOptions }
      : { driver: "fs", base: process.env[directory] ?? `./.data/${base}` };

const gitTag = (): string => {
   try {
      return execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
   } catch {
      return "";
   }
};
const gitSha = (): string => {
   try {
      return execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim();
   } catch {
      return "";
   }
};
const { version: appVersion, commit: appCommit } = resolveAppVersion({
   gitTag: gitTag(),
   envRefName: process.env.GITHUB_REF_NAME,
   gitSha: gitSha(),
   envSha: process.env.GITHUB_SHA,
});

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   extends: ["@ruxt/editor"],
   compatibilityDate: "2025-07-15",
   modules: ["@clerk/nuxt", "@nuxt/icon"],
   icon: {
      // Every icon in app/utils/icons.ts (lint-enforced) is inlined into the client bundle from the
      // local Lucide collection, so no server icon endpoint or Iconify API request is ever needed.
      serverBundle: false,
      clientBundle: { icons: [...ICONS], scan: false },
      fallbackToApi: false,
   },
   clerk: {
      // Clerk is installed explicitly by server/middleware/00-clerk.ts: the module appends its own handler
      // after the app's middleware, so every middleware above it would see no authenticated user.
      skipServerMiddleware: true,
      signInUrl: "/login",
      signUpUrl: "/login?mode=signup",
      signInFallbackRedirectUrl: "/",
      signUpFallbackRedirectUrl: "/",
      // No SDK telemetry from the browser or the Worker (each report is an extra outbound request).
      telemetry: { disabled: true },
   },
   runtimeConfig: {
      cvArtifactTtlHours: 24,
      cvImportMaxBytes: 15 * 1024 * 1024,
      // Nuxt applies NUXT_SESSION_SECRET at runtime. Keep this fallback local-only;
      // deployed Deno timelines are validated by validate-deployment-env.ts.
      sessionSecret: "dev-only-secret-change-me-in-production!!",
      // Job automation (Job CV Finder core). Server-only: NUXT_JOB_AUTOMATION_URL / _TOKEN / _OWNER.
      // Empty values keep the feature unavailable; the token never reaches the browser.
      jobAutomation: { url: "", token: "", owner: "" },
      // Legacy email/password accounts. Registration is closed unless NUXT_LEGACY_AUTH_REGISTRATION=true (local
      // test servers); existing legacy sessions and logins keep working until they are migrated to Clerk.
      legacyAuth: { registration: false },
      // Cloud data retention (NUXT_CLOUD_RETENTION_*). Every value is required before cloud consent,
      // the retention notice or session copies are enabled; empty values keep them fail-closed.
      cloudRetention: {
         noticeVersion: "",
         sessionCurrentCopyRetentionDays: 0,
         templateRetentionDays: 0,
         profileRetentionDays: 0,
         checkpointRetentionDays: 0,
         retentionExtensionDays: 0,
      },
      // Per-kind caps of cloud copies per account (NUXT_CLOUD_COPY_LIMITS_<KIND>). 0 or empty uses the default
      // (20 per kind, 1 job preferences record); a value above 1000 is ignored.
      cloudCopyLimits: { session: 0, template: 0, profile: 0, jobPreferences: 0 },
      // Push tickets are signed with NUXT_CLOUD_SYNC_TICKET_SECRET, else the session secret.
      cloudSync: { ticketSecret: "" },
      public: {
         appVersion,
         appCommit,
         // Compatibility flags for old bundles: server CV routes, streams and revision probes are retired.
         cvLiveEvents: false,
         cvPollSeconds: 0,
         featureFlags: {
            // Deployment-owned comma-separated route and host patterns. No
            // environment policy is embedded in the application package.
            authDisabledHosts: "",
            authRoutes: "",
         },
      },
   },
   devtools: { enabled: true },
   experimental: { serverAppConfig: false },

   css: ['~/assets/theme/themes.css'],

   alias: {
      "@infra": infraPath,
   },

   vite: {
      build: {
         modulePreload: { polyfill: false },
      },
      $server: {
         // `$server` resolve options are typed without `alias`, but Nuxt forwards them to Vite unchanged.
         resolve: { alias: cloudflareServerAlias } as Record<string, unknown>,
      },
      optimizeDeps: {
         include: [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/commands",
            "@codemirror/language",
            "@lezer/highlight",
            "@codemirror/lang-markdown",
            "@codemirror/lang-css",
            "@codemirror/language-data",
            "@codemirror/theme-one-dark",
         ],
      },
      resolve: {
         dedupe: [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@lezer/highlight",
         ],
      },
   },

   nitro: {
      experimental: {
         tasks: true,
      },
      // The queue processor invokes Python/filesystem tooling; Workers cron cannot run this task.
      scheduledTasks: cloudflareStorage ? {} : {
         "*/15 * * * *": ["cv-pipeline-maintenance"],
      },
      serverAssets: [{
         baseName: "cvPipeline",
         dir: "./server/pipeline",
      }],
      storage: {
         // Shared template catalog. Legacy document keys remain untouched and are never served.
         // Only write-once template keys may be served from the KV edge cache.
         cv: durableStorage("cv", "CV_DATA_DIR", {
            metaFields: ["id", "title", "revision", "updatedAt"],
            cachedPrefixes: ["templates:", "template-seeds:"],
         }),
         cvPipeline: durableStorage("cv-pipeline", "CV_PIPELINE_DATA_DIR"),
         // Hourly route/CQRS/user/task aggregates, read by the admin app.
         analytics: durableStorage("analytics", "ANALYTICS_DATA_DIR"),
      },
      esbuild: {
         options: {
            target: "es2022",
         },
      },
      rollupConfig: {
         plugins: [{
            name: "cv-raw-assets",
            load(id) {
               if (!id.endsWith("?raw")) return null;
               return `export default ${JSON.stringify(readFileSync(id.slice(0, -4), "utf8"))}`;
            },
         }],
      },
      alias: {
         "@infra": infraPath,
      },
      typescript: {
         tsConfig: {
            compilerOptions: {
               paths: {
                  "@infra/*": [`${infraPath}/*`],
               },
            },
         },
      },
   },
});
