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
  [/definePageMeta\(\{[^}]*editorContext:\s*"profiles"/s, "profile editor must select its registered editor context"],
]);

// Icons: Iconify codes (from Icônes) for one local collection, rendered only through <AppIcon>.
{
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const iconPackages = dependencies.filter(name => /icon|lucide|heroicons|phosphor|tabler|fontawesome|feather/i.test(name)).sort();
  if (iconPackages.join() !== "@iconify-json/lucide,@nuxt/icon") {
    failures.push(`package.json: icons come from @nuxt/icon with the single @iconify-json/lucide collection (found: ${iconPackages.join(", ") || "none"})`);
  }
  const allowed = new Set([...readFileSync("app/utils/icons.ts", "utf8").matchAll(/"(lucide:[a-z0-9-]+)"/g)].map(match => match[1]));
  const { execSync } = await import("node:child_process");
  const sources = execSync("git ls-files app packages", { encoding: "utf8" }).split("\n").filter(file => /\.(vue|ts)$/.test(file));
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    if (file !== "app/components/AppIcon.vue" && /<Icon[\s>]/.test(source)) failures.push(`${file}: render icons with <AppIcon>, not <Icon>`);
    for (const [, code] of source.matchAll(/["'`]((?:[a-z0-9-]+):[a-z0-9-]+)["'`]/g)) {
      if (/^(?:lucide|mdi|ph|tabler|carbon|heroicons|ri|bi|fa6?-[a-z]+|material-symbols|ic):/.test(code) && !allowed.has(code)) {
        failures.push(`${file}: icon ${code} is not listed in app/utils/icons.ts`);
      }
    }
  }
}

// The editor layout renders from the registered editor context, never from hard-coded route paths.
{
  const layout = readFileSync("app/layouts/editor.vue", "utf8");
  if (/isProfileRoute|route\.path\s*[!=]==\s*["']\/p["']|startsWith\(["']\/p/.test(layout)) {
    failures.push("app/layouts/editor.vue: branch on the registered editor context (app/utils/editorContexts.ts), not on route paths");
  }
}

requireText("app/components/CvImportDialog.vue", [
  [/["']\/api\/cv-imports["']/, "blob import must dispatch through the CV import API"],
  [/FormData/, "blob import must use multipart form data"],
  [/5 \* 1024 \* 1024/, "browser CV blobs must retain the 5 MB client ceiling"],
]);

requireText("nuxt.config.ts", [
  [/extends:\s*\["@ruxt\/editor"\]/, "ruxt must consume the published @ruxt/editor Nuxt layer"],
]);

requireText("package.json", [
  [/"@ruxt\/editor":\s*"\d+\.\d+\.\d+"/, "@ruxt/editor must be a pinned registry release, not a workspace or path reference"],
  [/"@ruxt\/core":\s*"\d+\.\d+\.\d+"/, "@ruxt/core must be a pinned registry release, not a workspace or path reference"],
]);
if (failures.length) {
  console.error(`Architecture lint failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Architecture lint passed");
