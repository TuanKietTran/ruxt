import { clerkMiddleware } from "@clerk/nuxt/server";

// Nitro loads app middleware lexically; establish auth before every other middleware and route.
// scripts/check-auth-middleware-order.mjs verifies this order in the built bundle.
export default clerkMiddleware();
