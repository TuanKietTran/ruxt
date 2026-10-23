export type AuthDialogMode = "login" | "signup";

interface AuthDialogState {
    open: boolean;
    mode: AuthDialogMode;
    redirectTo: string | null;
}

export function useAuthDialog() {
    const state = useState<AuthDialogState>("auth:dialog", () => ({
        open: false,
        mode: "login",
        redirectTo: null,
    }));

    const openAuthDialog = (mode: AuthDialogMode = "login", redirectTo?: string | null) => {
        state.value = { open: true, mode, redirectTo: safeAuthRedirect(redirectTo) };
    };

    const closeAuthDialog = () => {
        state.value = { ...state.value, open: false };
    };

    const setAuthMode = (mode: AuthDialogMode) => {
        state.value = { ...state.value, mode };
    };

    return {
        authDialog: readonly(state),
        openAuthDialog,
        closeAuthDialog,
        setAuthMode,
    };
}
