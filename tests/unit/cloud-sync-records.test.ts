// Canonical cloud-sync record adapters: sessions, templates and profiles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeCvProfile } from '@ruxt/shared/cv';
import { createJobPreferencesAdapter, createProfileAdapter, createSessionAdapter, createTemplateAdapter, JOB_PREFERENCES_RECORD_ID, jobPreferencesSnapshot, sessionSnapshot, upgradeStoredProfileIds } from '../../app/utils/cloudSync/records';
import { createRecordAdapters, SYNC_KINDS, SYNC_KIND_REGISTRY } from '../../app/utils/cloudSync/kinds';
import { JOB_PREFERENCES_KEY } from '../../app/utils/jobSnapshot';
import { CV_SESSION_BACKUP_PREFIX } from '../../app/utils/cvSessionBackup';
import { LOCAL_CV_TEMPLATES_KEY } from '../../app/utils/localCvTemplates';
import { LOCAL_PROFILES_KEY } from '../../app/utils/localProfiles';
import { makeTemplate } from '../helpers/fakes';

class MemoryStorage implements Storage {
  items = new Map<string, string>();
  blocked = false;
  get length() { return this.items.size; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) { throw new Error('QuotaExceededError'); } this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
  clear() { this.items.clear(); }
}

const keyOf = (id: string) => CV_SESSION_BACKUP_PREFIX + id;
const seedSession = (storage: MemoryStorage, id: string, value: unknown) => { storage.setItem(keyOf(id), JSON.stringify(value)); };
const baseSession = (overrides: Record<string, unknown> = {}) => ({ markdown: '# Hi', css: '.x{}', title: 'My CV', revision: 2, pending: true, savedAt: 1700000000000, ...overrides });
const storedSession = (storage: MemoryStorage, id: string) => JSON.parse(storage.getItem(keyOf(id)) as string);
const sessionAdapter = (storage: MemoryStorage) => createSessionAdapter(() => storage);

let events: Array<{ kind: string; id: string; origin: string }> = [];
beforeEach(() => {
  events = [];
  const target = new EventTarget();
  (globalThis as any).window = target;
  target.addEventListener('ruxt:local-change', (event) => { events.push((event as any).detail); });
});
afterEach(() => { delete (globalThis as any).window; });

