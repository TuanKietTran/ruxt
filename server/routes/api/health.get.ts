// Browser-cacheable only: no edge Cache API here, so every uncached probe still reaches the Worker.
export default defineEventHandler((event) => {
   setResponseHeader(event, "cache-control", PUBLIC_NEAR_STATIC);
   return { status: "ok", ts: Date.now() };
})
