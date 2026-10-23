import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep environment assignment portable across cmd.exe, PowerShell and POSIX shells.
const root = fileURLToPath(new URL("../", import.meta.url));
const nuxtCli = resolve(root, "node_modules/nuxt/bin/nuxt.mjs");
const result = spawnSync(process.execPath, [nuxtCli, "build"], {
   cwd: root,
   stdio: "inherit",
   env: { ...process.env, NITRO_PRESET: "cloudflare-module", RUXT_CLOUDFLARE_STORAGE: "1" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
