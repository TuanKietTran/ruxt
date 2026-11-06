import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/data/kv_store.dart';
import 'package:ruxt/data/local_stores.dart';
import 'package:ruxt/data/models.dart';

void main() {
  group('LocalCvStore', () {
    late MemoryKeyValueStore kv;
    late DateTime now;
    late LocalCvStore store;
    setUp(() {
      kv = MemoryKeyValueStore();
      now = DateTime.utc(2026, 11, 5, 10);
      store = LocalCvStore(kv, now: () => now);
    });

    test('create starts at revision 1, trims the title and persists under the web key', () async {
      final doc = await store.create(title: '  My CV  ', markdown: '# My CV');
      expect(doc.title, 'My CV');
      expect(doc.revision, 1);
      expect(doc.updatedAt, now);
      expect(await kv.keys(), contains('${LocalCvStore.prefix}${doc.id}'));
      final loaded = await store.get(doc.id);
      expect(loaded?.markdown, '# My CV');
      expect(loaded?.revision, 1);
    });
    test('create falls back to Untitled CV for a blank or missing title', () async {
      expect((await store.create()).title, 'Untitled CV');
      expect((await store.create(title: '   ')).title, 'Untitled CV');
    });
    test('list returns summaries newest first', () async {
      final first = await store.create(title: 'First');
      now = now.add(const Duration(hours: 1));
      final second = await store.create(title: 'Second');
      final summaries = await store.list();
      expect(summaries.map((s) => s.id), [second.id, first.id]);
      expect(summaries.first.title, 'Second');
    });
    test('save is a no-op when markdown and css are unchanged', () async {
      final doc = await store.create(title: 'CV', markdown: '# A', css: 'a{}');
      now = now.add(const Duration(hours: 2));
      final saved = await store.save(doc);
      expect(saved.revision, 1);
      expect(saved.updatedAt, doc.updatedAt);
    });
    test('save bumps the revision on content change and keeps the stored title', () async {
      final doc = await store.create(title: 'Original', markdown: '# A');
      now = now.add(const Duration(minutes: 5));
      final edited = CvDocument(id: doc.id, title: 'Changed Elsewhere', markdown: '# B', css: '', revision: doc.revision, updatedAt: doc.updatedAt);
      final saved = await store.save(edited);
      expect(saved.revision, 2);
      expect(saved.title, 'Original');
      expect(saved.markdown, '# B');
      expect(saved.updatedAt, now);
    });
    test('save of an unknown document stores it as given', () async {
      final at = DateTime.utc(2026, 1, 1);
      final doc = CvDocument(id: 'ext-1', title: 'Imported', markdown: '# I', css: '', revision: 4, updatedAt: at);
      final saved = await store.save(doc);
      expect(saved.revision, 4);
      expect((await store.get('ext-1'))?.title, 'Imported');
    });
    test('rename trims, keeps the title when blank and never bumps the revision', () async {
      final doc = await store.create(title: 'Old', markdown: '# A');
      final renamed = await store.rename(doc.id, '  New Name  ');
      expect(renamed?.title, 'New Name');
      expect(renamed?.revision, 1);
      expect((await store.rename(doc.id, '   '))?.title, 'New Name');
      expect(await store.rename('missing', 'X'), isNull);
    });
    test('fork copies content at revision 1 with a copy title and a new id', () async {
      final doc = await store.create(title: 'Base', markdown: '# A', css: 'c{}');
      final copy = await store.fork(doc.id);
      expect(copy, isNotNull);
      expect(copy!.id, isNot(doc.id));
      expect(copy.title, 'Base (copy)');
      expect(copy.markdown, '# A');
      expect(copy.css, 'c{}');
      expect(copy.revision, 1);
      expect((await store.fork(doc.id, title: 'Custom'))?.title, 'Custom');
      expect(await store.fork('missing'), isNull);
    });
    test('delete removes the document', () async {
      final doc = await store.create(title: 'Gone');
      await store.delete(doc.id);
      expect(await store.get(doc.id), isNull);
      expect(await store.list(), isEmpty);
    });
    test('draft round-trips and clears', () async {
      expect(await store.loadDraft(), isNull);
      await store.saveDraft(markdown: '# Draft');
      final draft = await store.loadDraft();
      expect(draft?.markdown, '# Draft');
      expect(draft?.css, '');
      await store.saveDraft(markdown: '# D2', css: 'x{}');
      expect((await store.loadDraft())?.css, 'x{}');
      expect(await kv.read(LocalCvStore.draftKey), isNotNull);
      await store.clearDraft();
      expect(await store.loadDraft(), isNull);
    });
  });

  group('LocalProfileStore', () {
    test('upsert adds then replaces by id, get and delete follow', () async {
      final kv = MemoryKeyValueStore();
      final store = LocalProfileStore(kv);
      expect(await store.list(), isEmpty);
      await store.upsert(const CvProfile(id: 'p1', name: 'Jane'));
      await store.upsert(const CvProfile(id: 'p2', name: 'John'));
      final replaced = await store.upsert(const CvProfile(id: 'p1', name: 'Janet', headline: 'Eng'));
      expect(replaced, hasLength(2));
      expect((await store.get('p1'))?.name, 'Janet');
      expect(await kv.read(LocalProfileStore.storageKey), isNotNull);
      final remaining = await store.delete('p1');
      expect(remaining.map((p) => p.id), ['p2']);
      expect(await store.get('p1'), isNull);
    });
  });
}
