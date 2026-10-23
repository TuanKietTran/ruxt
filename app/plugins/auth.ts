export default defineNuxtPlugin(async () => {
  const { authenticated } = useFeatureFlags();
  if (import.meta.server && authenticated.value) {
    const { fetchMe } = useAppAuth();
    await fetchMe();
  }
});
