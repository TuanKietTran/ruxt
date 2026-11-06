import 'package:shared_preferences/shared_preferences.dart';

/// Async string key/value seam for device-local storage. All local
/// Ruxt data (CV documents, profiles, templates, preferences, the
/// session cookie) sits behind this interface so tests can use the
/// in-memory implementation and the app uses the platform store.
/// Nothing here touches the network or an account.
abstract interface class KeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
  Future<Set<String>> keys();
}

/// In-memory store, used in tests and previews.
class MemoryKeyValueStore implements KeyValueStore {
  MemoryKeyValueStore([Map<String, String>? initial])
      : _values = {...?initial};

  final Map<String, String> _values;

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    _values.remove(key);
  }

  @override
  Future<Set<String>> keys() async => {..._values.keys};
}

/// On-device store backed by the platform preferences file.
class SharedPreferencesKeyValueStore implements KeyValueStore {
  SharedPreferencesKeyValueStore([this._prefs]);

  SharedPreferences? _prefs;

  Future<SharedPreferences> _store() async =>
      _prefs ??= await SharedPreferences.getInstance();

  @override
  Future<String?> read(String key) async => (await _store()).getString(key);

  @override
  Future<void> write(String key, String value) async {
    await (await _store()).setString(key, value);
  }

  @override
  Future<void> remove(String key) async {
    await (await _store()).remove(key);
  }

  @override
  Future<Set<String>> keys() async => (await _store()).getKeys();
}
