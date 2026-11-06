import 'dart:convert';
import 'dart:math';

import 'api_client.dart';
import 'kv_store.dart';
import 'models.dart';

/// Device-local stores. CV documents, profiles and private templates
/// have no server CRUD: they live here, mirroring the web app's
/// local-storage keys and semantics (create starts at revision 1,
/// save bumps the revision only when markdown/css actually change,
/// fork defaults to '<title> (copy)'). Preferences use the local
/// store while signed out and the account API while signed in; the
/// two are independent and signing in never uploads the local copy.

String generateLocalId() {
  final random = Random.secure();
  String part(int bytes) => List.generate(
        bytes,
        (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
  return '${part(4)}-${part(2)}-${part(2)}-${part(2)}-${part(6)}';
}

Map<String, dynamic> _mapOf(Object? value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : {};

/// Local CV documents (the app's sessions list).
class LocalCvStore {
  LocalCvStore(this._store, {DateTime Function()? now})
      : _now = now ?? DateTime.now;

  final KeyValueStore _store;
  final DateTime Function() _now;

  static const String prefix = 'cv-sv:session-backup:';
  static const String draftKey = 'cv-sv:new-session-draft';

  String _key(String id) => '$prefix$id';

  Map<String, dynamic> _encode(CvDocument doc) => {
        'id': doc.id,
        'title': doc.title,
        'markdown': doc.markdown,
        'css': doc.css,
        'revision': doc.revision,
        'updatedAt': doc.updatedAt.toIso8601String(),
        'savedAt': doc.updatedAt.toIso8601String(),
        'pending': false,
      };

  CvDocument? _decode(String raw) {
    try {
      final json = _mapOf(jsonDecode(raw));
      final id = json['id']?.toString() ?? '';
      if (id.isEmpty) return null;
      return CvDocument(
        id: id,
        title: json['title'] as String?,
        markdown: json['markdown'] as String? ?? '',
        css: json['css'] as String? ?? '',
        revision: (json['revision'] as num?)?.toInt() ?? 1,
        updatedAt: DateTime.tryParse(
                (json['updatedAt'] ?? json['savedAt'])?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _put(CvDocument doc) =>
      _store.write(_key(doc.id), jsonEncode(_encode(doc)));

  Future<CvDocument?> get(String id) async {
    final raw = await _store.read(_key(id));
    return raw == null ? null : _decode(raw);
  }

  Future<List<CvDocumentSummary>> list() async {
    final docs = <CvDocument>[];
    for (final key in await _store.keys()) {
      if (!key.startsWith(prefix)) continue;
      final raw = await _store.read(key);
      final doc = raw == null ? null : _decode(raw);
      if (doc != null) docs.add(doc);
    }
    docs.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return docs.map((d) => d.summary).toList();
  }

  Future<CvDocument> create({
    String? title,
    String markdown = '',
    String css = '',
  }) async {
    final trimmed = title?.trim() ?? '';
    final doc = CvDocument(
      id: generateLocalId(),
      title: trimmed.isEmpty ? 'Untitled CV' : trimmed,
      markdown: markdown,
      css: css,
      revision: 1,
      updatedAt: _now(),
    );
    await _put(doc);
    return doc;
  }

  /// Saves [doc]. The revision bumps only when markdown or css
  /// changed versus the stored copy; an unchanged save is a no-op
  /// and returns the stored document. Title changes go through
  /// [rename] and never bump the revision.
  Future<CvDocument> save(CvDocument doc) async {
    final existing = await get(doc.id);
    if (existing == null) {
      final created = CvDocument(
        id: doc.id,
        title: doc.title,
        markdown: doc.markdown,
        css: doc.css,
        revision: doc.revision < 1 ? 1 : doc.revision,
        updatedAt: doc.updatedAt,
      );
      await _put(created);
      return created;
    }
    if (existing.markdown == doc.markdown && existing.css == doc.css) {
      return existing;
    }
    final saved = CvDocument(
      id: existing.id,
      title: existing.title,
      markdown: doc.markdown,
      css: doc.css,
      revision: existing.revision + 1,
      updatedAt: _now(),
    );
    await _put(saved);
    return saved;
  }

  Future<CvDocument?> rename(String id, String title) async {
    final existing = await get(id);
    if (existing == null) return null;
    final renamed = CvDocument(
      id: existing.id,
      title: title.trim().isEmpty ? existing.title : title.trim(),
      markdown: existing.markdown,
      css: existing.css,
      revision: existing.revision,
      updatedAt: existing.updatedAt,
    );
    await _put(renamed);
    return renamed;
  }

  Future<CvDocument?> fork(String id, {String? title}) async {
    final source = await get(id);
    if (source == null) return null;
    final copy = CvDocument(
      id: generateLocalId(),
      title: title ?? '${source.title ?? 'Untitled CV'} (copy)',
      markdown: source.markdown,
      css: source.css,
      revision: 1,
      updatedAt: _now(),
    );
    await _put(copy);
    return copy;
  }

  Future<void> delete(String id) => _store.remove(_key(id));

  // --- new-session draft (pre-session editor content) ---------------

  Future<void> saveDraft({required String markdown, String css = ''}) =>
      _store.write(
        draftKey,
        jsonEncode({'markdown': markdown, 'css': css}),
      );

  Future<({String markdown, String css})?> loadDraft() async {
    final raw = await _store.read(draftKey);
    if (raw == null) return null;
    final json = _mapOf(jsonDecode(raw));
    return (
      markdown: json['markdown'] as String? ?? '',
      css: json['css'] as String? ?? '',
    );
  }

  Future<void> clearDraft() => _store.remove(draftKey);
}

/// Standalone local profiles (never uploaded by sync).
class LocalProfileStore {
  LocalProfileStore(this._store);

  final KeyValueStore _store;

  static const String storageKey = 'cv-sv:local-profiles:v1';

  Future<List<CvProfile>> list() async {
    final raw = await _store.read(storageKey);
    if (raw == null) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded.map((e) => CvProfile.fromJson(_mapOf(e))).toList();
  }

  Future<void> _writeAll(List<CvProfile> profiles) => _store.write(
        storageKey,
        jsonEncode(profiles.map((p) => p.toJson()).toList()),
      );

  Future<CvProfile?> get(String id) async {
    for (final profile in await list()) {
      if (profile.id == id) return profile;
    }
    return null;
  }

  Future<List<CvProfile>> upsert(CvProfile profile) async {
    final profiles = [...await list()];
    final index = profiles.indexWhere((p) => p.id == profile.id);
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.add(profile);
    }
    await _writeAll(profiles);
    return profiles;
  }

  Future<List<CvProfile>> delete(String id) async {
    final profiles = (await list()).where((p) => p.id != id).toList();
    await _writeAll(profiles);
    return profiles;
  }
}

/// Private local templates. The server catalog is read-only and
/// public-only; cloning a catalog template happens here, locally.
class LocalTemplateStore {
  LocalTemplateStore(this._store);

  final KeyValueStore _store;

  static const String storageKey = 'cv-sv:local-templates:v1';

  Future<List<CvTemplate>> list() async {
    final raw = await _store.read(storageKey);
    if (raw == null) return const [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded.map((e) => CvTemplate.fromJson(_mapOf(e))).toList();
  }

  Future<void> _writeAll(List<CvTemplate> templates) => _store.write(
        storageKey,
        jsonEncode(templates.map((t) => t.toJson()).toList()),
      );

  Future<CvTemplate?> get(String id) async {
    for (final template in await list()) {
      if (template.id == id) return template;
    }
    return null;
  }

  Future<List<CvTemplate>> upsert(CvTemplate template) async {
    final templates = [...await list()];
    final index = templates.indexWhere((t) => t.id == template.id);
    if (index >= 0) {
      templates[index] = template;
    } else {
      templates.add(template);
    }
    await _writeAll(templates);
    return templates;
  }

  Future<List<CvTemplate>> delete(String id) async {
    final templates = (await list()).where((t) => t.id != id).toList();
    await _writeAll(templates);
    return templates;
  }

  /// Local clone of any template (e.g. from the public catalog):
  /// new id, name suffixed ' (copy)', no longer built-in.
  Future<CvTemplate> cloneLocal(CvTemplate source) async {
    final copy = CvTemplate(
      id: generateLocalId(),
      version: source.version,
      name: source.name == null ? null : '${source.name} (copy)',
      markdownSkeleton: source.markdownSkeleton,
      css: source.css,
      capabilities: source.capabilities,
      builtIn: false,
      tags: source.tags.where((t) => t != 'public').toList(),
      raw: {...source.raw},
    );
    await upsert(copy);
    return copy;
  }
}

/// Signed-out preferences, stored on device only.
class LocalPreferencesStore {
  LocalPreferencesStore(this._store);

  final KeyValueStore _store;

  static const String storageKey = 'cv-sv:preferences:v1';

  Future<UserPreferences> load() async {
    final raw = await _store.read(storageKey);
    if (raw == null) return const UserPreferences();
    return UserPreferences.fromJson(_mapOf(jsonDecode(raw)));
  }

  Future<void> save(UserPreferences preferences) =>
      _store.write(storageKey, jsonEncode(preferences.toJson()));
}

/// Preferences facade: account API while signed in, local store
/// while signed out. The two stores are independent - signing in
/// does not upload or merge the local copy.
class PreferencesService {
  PreferencesService({
    required LocalPreferencesStore local,
    required RuxtApiClient api,
    required bool Function() isSignedIn,
  })  : _local = local,
        _api = api,
        _isSignedIn = isSignedIn;

  final LocalPreferencesStore _local;
  final RuxtApiClient _api;
  final bool Function() _isSignedIn;

  Future<UserPreferences> load() =>
      _isSignedIn() ? _api.getPreferences() : _local.load();

  Future<void> save(UserPreferences preferences) async {
    if (_isSignedIn()) {
      await _api.putPreferences(preferences);
    } else {
      await _local.save(preferences);
    }
  }

  Future<UserPreferences> patch(Map<String, dynamic> patch) async {
    final updated = (await load()).withPatch(patch);
    await save(updated);
    return updated;
  }
}
