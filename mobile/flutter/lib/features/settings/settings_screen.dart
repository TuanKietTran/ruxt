import 'package:flutter/material.dart';

import '../../app/destinations.dart';
import '../../theme/generated_theme.dart';
import '../../theme/theme_controller.dart';
import '../../theme/theme_selection.dart';
import '../../widgets/theme_select.dart';

/// Settings: the working theme and density controls (both
/// device-local, applied immediately), plus entries to the secondary
/// destinations. The profile save-mode preference belongs to the
/// account preferences record and is not part of this shell.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    super.key,
    required this.controller,
    required this.onOpenSecondary,
  });

  final ThemeController controller;
  final ValueChanged<RuxtDestination> onOpenSecondary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: EdgeInsets.all(RuxtTokens.spacingXl),
      children: [
        Text('Theme', style: theme.textTheme.titleMedium),
        for (final choice in RuxtThemeChoice.values)
          RadioListTile<RuxtThemeChoice>(
            value: choice,
            groupValue: controller.choice,
            onChanged: (value) {
              if (value != null) applyThemeChoice(context, controller, value);
            },
            title: Text(choice.label),
            subtitle: choice == RuxtThemeChoice.system
                ? const Text('Follow the OS setting: light uses Latte, dark uses Mocha.')
                : null,
          ),
        SizedBox(height: RuxtTokens.spacingXl),
        Text('Density', style: theme.textTheme.titleMedium),
        for (final density in RuxtDensity.values)
          RadioListTile<RuxtDensity>(
            value: density,
            groupValue: controller.density,
            onChanged: (value) {
              if (value != null) controller.setDensity(value);
            },
            title: Text(density.label),
          ),
        SizedBox(height: RuxtTokens.spacingXl),
        Text('More', style: theme.textTheme.titleMedium),
        for (final destination in secondaryDestinations)
          ListTile(
            leading: Icon(destination.icon),
            title: Text(destination.label),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => onOpenSecondary(destination),
          ),
      ],
    );
  }
}
