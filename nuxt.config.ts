import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ICONS } from "./app/utils/icons";

const require = createRequire(import.meta.url);
const corePath = dirname(require.resolve("@ruxt/core/package.json"));
const infraPath = fileURLToPath(new URL("./infra", import.meta.url));
const chunkedDenoKvDriver = fileURLToPath(new URL("./server/storage/chunked-deno-kv.ts", import.meta.url));
// Deno's native Nuxt builder uses the lightweight `deno-server` preset. The
// explicit build flag still selects Deno KV without forcing Nitro's much larger
// `deno-deploy` bundle, which exceeds Deno's standard build-memory limit.
const denoStorage = process.env.RUXT_DENO_STORAGE === "1" || process.env.NITRO_PRESET === "deno-deploy";
const durableStorage = (base: string, directory: string) => denoStorage
   ? { driver: chunkedDenoKvDriver, base }
   : { driver: "fs", base: process.env[directory] ?? `./.data/${base}` };

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
      signInUrl: "/login",
      signUpUrl: "/login?mode=signup",
      signInFallbackRedirectUrl: "/",
      signUpFallbackRedirectUrl: "/",
   },
   runtimeConfig: {
      // Nuxt applies NUXT_SESSION_SECRET at runtime. Keep this fallback local-only;
      // deployed Deno timelines are validated by validate-deployment-env.ts.
      sessionSecret: "dev-only-secret-change-me-in-production!!",
      public: {
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
      "@core": corePath,
      "@infra": infraPath,
   },

   vite: {
      build: {
         modulePreload: { polyfill: false },
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
      externals: {
         inline: [corePath],
      },
      experimental: {
         tasks: true,
      },
      scheduledTasks: {
         "*/15 * * * *": ["cv-pipeline-maintenance"],
      },
      serverAssets: [{
         baseName: "cvPipeline",
         dir: "./server/pipeline",
      }],
      storage: {
         // Canonical CV documents shared by the browser API and agent adapters.
         cv: durableStorage("cv", "CV_DATA_DIR"),
         cvPipeline: durableStorage("cv-pipeline", "CV_PIPELINE_DATA_DIR"),
         // Hourly route/CQRS/user/task aggregates, read by the admin app.
         analytics: durableStorage("analytics", "ANALYTICS_DATA_DIR"),
      },
      esbuild: {
         options: {
            target: "es2022",
            // @ruxt/core intentionally publishes framework-free TypeScript source.
            // Keep other dependencies excluded while allowing Nitro to transpile it.
            exclude: /node_modules\/(?!\.pnpm\/@ruxt\+core@|@ruxt\/core)/,
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
         "@core": corePath,
         "@infra": infraPath,
      },
      typescript: {
         tsConfig: {
            compilerOptions: {
               paths: {
                  "@core/*": [`${corePath}/*`],
                  "@infra/*": [`${infraPath}/*`],
               },
            },
         },
      },
   },
});
