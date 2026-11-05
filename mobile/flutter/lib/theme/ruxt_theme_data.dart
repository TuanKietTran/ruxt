import 'package:flutter/material.dart';

import 'generated_theme.dart';
import 'theme_selection.dart';

FontWeight _weight(double tokenWeight) {
  switch (tokenWeight.round()) {
    case 500:
      return FontWeight.w500;
    case 600:
      return FontWeight.w600;
    case 700:
      return FontWeight.w700;
    case 800:
      return FontWeight.w800;
    default:
      return FontWeight.w400;
  }
}

TextStyle _style(double size, double lineHeight, double weight, Color color) {
  return TextStyle(
    fontSize: size,
    height: lineHeight,
    fontWeight: _weight(weight),
    color: color,
  );
}

/// Builds the Material theme for one resolved palette and density.
///
/// Every color comes from the generated palette and every size from
/// the generated tokens; this file contains no raw color values.
/// Text sizes are token base sizes only: the OS text scaler is left
/// alone so dynamic type keeps working.
ThemeData buildRuxtThemeData({
  required RuxtPalette palette,
  required RuxtDensity density,
}) {
  final metrics = densityMetrics(density);
  final fontFamilies = RuxtTokens.fontSans.split(',').map((f) => f.trim()).toList();

  final colorScheme = ColorScheme(
    brightness: palette.brightness,
    primary: palette.accent,
    onPrimary: palette.onAccent,
    primaryContainer: palette.accentMuted,
    onPrimaryContainer: palette.fgText,
    secondary: palette.sapphire,
    onSecondary: palette.onAccent,
    tertiary: palette.teal,
    onTertiary: palette.onAccent,
    error: palette.danger,
    onError: palette.onAccent,
    surface: palette.bgSurface0,
    onSurface: palette.fgText,
    onSurfaceVariant: palette.fgSubtext0,
    surfaceContainerHighest: palette.bgSurface1,
    surfaceContainerHigh: palette.bgSurface1,
    surfaceContainer: palette.bgSurface0,
    surfaceContainerLow: palette.bgMantle,
    surfaceContainerLowest: palette.bgCrust,
    outline: palette.border,
    outlineVariant: palette.borderStrong,
  );

  final textTheme = TextTheme(
    displayLarge: _style(RuxtTokens.textDisplaySize, RuxtTokens.textDisplayLineHeight, RuxtTokens.textDisplayWeight, palette.fgText),
    headlineLarge: _style(RuxtTokens.textHeadingSize, RuxtTokens.textHeadingLineHeight, RuxtTokens.textHeadingWeight, palette.fgText),
    titleLarge: _style(RuxtTokens.textTitleSize, RuxtTokens.textTitleLineHeight, RuxtTokens.textTitleWeight, palette.fgText),
    titleMedium: _style(RuxtTokens.textSubtitleSize, RuxtTokens.textSubtitleLineHeight, RuxtTokens.textSubtitleWeight, palette.fgText),
    bodyLarge: _style(RuxtTokens.textBodyLargeSize, RuxtTokens.textBodyLargeLineHeight, RuxtTokens.textBodyLargeWeight, palette.fgText),
    bodyMedium: _style(RuxtTokens.textBodySize, RuxtTokens.textBodyLineHeight, RuxtTokens.textBodyWeight, palette.fgText),
    bodySmall: _style(RuxtTokens.textBodySmallSize, RuxtTokens.textBodySmallLineHeight, RuxtTokens.textBodySmallWeight, palette.fgSubtext1),
    labelLarge: _style(RuxtTokens.textLabelSize, RuxtTokens.textLabelLineHeight, RuxtTokens.textLabelWeight, palette.fgText),
    labelSmall: _style(RuxtTokens.textCaptionSize, RuxtTokens.textCaptionLineHeight, RuxtTokens.textCaptionWeight, palette.fgSubtext0),
  );

  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(RuxtTokens.radiusMd),
    borderSide: BorderSide(color: palette.border),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: palette.brightness,
    colorScheme: colorScheme,
    fontFamily: fontFamilies.first,
    fontFamilyFallback: fontFamilies.skip(1).toList(),
    scaffoldBackgroundColor: palette.bgBase,
    canvasColor: palette.bgBase,
    dividerColor: palette.border,
    focusColor: palette.accent,
    hintColor: palette.fgSubtext0,
    textTheme: textTheme,
    visualDensity: density == RuxtDensity.compact
        ? VisualDensity.compact
        : VisualDensity.standard,
    appBarTheme: AppBarThemeData(
      backgroundColor: palette.bgMantle,
      foregroundColor: palette.fgText,
      elevation: 0,
      surfaceTintColor: palette.bgMantle,
    ),
    cardTheme: CardThemeData(
      color: palette.bgMantle,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RuxtTokens.radiusMd),
        side: BorderSide(color: palette.border),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: palette.bgSurface0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RuxtTokens.radiusLg),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: palette.bgSurface1,
      contentTextStyle: textTheme.bodyMedium,
    ),
    iconTheme: IconThemeData(color: palette.fgSubtext1),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: Size(0, metrics.controlHeight),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RuxtTokens.radiusMd),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: Size(0, metrics.controlHeight),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RuxtTokens.radiusMd),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: Size(0, metrics.controlHeight),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RuxtTokens.radiusMd),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: palette.bgSurface0,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: BorderSide(color: palette.accent, width: RuxtTokens.focusRingWidth),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: palette.bgMantle,
      indicatorColor: palette.accentMuted,
      labelTextStyle: WidgetStatePropertyAll(textTheme.labelLarge),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: palette.bgMantle,
      indicatorColor: palette.accentMuted,
      selectedLabelTextStyle: textTheme.labelLarge,
      unselectedLabelTextStyle: textTheme.labelLarge,
    ),
    listTileTheme: ListTileThemeData(minTileHeight: metrics.rowHeight),
  );
}
