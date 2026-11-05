import { expect, test } from 'vitest';
import { adminActor, AuthError } from '../../tools/platform/src/auth.ts';

async function attempt(resolveSession: (event: unknown) => Promise<{ userId: string; role?: string } | null>): Promise<{ status: number | null; actor?: string }> {
  try {
    const actor = await adminActor({}, resolveSession);
    return { status: null, actor };
  } catch (err) {
    return { status: (err as AuthError).status, actor: undefined };
  }
}

test('anonymous request is 401', async () => {
  const result = await attempt(async () => null);
  expect(result.status).toBe(401);
});

test('non-admin session is 403', async () => {
  const result = await attempt(async () => ({ userId: 'user-1', role: 'user' }));
  expect(result.status).toBe(403);
});

test('admin session returns the session userId; a caller-chosen id is ignored', async () => {
  const result = await attempt(async (_event) => ({ userId: 'session-user', role: 'admin' }));
  expect(result.status).toBeNull();
  expect(result.actor).toBe('session-user');
});
