import type { H3Event } from "h3";
import { requireAuthUser } from "./auth-user";

export async function requireCvOwner(event: H3Event): Promise<string> {
   return requireAuthUser(event);
}
