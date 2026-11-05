import 'package:shared_preferences/shared_preferences.dart';

import 'theme_selection.dart';

/// Minimal async key/value seam for device-local storage. The shell
/// ships an in-memory implementation; the app entry point can back this
/// with an on-device store without changing the theme code. No network
/// or account storage is involved.
abstract interface class ThemePreferencesStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

/// In-memory store, used by default in tests and previews.
class MemoryThemePreferencesStore implements ThemePreferencesStore {
  MemoryThemePreferencesStore([Map<String, String>? initial])
      : _values = {...?initial};

  final Map<String, String> _values;

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }
}

/// On-device store backed by the platform preferences file. This is
/// the default store used by the app entry point.
class SharedPreferencesThemeStore implements ThemePreferencesStore {
  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  @override
  Future<String?> read(String key) async => (await _prefs).getString(key);

  @override
  Future<void> write(String key, String value) async {
    await (await _prefs).setString(key, value);
  }
}

/// Theme and density persistence.
///
/// Both values are device-local only. The theme uses the same storage
/// key as the web app (`theme`); density has no web counterpart and
/// uses its own key. Neither value is part of the account preferences
/// record (which holds the profile save mode), and the two stores stay
/// independent.
class ThemePreferences {
  ThemePreferences(this._store);

  final ThemePreferencesStore _store;

  static const String themeKey = 'theme';
  static const String densityKey = 'ruxt.density';

  Future<RuxtThemeChoice> loadTheme() async {
    return RuxtThemeChoice.fromId(await _store.read(themeKey)) ??
        defaultThemeChoice;
  }

  Future<RuxtDensity> loadDensity() async {
    return RuxtDensity.fromId(await _store.read(densityKey)) ??
        defaultDensity;
  }

  Future<(RuxtThemeChoice, RuxtDensity)> load() async {
    return (await loadTheme(), await loadDensity());
  }

  Future<void> saveTheme(RuxtThemeChoice choice) {
    return _store.write(themeKey, choice.id);
  }

  Future<void> saveDensity(RuxtDensity density) {
    return _store.write(densityKey, density.id);
  }
}
