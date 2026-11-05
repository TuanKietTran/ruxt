import 'dart:ui';

import 'package:flutter/foundation.dart';

import 'generated_theme.dart';
import 'theme_preferences.dart';
import 'theme_selection.dart';

/// Holds the current theme choice and density, loads them from the
/// device-local store before first paint (so the app never flashes in
/// the wrong theme), and persists changes immediately. Switching is
/// synchronous in memory: listeners rebuild in the same frame, with no
/// reload or navigation.
class ThemeController extends ChangeNotifier {
  ThemeController(this._preferences);

  final ThemePreferences _preferences;

  RuxtThemeChoice _choice = defaultThemeChoice;
  RuxtDensity _density = defaultDensity;
  Brightness _platformBrightness = Brightness.dark;
  bool _loaded = false;

  RuxtThemeChoice get choice => _choice;
  RuxtDensity get density => _density;
  Brightness get platformBrightness => _platformBrightness;

  /// False until [load] completes; the app renders nothing themed
  /// before that, mirroring the web control that appears only after
  /// the stored theme has been read.
  bool get isLoaded => _loaded;

  RuxtPalette get palette => resolvePalette(_choice, _platformBrightness);
  RuxtDensityMetrics get metrics => densityMetrics(_density);

  Future<void> load() async {
    final (choice, density) = await _preferences.load();
    _choice = choice;
    _density = density;
    _loaded = true;
    notifyListeners();
  }

  /// Applies and persists a theme choice. Returns false when the save
  /// failed so the UI can surface the standard failure message; the
  /// in-memory choice still changes, as on the web.
  Future<bool> setChoice(RuxtThemeChoice choice) async {
    if (choice == _choice) return true;
    _choice = choice;
    notifyListeners();
    try {
      await _preferences.saveTheme(choice);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> setDensity(RuxtDensity density) async {
    if (density == _density) return true;
    _density = density;
    notifyListeners();
    try {
      await _preferences.saveDensity(density);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Feeds the OS brightness in. Only the `system` choice is affected;
  /// a named theme ignores OS changes.
  void updatePlatformBrightness(Brightness brightness) {
    if (brightness == _platformBrightness) return;
    _platformBrightness = brightness;
    if (_choice == RuxtThemeChoice.system) notifyListeners();
  }
}
