import { existsSync, readFileSync } from "node:fs";

const failures = [];
const requireText = (file, patterns) => {
  const source = readFileSync(file, "utf8");
  for (const [pattern, message] of patterns) {
    if (!pattern.test(source)) failures.push(`${file}: ${message}`);
  }
};

if (existsSync("app/types/profile.ts")) {
  failures.push("app/types/profile.ts: CV profile contracts belong to @core/domain/cv, not app-local types");
}

requireText("app/pages/profiles.vue", [
  [/@core\/domain\/cv/, "profile editor must consume the shared core CV profile contract"],
  [/definePageMeta\(\{[^}]*public:\s*true/s, "local profile editor must remain explicitly unauthenticated"],
  [/<NuxtLayout\s+name="editor"/, "product editors must reuse the editor layout"],
  [/<template\s+#workspace>/, "non-CV editor surfaces must use the editor layout workspace slot"],
  [/<template\s+#sidebar>/, "tool-specific navigation must replace, not duplicate, the editor sidebar"],
]);

requireText("app/components/CvImportDialog.vue", [
  [/["']\/api\/cv-imports["']/, "blob import must dispatch through the CV import API"],
  [/FormData/, "blob import must use multipart form data"],
  [/5 \* 1024 \* 1024/, "browser CV blobs must retain the 5 MB client ceiling"],
]);

requireText("packages/editor/app/components/CodePreview.vue", [
  [/prefix:\s*"\.cv-preview-scope"/, "document CSS must remain scoped to prevent template style leaks"],
]);

requireText("nuxt.config.ts", [
  [/extends:\s*\["\.\/packages\/editor"\]/, "ruxt must consume the shared editor Nuxt layer"],
]);
if (failures.length) {
  console.error(`Architecture lint failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Architecture lint passed");
