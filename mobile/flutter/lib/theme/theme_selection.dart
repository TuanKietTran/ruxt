import 'dart:ui';

import 'generated_theme.dart';

/// Named theme choices offered by the theme control, plus the Planned
/// `system` option. Ids and labels are the same on every platform.
enum RuxtThemeChoice {
  mocha('mocha', 'Mocha'),
  latte('latte', 'Latte'),
  opencode('opencode', 'OpenCode'),
  system('system', 'System');

  const RuxtThemeChoice(this.id, this.label);

  final String id;
  final String label;

  /// Parses a stored id; returns null for missing or unrecognized values
  /// so the caller can fall back to the default theme.
  static RuxtThemeChoice? fromId(String? id) {
    for (final choice in values) {
      if (choice.id == id) return choice;
    }
    return null;
  }
}

/// Fallback used when nothing is stored or the stored value is unknown,
/// matching the web app.
const RuxtThemeChoice defaultThemeChoice = RuxtThemeChoice.mocha;

/// Resolves a choice to a concrete palette. A named theme always wins;
/// `system` follows the OS brightness live (light to Latte, dark to
/// Mocha) until the user picks a named theme.
RuxtPalette resolvePalette(RuxtThemeChoice choice, Brightness platform) {
  switch (choice) {
    case RuxtThemeChoice.mocha:
      return mochaPalette;
    case RuxtThemeChoice.latte:
      return lattePalette;
    case RuxtThemeChoice.opencode:
      return opencodePalette;
    case RuxtThemeChoice.system:
      return platform == Brightness.light ? lattePalette : mochaPalette;
  }
}

/// User-selectable density. Device-local, applies without restart.
enum RuxtDensity {
  comfortable('comfortable', 'Comfortable'),
  compact('compact', 'Compact');

  const RuxtDensity(this.id, this.label);

  final String id;
  final String label;

  static RuxtDensity? fromId(String? id) {
    for (final density in values) {
      if (density.id == id) return density;
    }
    return null;
  }
}

const RuxtDensity defaultDensity = RuxtDensity.comfortable;

/// Concrete density measurements, read from the generated tokens.
class RuxtDensityMetrics {
  const RuxtDensityMetrics({
    required this.scale,
    required this.controlHeight,
    required this.rowHeight,
  });

  final double scale;
  final double controlHeight;
  final double rowHeight;
}

RuxtDensityMetrics densityMetrics(RuxtDensity density) {
  switch (density) {
    case RuxtDensity.comfortable:
      return RuxtDensityMetrics(
        scale: RuxtTokens.densityComfortableScale,
        controlHeight: RuxtTokens.densityComfortableControlHeight,
        rowHeight: RuxtTokens.densityComfortableRowHeight,
      );
    case RuxtDensity.compact:
      return RuxtDensityMetrics(
        scale: RuxtTokens.densityCompactScale,
        controlHeight: RuxtTokens.densityCompactControlHeight,
        rowHeight: RuxtTokens.densityCompactRowHeight,
      );
  }
}

/// Layout window classes. The compact/medium boundary is the generated
/// medium breakpoint token; the expanded boundary (1280) comes from the
/// window-class table in design/tokens.json, which the generator does
/// not emit as a token.
enum RuxtWindowClass { compact, medium, expanded }

const double expandedMinWidth = 1280.0;

RuxtWindowClass windowClassForWidth(double width) {
  if (width <= RuxtTokens.breakpointMedium) return RuxtWindowClass.compact;
  if (width < expandedMinWidth) return RuxtWindowClass.medium;
  return RuxtWindowClass.expanded;
}
