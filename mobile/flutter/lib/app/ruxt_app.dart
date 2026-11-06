import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'app_config.dart';
import '../theme/ruxt_theme_data.dart';
import '../theme/theme_controller.dart';
import '../widgets/state_views.dart';
import 'ruxt_shell.dart';

/// Root widget. Rebuilds the MaterialApp whenever the theme
/// controller changes (theme choice, density, or - in system mode -
/// OS brightness), so a change applies to the whole window in the
/// same frame with no reload. Until the stored preferences have
/// loaded, only a loading view is shown, so the first paint is never
/// in the wrong theme.
class RuxtApp extends StatefulWidget {
  const RuxtApp({
    super.key,
    required this.controller,
    this.config = AppConfig.prod,
  });

  final ThemeController controller;
  final AppConfig config;

  @override
  State<RuxtApp> createState() => _RuxtAppState();
}

class _RuxtAppState extends State<RuxtApp> {
  @override
  void initState() {
    super.initState();
    final dispatcher = ui.PlatformDispatcher.instance;
    widget.controller.updatePlatformBrightness(dispatcher.platformBrightness);
    dispatcher.onPlatformBrightnessChanged = () {
      widget.controller
          .updatePlatformBrightness(dispatcher.platformBrightness);
    };
  }

  @override
  void dispose() {
    ui.PlatformDispatcher.instance.onPlatformBrightnessChanged = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        return MaterialApp(
          title: widget.config.appName,
          debugShowCheckedModeBanner: false,
          theme: buildRuxtThemeData(
            palette: widget.controller.palette,
            density: widget.controller.density,
          ),
          home: widget.controller.isLoaded
              ? RuxtShell(controller: widget.controller)
              : const Scaffold(body: RuxtLoadingState(label: 'Loading Ruxt')),
        );
      },
    );
  }
}
