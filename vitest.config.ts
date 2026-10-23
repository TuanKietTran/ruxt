import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
   resolve: {
      alias: {
         "@infra": resolvePath("./infra"),
      },
   },
   test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      // Real-workerd contract tests run through vitest.workerd.config.ts (`pnpm test:workerd`).
      exclude: ["**/node_modules/**", "tests/workerd/**"],
      reporters: "dot",
   },
});
