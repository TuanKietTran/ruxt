import {
   createAuthenticatedFeature,
   isRouteEnabled,
   parsePatterns,
} from "@ruxt/shared/features";

/** Enforce deployment-owned host feature policy before a feature route is handled. */
export default defineEventHandler((event) => {
   const url = getRequestURL(event);
   const config = useRuntimeConfig(event);
   const authenticatedFeature = createAuthenticatedFeature(
      parsePatterns(config.public.featureFlags.authRoutes),
      parsePatterns(config.public.featureFlags.authDisabledHosts),
   );

   if (!isRouteEnabled([authenticatedFeature], {
      hostname: url.hostname,
      pathname: url.pathname,
   })) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
   }
});
