/** Personal account responses and their error paths must not enter browser or shared caches. */
export default defineEventHandler((event) => {
   const path = getRequestURL(event).pathname;
   if (path === "/mcp" || /^\/api\/(auth|preferences|cloud-data|cvs|cv-profiles|cv-imports|cv-applications|cv-artifacts)(\/|$)/.test(path)) {
      setResponseHeaders(event, { "cache-control": "private, no-store", vary: "Cookie, Authorization" });
   }
});
