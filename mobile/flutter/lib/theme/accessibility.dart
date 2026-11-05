import 'package:flutter/widgets.dart';

import 'generated_theme.dart';

/// Accessibility helpers shared by the shell.
///
/// Dynamic type: text styles carry token base sizes only and nothing
/// in the theme overrides the OS text scaler, so labels and buttons
/// keep scaling to the largest OS size.
///
/// Reduced motion: when the OS asks for reduced motion, token
/// durations collapse to zero and looping skeleton animations stop
/// (callers use [effectiveMotionDuration] and keep a static
/// placeholder). Theme switching itself is instant.
Duration effectiveMotionDuration(BuildContext context, double tokenMs) {
  if (MediaQuery.disableAnimationsOf(context)) return Duration.zero;
  return Duration(milliseconds: tokenMs.round());
}

/// The standard (non-emphasized) motion duration for this context.
Duration standardMotionDuration(BuildContext context) {
  return effectiveMotionDuration(context, RuxtTokens.durationStandard);
}

/// Focus ring geometry from the tokens: a solid accent outline.
/// Widgets that draw their own focus indicator use these values
/// instead of removing the indicator.
class RuxtFocusRing {
  static double get width => RuxtTokens.focusRingWidth;
  static double get offset => RuxtTokens.focusRingOffset;
}
