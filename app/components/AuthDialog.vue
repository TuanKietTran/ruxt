<script setup lang="ts">
const route = useRoute();
const { authDialog, closeAuthDialog, setAuthMode } = useAuthDialog();

const dialogElement = ref<HTMLElement | null>(null);
const clerkLoadTimedOut = ref(false);
let previousFocus: HTMLElement | null = null;
let previousOverflow = "";
let clerkLoadTimeout: ReturnType<typeof setTimeout> | undefined;

const clearClerkLoadTimeout = () => {
    if (clerkLoadTimeout) clearTimeout(clerkLoadTimeout);
    clerkLoadTimeout = undefined;
};

const startClerkLoadTimeout = () => {
    clearClerkLoadTimeout();
    clerkLoadTimedOut.value = false;
    clerkLoadTimeout = setTimeout(() => {
        clerkLoadTimedOut.value = true;
    }, 12_000);
};

const isSignup = computed(() => authDialog.value.mode === "signup");
const destination = computed(() => authDialog.value.redirectTo || (route.path === "/login" ? "/" : route.fullPath));
const title = computed(() => isSignup.value ? "Create your account" : "Welcome back");
const clerkAppearance = {
    layout: { socialButtonsPlacement: "top" as const },
    elements: {
        rootBox: { width: "100%" },
        cardBox: { width: "100%", boxShadow: "none" },
        card: { width: "100%", boxShadow: "none", background: "transparent", padding: "0" },
        header: { display: "none" },
        footer: { display: "none" },
    },
};

watch(() => authDialog.value.open, async (open) => {
    if (!import.meta.client) return;
    if (open) {
        previousFocus = document.activeElement as HTMLElement | null;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        startClerkLoadTimeout();
        await nextTick();
        dialogElement.value?.focus();
        return;
    }

    clearClerkLoadTimeout();
    clerkLoadTimedOut.value = false;
    document.body.style.overflow = previousOverflow;
    await nextTick();
    previousFocus?.focus();
}, { immediate: true });

const close = async () => {
    closeAuthDialog();
    if (route.path === "/login") await navigateTo("/");
};

const retryClerk = () => window.location.reload();

const handleKeydown = (event: KeyboardEvent) => {
    if (!authDialog.value.open) return;
    if (event.key === "Escape") {
        void close();
        return;
    }
    if (event.key !== "Tab" || !dialogElement.value) return;

    const focusable = [...dialogElement.value.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    )];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown);
    clearClerkLoadTimeout();
    document.body.style.overflow = previousOverflow;
});
</script>

<template>
    <div
        v-if="authDialog.open"
        class="auth-backdrop"
        role="presentation"
        @mousedown.self="close"
    >
        <section
            ref="dialogElement"
            class="auth-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            tabindex="-1"
        >
            <header class="dialog-header">
                <div class="brand-mark" aria-hidden="true">◆</div>
                <button class="close-button" type="button" aria-label="Close" @click="close">×</button>
            </header>

            <div class="mode-tabs" role="tablist" aria-label="Account access">
                <button
                    type="button"
                    role="tab"
                    :aria-selected="!isSignup"
                    :class="{ active: !isSignup }"
                    @click="setAuthMode('login')"
                >Sign in</button>
                <button
                    type="button"
                    role="tab"
                    :aria-selected="isSignup"
                    :class="{ active: isSignup }"
                    @click="setAuthMode('signup')"
                >Create account</button>
            </div>

            <div class="dialog-copy">
                <h1 id="auth-title">{{ title }}</h1>
                <p>
                    {{ isSignup
                        ? "Create an account to access optional cloud features and continue across devices."
                        : "Sign in without leaving your current CV workflow." }}
                </p>
            </div>

            <ClerkLoading>
                <div v-if="clerkLoadTimedOut" class="clerk-error" role="alert">
                    <p>Sign-in service failed to load. Please retry or contact support.</p>
                    <button type="button" @click="retryClerk">Retry</button>
                </div>
                <div v-else class="clerk-loading" role="status">Loading secure sign-in…</div>
            </ClerkLoading>
            <ClerkLoaded>
                <SignUp
                    v-if="isSignup"
                    routing="hash"
                    :force-redirect-url="destination"
                    sign-in-url="/login"
                    :appearance="clerkAppearance"
                />
                <SignIn
                    v-else
                    routing="hash"
                    :force-redirect-url="destination"
                    sign-up-url="/login?mode=signup"
                    :appearance="clerkAppearance"
                />
            </ClerkLoaded>

            <p class="privacy-note">
                Your CV remains local unless you separately enable a cloud feature. Signing in does not upload it.
            </p>
        </section>
    </div>
</template>

<style scoped>
.auth-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--bg-crust) 78%, transparent);
    backdrop-filter: blur(7px);
}
.auth-dialog {
    width: min(430px, 100%);
    max-height: min(760px, calc(100vh - 32px));
    overflow: auto;
    padding: 24px;
    outline: 0;
    color: var(--fg-text);
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 80px color-mix(in srgb, var(--bg-crust) 70%, transparent);
}
.dialog-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.brand-mark { color: var(--accent); font-size: 21px; }
.close-button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    color: var(--fg-subtext0);
    background: transparent;
    font-size: 23px;
    cursor: pointer;
}
.close-button:hover { color: var(--fg-text); background: var(--bg-surface0); }
.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; background: var(--bg-surface0); border-radius: var(--radius-md); }
.mode-tabs button { padding: 9px; border: 0; border-radius: calc(var(--radius-md) - 2px); color: var(--fg-subtext0); background: transparent; font-weight: 600; cursor: pointer; }
.mode-tabs button.active { color: var(--fg-text); background: var(--bg-mantle); box-shadow: 0 1px 4px color-mix(in srgb, var(--bg-crust) 35%, transparent); }
.dialog-copy { margin: 24px 0 18px; }
.dialog-copy h1 { margin: 0 0 8px; font-size: 24px; letter-spacing: -.02em; }
.dialog-copy p, .privacy-note { margin: 0; color: var(--fg-subtext0); font-size: 14px; line-height: 1.55; }
.clerk-loading { padding: 28px 0; color: var(--fg-subtext0); text-align: center; }
.clerk-error { display: grid; gap: 14px; justify-items: center; padding: 24px 0; text-align: center; }
.clerk-error p { margin: 0; color: var(--fg-subtext0); line-height: 1.5; }
.clerk-error button { padding: 9px 16px; border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--fg-text); background: var(--bg-surface0); font-weight: 600; cursor: pointer; }
.privacy-note { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--border); font-size: 12px; }
@media (max-width: 480px) {
    .auth-backdrop { align-items: end; padding: 0; }
    .auth-dialog { width: 100%; max-height: 92vh; border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: 22px 20px calc(22px + env(safe-area-inset-bottom)); }
}
</style>