describe('session adapter', () => {
  it('lists stored sessions and skips unreadable values without deleting them', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession());
    storage.setItem(keyOf('broken'), '{');
    storage.setItem('cv-sv:new-session-draft', 'draft untouched');
    expect(sessionAdapter(storage).list().map((record) => record.id)).toEqual(['a']);
    expect(storage.getItem(keyOf('broken'))).toBe('{');
    expect(storage.getItem('cv-sv:new-session-draft')).toBe('draft untouched');
  });
  it('get returns canonical snapshot, ISO updatedAt and syncConflict', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession({ syncConflict: true }));
    const record = sessionAdapter(storage).get('a');
    expect(record?.title).toBe('My CV');
    expect(record?.updatedAt).toBe(new Date(1700000000000).toISOString());
    expect(record?.syncConflict).toBe(true);
    expect(record?.snapshot.content).toBe(JSON.stringify({ schema: 'ruxt.session/1', markdown: '# Hi', css: '.x{}' }));
  });
  it('get returns null for missing or unreadable records', () => {
    const storage = new MemoryStorage();
    storage.setItem(keyOf('broken'), '{');
    expect(sessionAdapter(storage).get('missing')).toBeNull();
    expect(sessionAdapter(storage).get('broken')).toBeNull();
  });
  it('sessionSnapshot builds canonical content', () => {
    const snapshot = sessionSnapshot('Title', '# Hi', '.x{}');
    expect(snapshot.title).toBe('Title');
    expect(snapshot.content).toBe(JSON.stringify({ schema: 'ruxt.session/1', markdown: '# Hi', css: '.x{}' }));
  });
  it('write creates a new record as cloud-applied revision 1 and emits', () => {
    const storage = new MemoryStorage();
    const before = Date.now();
    expect(sessionAdapter(storage).write('new', sessionSnapshot('Fresh', '# New', ''))).toBe(true);
    const after = Date.now();
    const value = storedSession(storage, 'new');
    expect(value.revision).toBe(1);
    expect(value.pending).toBe(false);
    expect(value.cloudApplied).toBe(true);
    expect(value.savedAt).toBeGreaterThanOrEqual(before);
    expect(value.savedAt).toBeLessThanOrEqual(after);
    expect(events).toEqual([{ kind: 'session', id: 'new', origin: 'cloud' }]);
    expect(sessionAdapter(storage).get('new')?.snapshot.content).toBe(sessionSnapshot('Fresh', '# New', '').content);
  });
  it('write increments revision, preserves unknown fields and clears conflict', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession({ revision: 3, custom: 'keep', syncConflict: true }));
    expect(sessionAdapter(storage).write('a', sessionSnapshot('My CV', '# Changed', '.y{}'))).toBe(true);
    const value = storedSession(storage, 'a');
    expect(value.revision).toBe(4);
    expect(value.custom).toBe('keep');
    expect(value.syncConflict).toBeUndefined();
    expect(value.cloudApplied).toBe(true);
    expect(value.markdown).toBe('# Changed');
  });
  it('write keeps the stored title when the snapshot title is empty', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession());
    expect(sessionAdapter(storage).write('a', sessionSnapshot('', '# Changed', ''))).toBe(true);
    expect(storedSession(storage, 'a').title).toBe('My CV');
  });
  it('write refuses unreadable existing values and leaves them intact', () => {
    const storage = new MemoryStorage();
    storage.setItem(keyOf('broken'), '{');
    expect(sessionAdapter(storage).write('broken', sessionSnapshot('X', '# Hi', ''))).toBe(false);
    expect(storage.getItem(keyOf('broken'))).toBe('{');
    expect(events).toEqual([]);
  });
  it('write returns false on blocked storage and keeps the old value', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession());
    storage.blocked = true;
    expect(sessionAdapter(storage).write('a', sessionSnapshot('My CV', '# Changed', ''))).toBe(false);
    storage.blocked = false;
    expect(storedSession(storage, 'a').markdown).toBe('# Hi');
    expect(events).toEqual([]);
  });
  it('createCopy creates a fresh local copy without cloudApplied', () => {
    const storage = new MemoryStorage();
    const id = sessionAdapter(storage).createCopy(sessionSnapshot('Source', '# A', ''), 'Copy Title');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const value = storedSession(storage, id as string);
    expect(value.title).toBe('Copy Title');
    expect(value.revision).toBe(1);
    expect(value.cloudApplied).toBeUndefined();
    expect(events).toEqual([{ kind: 'session', id, origin: 'local' }]);
  });
  it('createCopy returns null for a wrong schema or blocked storage', () => {
    const storage = new MemoryStorage();
    const wrong = { title: 'X', content: JSON.stringify({ schema: 'ruxt.template/1' }) };
    expect(sessionAdapter(storage).createCopy(wrong, 'Copy')).toBeNull();
    storage.blocked = true;
    expect(sessionAdapter(storage).createCopy(sessionSnapshot('S', '# A', ''), 'Copy')).toBeNull();
  });
  it('clearConflict removes only the conflict marker', () => {
    const storage = new MemoryStorage();
    seedSession(storage, 'a', baseSession({ custom: 'keep', syncConflict: true }));
    sessionAdapter(storage).clearConflict('a');
    const value = storedSession(storage, 'a');
    expect(value.syncConflict).toBeUndefined();
    expect(value.custom).toBe('keep');
    expect(value.markdown).toBe('# Hi');
    sessionAdapter(storage).clearConflict('missing');
  });
  it('ownsStorageKey matches only session keys', () => {
    const adapter = sessionAdapter(new MemoryStorage());
    expect(adapter.ownsStorageKey(keyOf('a'))).toBe(true);
    expect(adapter.ownsStorageKey(LOCAL_CV_TEMPLATES_KEY)).toBe(false);
    expect(adapter.ownsStorageKey('other')).toBe(false);
  });
});

const templateAdapter = (storage: MemoryStorage) => createTemplateAdapter(() => storage);
const templateProps = (overrides: Record<string, unknown> = {}) => makeTemplate({ builtIn: false, id: 't1', name: 'Local One', ...overrides }).toJSON();
const seedTemplates = (storage: MemoryStorage, entries: unknown[]) => { storage.setItem(LOCAL_CV_TEMPLATES_KEY, JSON.stringify(entries)); };
const storedTemplates = (storage: MemoryStorage) => JSON.parse(storage.getItem(LOCAL_CV_TEMPLATES_KEY) as string);
const templateSnapshot = (props: any, title?: string) => ({ title: title ?? props.name, content: JSON.stringify({ schema: 'ruxt.template/1', markdownSkeleton: props.markdownSkeleton, css: props.css, capabilities: props.capabilities, tags: props.tags }) });

