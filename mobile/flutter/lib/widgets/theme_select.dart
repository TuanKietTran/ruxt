import 'package:flutter/material.dart';

import '../theme/theme_controller.dart';
import '../theme/theme_selection.dart';

/// Applies a theme choice and reports the outcome with the same
/// messages as the web app.
Future<void> applyThemeChoice(
  BuildContext context,
  ThemeController controller,
  RuxtThemeChoice choice,
) async {
  final ok = await controller.setChoice(choice);
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(ok
          ? 'Theme changed to ${choice.label}.'
          : 'The theme could not be saved.'),
    ),
  );
}

/// Theme control for the app header. Present at every width,
/// including compact; lists every theme by label and marks the
/// current one. Renders only once the controller has loaded the
/// stored theme, so there is no first-paint flash.
class ThemeSelect extends StatelessWidget {
  const ThemeSelect({super.key, required this.controller});

  final ThemeController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.isLoaded) return const SizedBox.shrink();
    return PopupMenuButton<RuxtThemeChoice>(
      tooltip: 'Select theme',
      initialValue: controller.choice,
      onSelected: (choice) => applyThemeChoice(context, controller, choice),
      itemBuilder: (context) => [
        for (final choice in RuxtThemeChoice.values)
          PopupMenuItem(
            value: choice,
            child: Row(
              children: [
                Icon(
                  choice == controller.choice
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(choice.label),
              ],
            ),
          ),
      ],
      child: Semantics(
        button: true,
        label: 'Select theme',
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.palette_outlined),
              const SizedBox(width: 6),
              Text(controller.choice.label),
            ],
          ),
        ),
      ),
    );
  }
}
