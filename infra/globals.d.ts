// Minimal ambient stub so TypeScript accepts `globalThis.Deno` in Node environments.
// Only declares what infra needs for runtime detection — not the full Deno namespace.
declare global {
   var Deno: { version: { deno: string } } | undefined;
}

export {};