describe('template adapter', () => {
  it('lists eligible templates and excludes built-in and invalid entries', () => {
    const storage = new MemoryStorage();
    const props = templateProps();
    seedTemplates(storage, [makeTemplate({ builtIn: true, id: 'built', name: 'Built' }).toJSON(), props, 'oops']);
    const records = templateAdapter(storage).list();
    expect(records.map((record) => record.id)).toEqual(['t1']);
    expect(records[0]?.title).toBe('Local One');
    expect(records[0]?.updatedAt).toBe(props.createdAt);
    expect(records[0]?.snapshot.content).toBe(templateSnapshot(props).content);
  });
  it('get returns null for built-in or missing templates', () => {
    const storage = new MemoryStorage();
    seedTemplates(storage, [makeTemplate({ builtIn: true, id: 'built', name: 'Built' }).toJSON()]);
    expect(templateAdapter(storage).get('built')).toBeNull();
    expect(templateAdapter(storage).get('missing')).toBeNull();
  });
  it('write replaces an entry, bumps version, keeps createdAt and never drops others', () => {
    const storage = new MemoryStorage();
    const props = templateProps({ version: 2 });
    const other = templateProps({ id: 't2', name: 'Other' });
    seedTemplates(storage, [props, other]);
    const snapshot = templateSnapshot({ ...props, markdownSkeleton: ':::changed\n' }, 'Renamed');
    expect(templateAdapter(storage).write('t1', snapshot)).toBe(true);
    const entries = storedTemplates(storage);
    expect(entries[0].version).toBe(3);
    expect(entries[0].createdAt).toBe(props.createdAt);
    expect(entries[0].name).toBe('Renamed');
    expect(entries[0].builtIn).toBe(false);
    expect(entries.map((entry: any) => entry.id)).toEqual(['t1', 't2']);
    expect(events).toEqual([{ kind: 'template', id: 't1', origin: 'cloud' }]);
    expect(templateAdapter(storage).get('t1')?.snapshot.content).toBe(snapshot.content);
  });
  it('write appends a new entry at version 1 and defaults tags to local', () => {
    const storage = new MemoryStorage();
    const props = templateProps();
    const snapshot = { title: 'Fresh', content: JSON.stringify({ schema: 'ruxt.template/1', markdownSkeleton: props.markdownSkeleton, css: props.css, capabilities: props.capabilities }) };
    expect(templateAdapter(storage).write('fresh', snapshot)).toBe(true);
    const entries = storedTemplates(storage);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe(1);
    expect(entries[0].builtIn).toBe(false);
    expect(entries[0].tags).toEqual(['local']);
    expect(typeof entries[0].createdAt).toBe('string');
  });
  it('write refuses built-in entries', () => {
    const storage = new MemoryStorage();
    const built = makeTemplate({ builtIn: true, id: 'built', name: 'Built' }).toJSON();
    seedTemplates(storage, [built]);
    const before = storage.getItem(LOCAL_CV_TEMPLATES_KEY);
    expect(templateAdapter(storage).write('built', templateSnapshot(built))).toBe(false);
    expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe(before);
    expect(events).toEqual([]);
  });
  it('write refuses unreadable arrays and blocked storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_CV_TEMPLATES_KEY, '{');
    expect(templateAdapter(storage).write('t1', templateSnapshot(templateProps()))).toBe(false);
    expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe('{');
    const storage2 = new MemoryStorage();
    seedTemplates(storage2, [templateProps()]);
    storage2.blocked = true;
    expect(templateAdapter(storage2).write('t1', templateSnapshot(templateProps()))).toBe(false);
    storage2.blocked = false;
    expect(storedTemplates(storage2)[0].name).toBe('Local One');
  });
  it('createCopy creates a fresh local template with a template- id', () => {
    const storage = new MemoryStorage();
    const id = templateAdapter(storage).createCopy(templateSnapshot(templateProps()), 'Copy Name');
    expect(id?.startsWith('template-')).toBe(true);
    const entries = storedTemplates(storage);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Copy Name');
    expect(entries[0].version).toBe(1);
    expect(entries[0].builtIn).toBe(false);
    expect(events).toEqual([{ kind: 'template', id, origin: 'local' }]);
  });
  it('createCopy returns null for a wrong schema or blocked storage', () => {
    const storage = new MemoryStorage();
    const wrong = { title: 'X', content: JSON.stringify({ schema: 'ruxt.session/1', markdown: '# Hi', css: '' }) };
    expect(templateAdapter(storage).createCopy(wrong, 'Copy')).toBeNull();
    storage.blocked = true;
    expect(templateAdapter(storage).createCopy(templateSnapshot(templateProps()), 'Copy')).toBeNull();
  });
  it('clearConflict is a no-op for templates', () => {
    const storage = new MemoryStorage();
    seedTemplates(storage, [templateProps()]);
    const before = storage.getItem(LOCAL_CV_TEMPLATES_KEY);
    templateAdapter(storage).clearConflict('t1');
    expect(storage.getItem(LOCAL_CV_TEMPLATES_KEY)).toBe(before);
  });
  it('ownsStorageKey matches only the template key', () => {
    const adapter = templateAdapter(new MemoryStorage());
    expect(adapter.ownsStorageKey(LOCAL_CV_TEMPLATES_KEY)).toBe(true);
    expect(adapter.ownsStorageKey(LOCAL_PROFILES_KEY)).toBe(false);
    expect(adapter.ownsStorageKey('other')).toBe(false);
  });
});

