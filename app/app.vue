<script setup lang="ts">
const { authenticated } = useFeatureFlags();
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AuthDialog v-if="authenticated" />
  </div>
</template>
