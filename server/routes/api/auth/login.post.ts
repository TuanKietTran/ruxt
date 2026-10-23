import { useMediator } from "@ruxt/shared/cqrs";
import { loginUserCommand } from "@ruxt/core/handlers/login-user";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "email and password are required" });
  }

  const mediator = useMediator();
  let result: { userId: string };
  try {
    result = await mediator.send(loginUserCommand({ email: body.email, password: body.password }));
  } catch (err: any) {
    throw createError({ statusCode: 401, statusMessage: "Invalid email or password" });
  }

  const session = await getAuthSession(event);
  await session.update({ userId: result.userId });

  return { userId: result.userId };
});
