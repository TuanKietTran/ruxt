import { useMediator } from "@ruxt/shared/cqrs";
import { registerUserCommand } from "@ruxt/core/handlers/register-user";

export default defineEventHandler(async (event) => {
  // Accounts come from Clerk. This email/password route predates it: it has no email verification, bot
  // protection, rate limit or strength check, so it stays closed unless a deployment opts in (local tests).
  if (!useRuntimeConfig(event).legacyAuth?.registration) {
    throw createError({ statusCode: 403, statusMessage: "Registration is closed. Create an account by signing in with Clerk." });
  }
  const body = await readBody(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "email and password are required" });
  }

  const mediator = useMediator();
  let result: { userId: string };
  try {
    result = await mediator.send(registerUserCommand({ email: body.email, password: body.password }));
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err.message ?? "Registration failed" });
  }

  const session = await getAuthSession(event);
  await session.update({ userId: result.userId });

  setResponseStatus(event, 201);
  return { userId: result.userId };
});
