import {
  createAuthenticatedFeature,
  isRouteEnabled,
  parsePatterns,
} from "@core/shared";

const PROTECTED = ["/d", "/settings"];

export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig();
  const hostname = import.meta.client ? window.location.hostname : useRequestURL().hostname;
  const authenticatedFeature = createAuthenticatedFeature(
    parsePatterns(config.public.featureFlags.authRoutes),
    parsePatterns(config.public.featureFlags.authDisabledHosts),
  );
  if (!isRouteEnabled([authenticatedFeature], { hostname, pathname: to.path })) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: "Not Found" }));
  }

  if (to.meta.public) return;

  if (PROTECTED.some((prefix) => to.path.startsWith(prefix))) {
    const { user } = useAppAuth();
    if (!user.value) {
      return navigateTo({ path: "/login", query: { redirect: to.fullPath } });
    }
  }
});
