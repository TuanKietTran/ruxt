import 'package:flutter/widgets.dart';

import 'app/ruxt_app.dart';
import 'theme/theme_controller.dart';
import 'theme/theme_preferences.dart';

/// Entry point: loads the device-local theme and density before the
/// first frame, then runs the app. Flavor and API wiring are handled
/// by the full app build; this shell needs neither.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = ThemeController(
    ThemePreferences(SharedPreferencesThemeStore()),
  );
  await controller.load();
  runApp(RuxtApp(controller: controller));
}
