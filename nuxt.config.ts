import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const corePath = dirname(require.resolve("@ruxt/core/package.json"));
const infraPath = fileURLToPath(new URL("./infra", import.meta.url));

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
   extends: ["@ruxt/editor"],
   compatibilityDate: "2025-07-15",
   modules: ["@clerk/nuxt"],
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
         cv: {
            driver: "fs",
            base: process.env.CV_DATA_DIR ?? "./.data/cv",
         },
         cvPipeline: {
            driver: "fs",
            base: process.env.CV_PIPELINE_DATA_DIR ?? "./.data/cv-pipeline",
         },
         // Hourly route/CQRS/user/task aggregates, read by the admin app.
         analytics: {
            driver: "fs",
            base: process.env.ANALYTICS_DATA_DIR ?? "./.data/analytics",
         },
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
