<script setup lang="ts">
const route = useRoute();
const pageTitle = computed(() =>
  route.path
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "CV",
);
useSeoMeta({
  title: () => pageTitle.value,
  ogTitle: () => pageTitle.value,
});
</script>

<template>
  <div class="landing">
    <div class="content">
      <p class="eyebrow">About Ruxt</p>

      <h1 class="heading">
        Write your CV in <span class="heading-accent">Markdown</span>.
      </h1>

      <p class="sub">
        Ruxt is a local-first CV editor. Edit Markdown and CSS side by side,
        preview the A4 result live, and export when you're ready.
      </p>

      <ul class="points">
        <li><strong>Local-first.</strong> Sessions, templates and profiles stay in your browser by default.</li>
        <li><strong>Optional cloud.</strong> Signing in uploads nothing; cloud recovery and templates are separate opt-ins you control in Settings.</li>
        <li><strong>Your layout.</strong> Start from a template or style your CV with plain CSS.</li>
      </ul>

      <div class="actions">
        <NuxtLink to="/" class="btn btn-primary">
          Open the editor
        </NuxtLink>
        <NuxtLink to="/settings/cloud-data" class="btn btn-ghost">
          Cloud data settings
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landing {
  min-height: calc(100vh - 56px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
}

/* Content */
.content {
  text-align: center;
  max-width: 640px;
}

.eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  margin: 0 0 16px;
}
.points {
  list-style: none;
  padding: 0;
  margin: 0 0 40px;
  display: grid;
  gap: 8px;
  text-align: left;
  color: var(--fg-subtext1);
  line-height: 1.6;
}

.heading {
  font-size: clamp(32px, 5vw, 40px);
  font-weight: 800;
  line-height: 1.05;
  color: var(--fg-text);
  margin: 0 0 24px;
}
.heading-accent {
  color: var(--accent);
}

.sub {
  font-size: 18px;
  color: var(--fg-subtext1);
  line-height: 1.6;
  margin: 0 0 40px;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  text-decoration: none;
}
.btn-primary {
  background: var(--accent);
  color: var(--bg-crust);
  border-color: var(--accent);
}
.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.btn-ghost {
  background: var(--bg-surface0);
  color: var(--fg-subtext1);
  border-color: var(--border);
}
.btn-ghost:hover {
  background: var(--bg-surface1);
  color: var(--fg-text);
}
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
