import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
   resolve: {
      alias: {
         "@core": resolvePath("./core"),
         "@infra": resolvePath("./infra"),
         "#shared": resolvePath("./shared"),
      },
   },
   test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      reporters: "dot",
   },
});
