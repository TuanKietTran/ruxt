export type SessionSnapshot = { userId: string; role?: string } | null;
export type SessionResolver = (event: unknown) => Promise<SessionSnapshot>;

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function adminActor(event: unknown, resolveSession: SessionResolver): Promise<string> {
  const session = await resolveSession(event);
  if (!session || !session.userId) throw new AuthError(401, 'Authentication required');
  if (session.role !== 'admin') throw new AuthError(403, 'Admin required');
  return session.userId;
}

/**
 * CLI actor is resolved from the environment only. Caller input can never set the actor.
 */
export async function cliActor(): Promise<string> {
  const actor = process.env.PLATFORM_ACTOR;
  if (!actor) throw new Error('PLATFORM_ACTOR is required to run control-plane commands');
  return actor;
}