const profileAdapter = (storage: MemoryStorage) => createProfileAdapter(() => storage);
const baseProfile = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  identity: { fullName: 'Ada Lovelace', headline: 'Engineer', summary: '', location: '' },
  contacts: [],
  experiences: [],
  skills: [],
  certifications: [],
  education: [],
  projects: [],
  languages: [],
  ...overrides,
});
const profileEntry = (overrides: Record<string, unknown> = {}) => ({
  ...baseProfile(),
  id: 'p1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
  label: 'My Label',
  ...overrides,
});
const seedProfiles = (storage: MemoryStorage, entries: unknown[]) => { storage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(entries)); };
const storedProfiles = (storage: MemoryStorage) => JSON.parse(storage.getItem(LOCAL_PROFILES_KEY) as string);
const profileSnapshot = (profile: unknown, title?: string) => ({ title: title ?? 'My Label', content: JSON.stringify({ schema: 'ruxt.profile/1', profile: normalizeCvProfile(profile) }) });

describe('profile adapter', () => {
  it('lists eligible profiles with stored labels, and gives a legacy profile without an id a stable one', () => {
    const storage = new MemoryStorage();
    const labelled = profileEntry();
    const unlabelled = profileEntry({ id: 'p2', label: '', identity: { fullName: 'Grace Hopper', headline: '', summary: '', location: '' } });
    seedProfiles(storage, [labelled, { ...baseProfile() }, unlabelled, 'oops']);
    const records = profileAdapter(storage).list();
    expect(records).toHaveLength(3);
    const byId = new Map(records.map((record) => [record.id, record]));
    expect(byId.get('p1')?.title).toBe('My Label');
    expect(byId.get('p2')?.title).toBe('Grace Hopper');
    expect(byId.get('p1')?.updatedAt).toBe(new Date(1700000001000).toISOString());
    expect(byId.get('p1')?.snapshot.content).toBe(profileSnapshot(baseProfile()).content);
    expect([...byId.keys()].filter((id) => id.startsWith('profile-'))).toHaveLength(1);
  });
  it('upgrades profiles without an id once: existing ids and every other field are kept, and the ids stay the same on every read', () => {
    const storage = new MemoryStorage();
    const legacy = { ...baseProfile(), custom: { keep: 'me' } };
    seedProfiles(storage, [profileEntry(), legacy, 'oops', { ...baseProfile(), identity: { ...baseProfile().identity, fullName: 'Second Legacy' } }]);
    const adapter = profileAdapter(storage);
    const first = adapter.list();
    expect(first.map((record) => record.id).filter((id) => id !== 'p1')).toHaveLength(2);
    const stored = JSON.parse(storage.getItem(LOCAL_PROFILES_KEY) as string);
    expect(stored[0]).toEqual(profileEntry()); // an entry that already had an id is untouched
    expect(stored[1]).toMatchObject({ custom: { keep: 'me' }, id: expect.stringMatching(/^profile-/) }); // nothing is dropped
    expect(stored[2]).toBe('oops'); // junk is kept, not discarded
    const second = profileAdapter(storage).list();
    expect(second.map((record) => record.id).sort()).toEqual(first.map((record) => record.id).sort());
    expect(profileAdapter(storage).get(first.find((record) => record.id !== 'p1')!.id)).not.toBeNull();
  });
  it('does not invent ids it could not save: such profiles stay ineligible and the stored data is unchanged', () => {
    const storage = new MemoryStorage();
    seedProfiles(storage, [{ ...baseProfile() }]);
    const before = storage.getItem(LOCAL_PROFILES_KEY);
    storage.blocked = true;
    expect(profileAdapter(storage).list()).toEqual([]);
    expect(storage.getItem(LOCAL_PROFILES_KEY)).toBe(before);
    storage.blocked = false;
    expect(profileAdapter(storage).list()).toHaveLength(1);
  });
  it('upgradeStoredProfileIds touches only entries without a usable id', () => {
    let serial = 0;
    const { entries, upgraded } = upgradeStoredProfileIds([{ id: 'keep' }, { id: '' }, { name: 'x' }, null, 4], () => `new-${++serial}`);
    expect(upgraded).toBe(true);
    expect(entries).toEqual([{ id: 'keep' }, { id: 'new-1' }, { name: 'x', id: 'new-2' }, null, 4]);
    expect(upgradeStoredProfileIds([{ id: 'a' }]).upgraded).toBe(false);
  });
  it('get returns null for missing profiles or unreadable storage', () => {
    const storage = new MemoryStorage();
    seedProfiles(storage, [profileEntry()]);
    expect(profileAdapter(storage).get('missing')).toBeNull();
    const broken = new MemoryStorage();
    broken.setItem(LOCAL_PROFILES_KEY, '{');
    expect(profileAdapter(broken).get('p1')).toBeNull();
    expect(profileAdapter(broken).list()).toEqual([]);
    expect(broken.getItem(LOCAL_PROFILES_KEY)).toBe('{');
  });
  it('write creates a new profile with the snapshot title as label and emits', () => {
    const storage = new MemoryStorage();
    const before = Date.now();
    expect(profileAdapter(storage).write('p1', profileSnapshot(baseProfile(), 'Fresh Label'))).toBe(true);
    const after = Date.now();
    const entries = storedProfiles(storage);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('p1');
    expect(entries[0].label).toBe('Fresh Label');
    expect(entries[0].identity.fullName).toBe('Ada Lovelace');
    expect(entries[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(entries[0].createdAt).toBeLessThanOrEqual(after);
    expect(entries[0].updatedAt).toBe(entries[0].createdAt);
    expect(events).toEqual([{ kind: 'profile', id: 'p1', origin: 'cloud' }]);
    expect(profileAdapter(storage).get('p1')?.snapshot.content).toBe(profileSnapshot(baseProfile()).content);
  });
  it('write replaces an entry, keeps its id and createdAt, and never drops others', () => {
    const storage = new MemoryStorage();
    const other = profileEntry({ id: 'p2', label: 'Other' });
    seedProfiles(storage, [profileEntry(), other]);
    const changed = baseProfile({ identity: { fullName: 'Ada Lovelace', headline: 'Senior Engineer', summary: '', location: '' } });
    const before = Date.now();
    expect(profileAdapter(storage).write('p1', profileSnapshot(changed, 'Renamed'))).toBe(true);
    const after = Date.now();
    const entries = storedProfiles(storage);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('p1');
    expect(entries[0].label).toBe('Renamed');
    expect(entries[0].identity.headline).toBe('Senior Engineer');
    expect(entries[0].createdAt).toBe(1700000000000);
    expect(entries[0].updatedAt).toBeGreaterThanOrEqual(before);
    expect(entries[0].updatedAt).toBeLessThanOrEqual(after);
    expect(entries[1]).toEqual(other);
    expect(events).toEqual([{ kind: 'profile', id: 'p1', origin: 'cloud' }]);
  });
  it('write falls back to the headline label when the snapshot title is blank', () => {
    const storage = new MemoryStorage();
    expect(profileAdapter(storage).write('p1', profileSnapshot(baseProfile(), ''))).toBe(true);
    expect(storedProfiles(storage)[0].label).toBe('Engineer');
  });
  it('write refuses a wrong schema, a missing profile, unreadable data and blocked storage', () => {
    const storage = new MemoryStorage();
    const wrong = { title: 'X', content: JSON.stringify({ schema: 'ruxt.session/1', markdown: '# Hi', css: '' }) };
    expect(profileAdapter(storage).write('p1', wrong)).toBe(false);
    const noProfile = { title: 'X', content: JSON.stringify({ schema: 'ruxt.profile/1' }) };
    expect(profileAdapter(storage).write('p1', noProfile)).toBe(false);
    expect(storage.getItem(LOCAL_PROFILES_KEY)).toBeNull();
    expect(events).toEqual([]);
    storage.setItem(LOCAL_PROFILES_KEY, '{');
    expect(profileAdapter(storage).write('p1', profileSnapshot(baseProfile()))).toBe(false);
    expect(storage.getItem(LOCAL_PROFILES_KEY)).toBe('{');
    const storage2 = new MemoryStorage();
    seedProfiles(storage2, [profileEntry()]);
    storage2.blocked = true;
    expect(profileAdapter(storage2).write('p1', profileSnapshot(baseProfile()))).toBe(false);
    storage2.blocked = false;
    expect(storedProfiles(storage2)[0].label).toBe('My Label');
    expect(events).toEqual([]);
  });
  it('createCopy creates a fresh local profile with a profile- id', () => {
    const storage = new MemoryStorage();
    const id = profileAdapter(storage).createCopy(profileSnapshot(baseProfile()), 'Copy Label');
    expect(id?.startsWith('profile-')).toBe(true);
    const entries = storedProfiles(storage);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].label).toBe('Copy Label');
    expect(entries[0].identity.fullName).toBe('Ada Lovelace');
    expect(entries[0].createdAt).toBe(entries[0].updatedAt);
    expect(events).toEqual([{ kind: 'profile', id, origin: 'local' }]);
  });
  it('createCopy returns null for a wrong schema or blocked storage', () => {
    const storage = new MemoryStorage();
    const wrong = { title: 'X', content: JSON.stringify({ schema: 'ruxt.session/1', markdown: '# Hi', css: '' }) };
    expect(profileAdapter(storage).createCopy(wrong, 'Copy')).toBeNull();
    storage.blocked = true;
    expect(profileAdapter(storage).createCopy(profileSnapshot(baseProfile()), 'Copy')).toBeNull();
  });
  it('clearConflict is a no-op for profiles', () => {
    const storage = new MemoryStorage();
    seedProfiles(storage, [profileEntry()]);
    const before = storage.getItem(LOCAL_PROFILES_KEY);
    profileAdapter(storage).clearConflict('p1');
    expect(storage.getItem(LOCAL_PROFILES_KEY)).toBe(before);
  });
  it('ownsStorageKey matches only the profiles key', () => {
    const adapter = profileAdapter(new MemoryStorage());
    expect(adapter.ownsStorageKey(LOCAL_PROFILES_KEY)).toBe(true);
    expect(adapter.ownsStorageKey(LOCAL_CV_TEMPLATES_KEY)).toBe(false);
    expect(adapter.ownsStorageKey('other')).toBe(false);
  });
  it('createRecordAdapters builds one adapter per registered kind', () => {
    const storage = new MemoryStorage();
    seedProfiles(storage, [profileEntry()]);
    const adapters = createRecordAdapters(() => storage);
    expect(Object.keys(adapters).sort()).toEqual([...SYNC_KINDS].sort());
    expect(Object.keys(adapters).sort()).toEqual(['jobPreferences', 'profile', 'session', 'template']);
    for (const kind of SYNC_KINDS) expect(adapters[kind].kind).toBe(kind);
    expect(SYNC_KIND_REGISTRY.jobPreferences.singleton).toBe(true);
    expect(adapters.profile.kind).toBe('profile');
    expect(adapters.profile.get('p1')?.title).toBe('My Label');
    expect(adapters.session.kind).toBe('session');
    expect(adapters.template.kind).toBe('template');
  });
});


