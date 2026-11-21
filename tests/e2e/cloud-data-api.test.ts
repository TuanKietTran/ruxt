// @vitest-environment node
import { describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const BASE = process.env.E2E_BASE_URL;
const UNCONFIGURED = process.env.E2E_UNCONFIGURED_URL;
const DEVICE_A = 'd_e2eDevice0001';
const DEVICE_B = 'd_e2eDevice0002';

// Request and response sizes of one typical one-session sync, logged in afterAll.
let syncRequestBytes = 0;
let syncResponseBytes = 0;

type AnyJson = Record<string, any>;

function cookieFrom(headers: Headers): string {
  const getSetCookie = (headers as any).getSetCookie as (() => string[]) | undefined;
  const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : [];
  const raw = cookies.length > 0 ? cookies[0] : headers.get('set-cookie') || '';
  return raw.split(';')[0] || '';
}

async function call(base: string, path: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; text: string; json: any }> {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

function withCookie(cookie: string, extra: RequestInit = {}): RequestInit {
  return { ...extra, headers: { ...((extra.headers as any) || {}), cookie } };
}

function jsonBody(body: AnyJson, method = 'POST'): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function makeUser(base: string, tag: string): Promise<string> {
  const email = 'e2e-' + tag + '-' + randomUUID() + '@example.test';
  const password = 'E2ePass-' + randomUUID() + '!1';
  const reg = await call(base, '/api/auth/register', jsonBody({ email, password }));
  expect(reg.status).toBe(201);
  const login = await call(base, '/api/auth/login', jsonBody({ email, password }));
  expect(login.status).toBe(200);
  const cookie = cookieFrom(login.headers);
  expect(cookie.startsWith('auth_session=')).toBe(true);
  return cookie;
}
async function syncCall(base: string, cookie: string, body: AnyJson) {
  return call(base, '/api/cloud-data/sync', withCookie(cookie, jsonBody(body)));
}

async function getConsent(base: string, cookie: string) {
  return call(base, '/api/cloud-data/consent', withCookie(cookie, {}));
}

async function setConsent(base: string, cookie: string, category: string, granted: boolean) {
  return call(base, '/api/cloud-data/consent', withCookie(cookie, jsonBody({ category, granted }, 'PUT')));
}

function saveMutation(clientItemId: string, mutationId: string, expectedRevision: number, title: string, content: string, kind = 'session') {
  return { mutationId, operation: 'save', kind, clientItemId, expectedRevision, snapshot: { title, content } };
}

function removeMutation(clientItemId: string, mutationId: string, expectedRevision: number, kind = 'session') {
  return { mutationId, operation: 'remove', kind, clientItemId, expectedRevision };
}

describe.skipIf(!BASE)('cloud-data API e2e', () => {
  let cookieA = '';
  let cookieB = '';
  const sessionId = randomUUID();
  const sessionTitle = 'E2E session';

  it('anonymous calls are 401 with private, no-store', async () => {
    const anonSync = await call(BASE as string, '/api/cloud-data/sync', jsonBody({ deviceId: DEVICE_A, since: null, mutations: [] }));
    expect(anonSync.status).toBe(401);
    expect(anonSync.headers.get('cache-control')).toBe('private, no-store');
    const anonExport = await call(BASE as string, '/api/cloud-data/export');
    expect(anonExport.status).toBe(401);
    expect(anonExport.headers.get('cache-control')).toBe('private, no-store');
    const anonCopy = await call(BASE as string, '/api/cloud-data/copies/session/does-not-exist');
    expect(anonCopy.status).toBe(401);
    const anonAck = await call(BASE as string, '/api/cloud-data/retention-acknowledgement', { method: 'POST' });
    expect(anonAck.status).toBe(401);
  });

  it('consent cannot be granted before acknowledging the notice', async () => {
    cookieA = await makeUser(BASE as string, 'a');
    const denied = await setConsent(BASE as string, cookieA, 'cloudSessions', true);
    expect(denied.status).toBeGreaterThanOrEqual(400);
    const before = await getConsent(BASE as string, cookieA);
    expect(before.status).toBe(200);
    expect(before.json.cloudSessions.granted).toBe(false);
    expect(before.json.retentionAcknowledgement.acknowledgedVersion).toBeNull();
    const ack = await call(BASE as string, '/api/cloud-data/retention-acknowledgement', withCookie(cookieA, { method: 'POST' }));
    expect(ack.status).toBe(200);
    expect(ack.json.retentionAcknowledgement.acknowledgedVersion).toBe('e2e-notice-1');
    const granted = await setConsent(BASE as string, cookieA, 'cloudSessions', true);
    expect(granted.status).toBeLessThan(300);
    const after = await getConsent(BASE as string, cookieA);
    expect(after.json.cloudSessions.granted).toBe(true);
    expect(after.headers.get('cache-control')).toBe('private, no-store');
  });
  it('sync requires a valid deviceId', async () => {
    const noDevice = await syncCall(BASE as string, cookieA, { since: null, mutations: [] });
    expect(noDevice.status).toBe(400);
    const first = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [] });
    expect(first.status).toBe(200);
    expect(first.json.protocol).toBe(1);
    expect(first.json.policy.maxMutations).toBe(20);
    expect(first.json.owner).toMatch(/^[0-9a-f]{32}$/);
    expect(first.json.cursor).toBe(0);
    expect(first.json.changes).toEqual([]);
    expect(first.json.push).toBeNull();
  });

  it('saves a session, replays the same mutation, and rejects a template without consent', async () => {
    const body = { deviceId: DEVICE_A, since: null, mutations: [saveMutation(sessionId, 'm-save-1', 0, sessionTitle, 'e2e-v1')] };
    syncRequestBytes = JSON.stringify(body).length;
    const saved = await syncCall(BASE as string, cookieA, body);
    syncResponseBytes = saved.text.length;
    expect(saved.status).toBe(200);
    expect(saved.json.acks).toHaveLength(1);
    expect(saved.json.acks[0]).toMatchObject({ mutationId: 'm-save-1', status: 'applied', operation: 'save', kind: 'session', clientItemId: sessionId, revision: 1 });
    expect(saved.json.changed).toBe(true);
    expect(saved.json.cursor).toBe(1);
    const replayed = await syncCall(BASE as string, cookieA, body);
    expect(replayed.json.acks[0]).toMatchObject({ mutationId: 'm-save-1', status: 'replayed' });
    expect(replayed.json.changed).toBe(false);
    const tpl = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [saveMutation(randomUUID(), 'm-tpl-1', 0, 'E2E template', 'tpl-v1', 'template')] });
    expect(tpl.json.acks[0]).toMatchObject({ status: 'rejected', code: 'CLOUD_COPY_CONSENT_REQUIRED' });
  });

  it('second device pulls the session, then an empty delta with quota null', async () => {
    const pull = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_B, since: 0, mutations: [] });
    expect(pull.status).toBe(200);
    expect(pull.json.changes).toHaveLength(1);
    expect(pull.json.changes[0]).toMatchObject({ deleted: false, kind: 'session', clientItemId: sessionId, revision: 1 });
    expect(pull.json.changes[0].snapshot.content).toBe('e2e-v1');
    const cursor = pull.json.cursor;
    expect(cursor).toBeGreaterThan(0);
    const empty = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_B, since: cursor, mutations: [] });
    expect(empty.json.changes).toEqual([]);
    expect(empty.json.quota).toBeNull();
  });

  it('stale write conflicts, then an update applies as revision 2', async () => {
    const stale = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [saveMutation(sessionId, 'm-stale-1', 0, sessionTitle, 'e2e-stale')] });
    expect(stale.json.acks[0]).toMatchObject({ status: 'conflict', expectedRevision: 0, currentRevision: 1 });
    const updated = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [saveMutation(sessionId, 'm-save-2', 1, sessionTitle, 'e2e-v2')] });
    expect(updated.json.acks[0]).toMatchObject({ status: 'applied', revision: 2 });
    expect(updated.json.cursor).toBe(2);
  });

  it('copies endpoint returns revision 2 with one checkpoint holding revision-1 content', async () => {
    const copy = await call(BASE as string, '/api/cloud-data/copies/session/' + sessionId, withCookie(cookieA, {}));
    expect(copy.status).toBe(200);
    expect(copy.json.revision).toBe(2);
    expect(copy.json.snapshot.content).toBe('e2e-v2');
    expect(copy.json.checkpoints).toHaveLength(1);
    expect(copy.json.checkpoints[0].revision).toBe(1);
    expect(copy.json.checkpoints[0].snapshot.content).toBe('e2e-v1');
  });
  it('another user cannot see the copy', async () => {
    cookieB = await makeUser(BASE as string, 'b');
    const acked = await call(BASE as string, '/api/cloud-data/retention-acknowledgement', withCookie(cookieB, { method: 'POST' }));
    expect(acked.status).toBe(200);
    const granted = await setConsent(BASE as string, cookieB, 'cloudSessions', true);
    expect(granted.status).toBeLessThan(300);
    const pull = await syncCall(BASE as string, cookieB, { deviceId: DEVICE_A, since: 0, mutations: [] });
    expect(pull.json.changes).toEqual([]);
    const missing = await call(BASE as string, '/api/cloud-data/copies/session/' + sessionId, withCookie(cookieB, {}));
    expect(missing.status).toBe(404);
    const own = await syncCall(BASE as string, cookieB, { deviceId: DEVICE_A, since: null, mutations: [saveMutation(sessionId, 'm-b-1', 0, 'B copy', 'b-v1')] });
    expect(own.json.acks[0]).toMatchObject({ status: 'applied', revision: 1 });
    const stillA = await call(BASE as string, '/api/cloud-data/copies/session/' + sessionId, withCookie(cookieA, {}));
    expect(stillA.json.revision).toBe(2);
  });

  it('removal applies and the other device sees deleted true', async () => {
    const removed = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [removeMutation(sessionId, 'm-remove-1', 2)] });
    expect(removed.json.acks[0]).toMatchObject({ status: 'applied', operation: 'remove' });
    const pull = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_B, since: 2, mutations: [] });
    expect(pull.json.changes).toHaveLength(1);
    expect(pull.json.changes[0]).toMatchObject({ deleted: true, kind: 'session', clientItemId: sessionId });
  });

  it('quota allows exactly 10 session copies per owner', async () => {
    const cookieC = await makeUser(BASE as string, 'c');
    const acked = await call(BASE as string, '/api/cloud-data/retention-acknowledgement', withCookie(cookieC, { method: 'POST' }));
    expect(acked.status).toBe(200);
    const granted = await setConsent(BASE as string, cookieC, 'cloudSessions', true);
    expect(granted.status).toBeLessThan(300);
    const mutations = Array.from({ length: 11 }, (_, i) => saveMutation(randomUUID(), 'm-quota-' + i, 0, 'Quota ' + i, 'quota-v1'));
    const res = await syncCall(BASE as string, cookieC, { deviceId: DEVICE_A, since: null, mutations });
    expect(res.status).toBe(200);
    expect(res.json.acks).toHaveLength(11);
    expect(res.json.acks.filter((a: any) => a.status === 'applied')).toHaveLength(10);
    expect(res.json.acks.filter((a: any) => a.status === 'rejected' && a.code === 'CLOUD_COPY_LIMIT')).toHaveLength(1);
  });

  it('revoking consent blocks new saves but export still works', async () => {
    const revoked = await setConsent(BASE as string, cookieA, 'cloudSessions', false);
    expect(revoked.status).toBeLessThan(300);
    const blocked = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: [saveMutation(randomUUID(), 'm-blocked-1', 0, 'Blocked', 'blocked-v1')] });
    expect(blocked.json.acks[0]).toMatchObject({ status: 'rejected', code: 'CLOUD_COPY_CONSENT_REQUIRED' });
    const exported = await call(BASE as string, '/api/cloud-data/export', withCookie(cookieA, {}));
    expect(exported.status).toBe(200);
    expect(exported.json.format).toBe('ruxt.cloud-export/1');
    expect(exported.json.consent.cloudSessions.granted).toBe(false);
    expect(Array.isArray(exported.json.copies)).toBe(true);
    expect(exported.json.quota).not.toBeNull();
  });

  it('events endpoint is 503 on node', async () => {
    const events = await call(BASE as string, '/api/cloud-data/events', withCookie(cookieA, {}));
    expect(events.status).toBe(503);
  });

  it('a body above 4 MiB is 413 and 21 mutations are 400', async () => {
    const big = await call(BASE as string, '/api/cloud-data/sync', withCookie(cookieA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(4 * 1024 * 1024 + 1) }));
    expect(big.status).toBe(413);
    const many = await syncCall(BASE as string, cookieA, { deviceId: DEVICE_A, since: null, mutations: Array.from({ length: 21 }, (_, i) => saveMutation(randomUUID(), 'm-many-' + i, 0, 'Many ' + i, 'many-v1')) });
    expect(many.status).toBe(400);
  });

  afterAll(() => {
    console.log('e2e sync size: request=' + syncRequestBytes + 'B response=' + syncResponseBytes + 'B');
  });
});

describe.skipIf(!UNCONFIGURED)('cloud-data API unconfigured server', () => {
  it('granting fails and the consent view lists all six missing retention keys', async () => {
    const cookie = await makeUser(UNCONFIGURED as string, 'u');
    const consent = await getConsent(UNCONFIGURED as string, cookie);
    expect(consent.status).toBe(200);
    expect(consent.json.retentionConfigurationMissing).toHaveLength(6);
    expect(consent.json.retentionConfigurationMissing).toEqual(expect.arrayContaining(['noticeVersion', 'sessionCurrentCopyRetentionDays', 'templateRetentionDays', 'profileRetentionDays', 'checkpointRetentionDays', 'retentionExtensionDays']));
    await call(UNCONFIGURED as string, '/api/cloud-data/retention-acknowledgement', withCookie(cookie, { method: 'POST' }));
    const denied = await setConsent(UNCONFIGURED as string, cookie, 'cloudSessions', true);
    expect(denied.status).toBeGreaterThanOrEqual(400);
  });
});
