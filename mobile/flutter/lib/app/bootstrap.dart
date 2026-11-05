import 'package:flutter/widgets.dart';

import '../theme/theme_controller.dart';
import '../theme/theme_preferences.dart';
import 'app_config.dart';
import 'ruxt_app.dart';

/// Shared startup for every flavor entry point: loads the
/// device-local theme and density before the first frame, then
/// runs the app with the flavor [config]. API wiring consumes
/// [AppConfig.apiBaseUrl] via the data layer; nothing here calls
/// the network.
Future<void> bootstrap(AppConfig config) async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = ThemeController(
    ThemePreferences(SharedPreferencesThemeStore()),
  );
  await controller.load();
  runApp(RuxtApp(controller: controller, config: config));
}
