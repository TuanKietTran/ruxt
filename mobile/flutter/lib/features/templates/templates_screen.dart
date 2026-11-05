import 'package:flutter/material.dart';

import '../../theme/generated_theme.dart';
import '../../widgets/placeholder_screen.dart';

/// Templates placeholder: a card gallery. In the full app the public
/// catalog is read from the server and private templates are
/// client-local; this shell renders neither.
class TemplatesScreen extends StatelessWidget {
  const TemplatesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Templates',
      emptyIcon: Icons.grid_view,
      emptyTitle: 'No templates',
      emptyMessage: 'Templates will appear here when the catalog is available.',
      loadingLabel: 'Loading templates',
      errorMessage: 'Templates could not be loaded.',
      contentBuilder: (context) {
        final theme = Theme.of(context);
        return GridView.count(
          crossAxisCount: 2,
          padding: EdgeInsets.all(RuxtTokens.spacingXl),
          mainAxisSpacing: RuxtTokens.spacingLg,
          crossAxisSpacing: RuxtTokens.spacingLg,
          children: [
            for (final name in ['Classic', 'Modern', 'Compact'])
              Card(
                child: Padding(
                  padding: EdgeInsets.all(RuxtTokens.spacingXl),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.description_outlined, color: theme.colorScheme.primary),
                      SizedBox(height: RuxtTokens.spacingLg),
                      Text(name, style: theme.textTheme.titleMedium),
                      SizedBox(height: RuxtTokens.spacingMd),
                      Text('Template preview placeholder.', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
