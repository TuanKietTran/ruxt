import { requireAuthUser } from "../utils/auth-user";

/**
 * CV documents are local-first. Everything under /api/cvs (and the retired profile-apply route) answers
 * 401 to anonymous callers whether or not the route still exists, so the status never reveals which
 * paths are served. Signed-in callers of a removed route get the router's 404.
 */
const GATED = /^\/api\/(cvs|cv-profiles)(\/|$)/;

export default defineEventHandler(async (event) => {
   if (GATED.test(getRequestURL(event).pathname)) await requireAuthUser(event);
});
