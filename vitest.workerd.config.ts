import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
// Contract tests that need a real workerd runtime (via the miniflare API). Run with `pnpm test:workerd`.
export default defineConfig({
   resolve: { alias: { "@infra": resolvePath("./infra") } },
   test: {
      environment: "node",
      include: ["tests/workerd/**/*.test.ts"],
      reporters: "default",
      testTimeout: 60_000,
      hookTimeout: 60_000,
      fileParallelism: false,
   },
});
