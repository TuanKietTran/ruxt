export interface AuthUser {
  id: string;
  email: string;
}

export function useAppAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null);

  const fetchMe = async () => {
    try {
      const fetch = useRequestFetch();
      const data = await fetch<AuthUser>("/api/auth/me");
      user.value = data;
    } catch {
      user.value = null;
    }
  };

  const login = async (email: string, password: string) => {
    await $fetch("/api/auth/login", { method: "POST", body: { email, password } });
    await fetchMe();
  };

  const register = async (email: string, password: string) => {
    await $fetch("/api/auth/register", { method: "POST", body: { email, password } });
    await fetchMe();
  };

  const logout = async () => {
    const clerk = useClerk();
    if (import.meta.client && clerk.value) await clerk.value.signOut();
    await $fetch("/api/auth/logout", { method: "POST" });
    user.value = null;
  };

  return { user: readonly(user), fetchMe, login, register, logout };
}
