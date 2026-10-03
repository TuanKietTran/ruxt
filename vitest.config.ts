import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
// Tests resolve @core to the pinned @ruxt/core package, exactly like the Nuxt build.
const corePath = dirname(createRequire(import.meta.url).resolve("@ruxt/core/package.json"));

export default defineConfig({
   resolve: {
      alias: {
         "@core": corePath,
         "@infra": resolvePath("./infra"),
      },
   },
   test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      reporters: "dot",
   },
});
