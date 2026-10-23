<script setup lang="ts">
const route = useRoute();
const id = typeof route.params.id === "string" ? route.params.id : "";
if (!id) throw createError({ statusCode: 404, statusMessage: "CV document not found" });
await navigateTo({ path: "/", query: { s: id } }, { replace: true, redirectCode: 308 });
</script>

<template>
    <span class="sr-only">Opening CV document…</span>
</template>
