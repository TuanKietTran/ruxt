// Minimal ambient stub so TypeScript accepts `globalThis.Deno` in Node environments.
// Only declares what infra needs for runtime detection — not the full Deno namespace.
declare var Deno: { version: { deno: string } } | undefined;

declare module "*?raw" {
   const content: string;
   export default content;
}
declare module "*.md" {
   const content: string;
   export default content;
}
declare module "*.css" {
   const content: string;
   export default content;
}
