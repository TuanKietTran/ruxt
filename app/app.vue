<script setup lang="ts">
const { authenticated } = useFeatureFlags();
// Keeps the shown account in step with Clerk: sign-in without reload, sign-out or account switch in another tab.
useAuthSession();
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AuthDialog v-if="authenticated" />
    <AppDialogHost />
    <ToastHost />
  </div>
</template>
