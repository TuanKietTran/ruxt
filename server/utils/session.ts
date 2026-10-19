import { useSession, type H3Event } from "h3";

export interface AuthSessionData {
   userId?: string;
}

export async function getAuthSession(event: H3Event) {
   return useSession<AuthSessionData>(event, {
      password: useRuntimeConfig(event).sessionSecret,
      name: "auth_session",
      maxAge: 60 * 60 * 24 * 7, // 7 days
   });
}
