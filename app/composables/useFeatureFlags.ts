import { createAuthenticatedFeature, isFeatureEnabled, parsePatterns } from "@ruxt/shared/features";

export function useFeatureFlags() {
   const config = useRuntimeConfig();
   const requestUrl = useRequestURL();
   const hostname = import.meta.client ? window.location.hostname : requestUrl.hostname;
   const authenticatedFeature = createAuthenticatedFeature(
      parsePatterns(config.public.featureFlags.authRoutes),
      parsePatterns(config.public.featureFlags.authDisabledHosts),
   );
   const authenticated = computed(() => isFeatureEnabled(authenticatedFeature, { hostname }));

   return { authenticated: readonly(authenticated) };
}