const jobKey = JOB_PREFERENCES_KEY;
describe('job preferences adapter', () => {
  it('has no record until preferences were saved, then exactly one under a fixed id', () => {
    const storage = new MemoryStorage();
    const adapter = createJobPreferencesAdapter(() => storage);
    expect(adapter.list()).toEqual([]);
    expect(adapter.get(JOB_PREFERENCES_RECORD_ID)).toBeNull();
    storage.setItem(jobKey, JSON.stringify({ target_roles: ['Staff Engineer'], locations: ['Hanoi'], savedAt: 1700000000000, work_modes: ['remote'], answers: { notice_period: '2 weeks' } }));
    const [record, ...rest] = adapter.list();
    expect(rest).toEqual([]);
    expect(record).toMatchObject({ kind: 'jobPreferences', id: JOB_PREFERENCES_RECORD_ID, title: 'Job preferences', updatedAt: new Date(1700000000000).toISOString() });
    expect(JSON.parse(record!.snapshot.content)).toMatchObject({ schema: 'ruxt.job-preferences/1', preferences: { target_roles: ['Staff Engineer'], work_modes: ['remote'] } });
    expect(adapter.get('some-other-id')).toBeNull();
  });
  it('hashes equal data equally whatever order the standing answers were typed in, and ignores the savedAt stamp', () => {
    const a = jobPreferencesSnapshot({ answers: { b: '2', a: '1' }, savedAt: 1 });
    const b = jobPreferencesSnapshot({ answers: { a: '1', b: '2' }, savedAt: 99 });
    expect(a.content).toBe(b.content);
    expect(JSON.parse(a.content).preferences).not.toHaveProperty('savedAt');
  });
  it('writes cloud content in the format the Jobs page reads, emits a cloud change, and refuses anything else', () => {
    const storage = new MemoryStorage();
    const adapter = createJobPreferencesAdapter(() => storage);
    const snapshot = jobPreferencesSnapshot({ target_roles: ['Designer'], salary_min: 90000, salary_currency: 'usd' });
    expect(adapter.write(JOB_PREFERENCES_RECORD_ID, snapshot)).toBe(true);
    const stored = JSON.parse(storage.getItem(jobKey) as string);
    expect(stored).toMatchObject({ target_roles: ['Designer'], salary_min: 90000, salary_currency: 'USD', savedAt: expect.any(Number) });
    expect(events).toContainEqual({ kind: 'jobPreferences', id: JOB_PREFERENCES_RECORD_ID, origin: 'cloud' });
    expect(adapter.write('other-id', snapshot)).toBe(false);
    expect(adapter.write(JOB_PREFERENCES_RECORD_ID, { title: 'x', content: JSON.stringify({ schema: 'ruxt.session/1' }) })).toBe(false);
    expect(adapter.write(JOB_PREFERENCES_RECORD_ID, { title: 'x', content: 'not json' })).toBe(false);
  });
  it('never replaces unreadable stored data, and reports a refused write', () => {
    const storage = new MemoryStorage();
    storage.setItem(jobKey, '{broken');
    const adapter = createJobPreferencesAdapter(() => storage);
    expect(adapter.write(JOB_PREFERENCES_RECORD_ID, jobPreferencesSnapshot({ target_roles: ['x'] }))).toBe(false);
    expect(storage.getItem(jobKey)).toBe('{broken');
    storage.setItem(jobKey, JSON.stringify({ target_roles: ['a'] }));
    storage.blocked = true;
    expect(adapter.write(JOB_PREFERENCES_RECORD_ID, jobPreferencesSnapshot({ target_roles: ['b'] }))).toBe(false);
    expect(JSON.parse(storage.getItem(jobKey) as string).target_roles).toEqual(['a']);
  });
  it('cannot hold a second copy, so keep-both has nowhere to put one', () => {
    expect(createJobPreferencesAdapter(() => new MemoryStorage()).createCopy(jobPreferencesSnapshot({}), 'copy')).toBeNull();
  });
  it('owns only its storage key', () => {
    const adapter = createJobPreferencesAdapter(() => new MemoryStorage());
    expect(adapter.ownsStorageKey(jobKey)).toBe(true);
    expect(adapter.ownsStorageKey('ruxt:job-automation:selection:v1')).toBe(false);
  });
});
