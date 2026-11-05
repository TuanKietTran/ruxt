import 'dart:ui';

import 'package:flutter/material.dart' show VisualDensity;
import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/theme/generated_theme.dart';
import 'package:ruxt/theme/ruxt_theme_data.dart';
import 'package:ruxt/theme/theme_controller.dart';
import 'package:ruxt/theme/theme_preferences.dart';
import 'package:ruxt/theme/theme_selection.dart';

void main() {
  group('palette resolution', () {
    test('named themes resolve to their own palette', () {
      expect(resolvePalette(RuxtThemeChoice.mocha, Brightness.light), mochaPalette);
      expect(resolvePalette(RuxtThemeChoice.latte, Brightness.dark), lattePalette);
      expect(resolvePalette(RuxtThemeChoice.opencode, Brightness.light), opencodePalette);
    });

    test('system follows OS brightness: light to Latte, dark to Mocha', () {
      expect(resolvePalette(RuxtThemeChoice.system, Brightness.light), lattePalette);
      expect(resolvePalette(RuxtThemeChoice.system, Brightness.dark), mochaPalette);
    });

    test('latte is the only light palette', () {
      expect(lattePalette.brightness, Brightness.light);
      expect(mochaPalette.brightness, Brightness.dark);
      expect(opencodePalette.brightness, Brightness.dark);
    });
  });

  group('preferences', () {
    test('missing values fall back to mocha and comfortable', () async {
      final prefs = ThemePreferences(MemoryThemePreferencesStore());
      expect(await prefs.loadTheme(), RuxtThemeChoice.mocha);
      expect(await prefs.loadDensity(), RuxtDensity.comfortable);
    });

    test('unrecognized stored values fall back to the defaults', () async {
      final prefs = ThemePreferences(MemoryThemePreferencesStore({
        ThemePreferences.themeKey: 'neon',
        ThemePreferences.densityKey: 'roomy',
      }));
      expect(await prefs.loadTheme(), RuxtThemeChoice.mocha);
      expect(await prefs.loadDensity(), RuxtDensity.comfortable);
    });

    test('saved theme and density round-trip', () async {
      final prefs = ThemePreferences(MemoryThemePreferencesStore());
      await prefs.saveTheme(RuxtThemeChoice.opencode);
      await prefs.saveDensity(RuxtDensity.compact);
      final (theme, density) = await prefs.load();
      expect(theme, RuxtThemeChoice.opencode);
      expect(density, RuxtDensity.compact);
    });
  });

  group('density and window classes', () {
    test('density metrics match the token values', () {
      final comfortable = densityMetrics(RuxtDensity.comfortable);
      expect(comfortable.scale, 1.0);
      expect(comfortable.controlHeight, 36.0);
      expect(comfortable.rowHeight, 40.0);
      final compact = densityMetrics(RuxtDensity.compact);
      expect(compact.scale, 0.875);
      expect(compact.controlHeight, 30.0);
      expect(compact.rowHeight, 32.0);
    });

    test('window class boundaries follow the token breakpoints', () {
      expect(windowClassForWidth(400), RuxtWindowClass.compact);
      expect(windowClassForWidth(900), RuxtWindowClass.compact);
      expect(windowClassForWidth(901), RuxtWindowClass.medium);
      expect(windowClassForWidth(1279), RuxtWindowClass.medium);
      expect(windowClassForWidth(1280), RuxtWindowClass.expanded);
    });
  });

  group('controller', () {
    test('load restores stored choice and density', () async {
      final controller = ThemeController(ThemePreferences(
        MemoryThemePreferencesStore({
          ThemePreferences.themeKey: 'latte',
          ThemePreferences.densityKey: 'compact',
        }),
      ));
      expect(controller.isLoaded, isFalse);
      await controller.load();
      expect(controller.isLoaded, isTrue);
      expect(controller.choice, RuxtThemeChoice.latte);
      expect(controller.density, RuxtDensity.compact);
      expect(controller.palette, lattePalette);
    });

    test('setChoice persists and notifies', () async {
      final store = MemoryThemePreferencesStore();
      final controller = ThemeController(ThemePreferences(store));
      var notifications = 0;
      controller.addListener(() => notifications++);
      expect(await controller.setChoice(RuxtThemeChoice.opencode), isTrue);
      expect(notifications, 1);
      expect(await store.read(ThemePreferences.themeKey), 'opencode');
    });

    test('OS brightness only changes the palette in system mode', () async {
      final controller = ThemeController(
          ThemePreferences(MemoryThemePreferencesStore()));
      await controller.setChoice(RuxtThemeChoice.system);
      controller.updatePlatformBrightness(Brightness.light);
      expect(controller.palette, lattePalette);
      controller.updatePlatformBrightness(Brightness.dark);
      expect(controller.palette, mochaPalette);
      await controller.setChoice(RuxtThemeChoice.latte);
      controller.updatePlatformBrightness(Brightness.dark);
      expect(controller.palette, lattePalette);
    });
  });

  group('material theme', () {
    test('theme data carries palette brightness, accent and density', () {
      final data = buildRuxtThemeData(
        palette: lattePalette,
        density: RuxtDensity.compact,
      );
      expect(data.brightness, Brightness.light);
      expect(data.colorScheme.primary, lattePalette.accent);
      expect(data.scaffoldBackgroundColor, lattePalette.bgBase);
      expect(data.visualDensity, VisualDensity.compact);
      final comfortable = buildRuxtThemeData(
        palette: mochaPalette,
        density: RuxtDensity.comfortable,
      );
      expect(comfortable.visualDensity, VisualDensity.standard);
    });
  });
}
