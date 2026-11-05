import 'package:flutter/material.dart';

import '../../theme/generated_theme.dart';
import '../../widgets/placeholder_screen.dart';
import '../../widgets/state_views.dart';

/// Sessions (Dashboard) placeholder: a document list pane and a
/// detail pane side by side from 600dp up, a single list below that.
/// CV sessions are client-local in the full app; this shell loads
/// nothing.
class SessionsScreen extends StatelessWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Sessions',
      emptyIcon: Icons.folder_open,
      emptyTitle: 'No sessions yet',
      emptyMessage: 'Documents you create or open will be listed here.',
      loadingLabel: 'Loading sessions',
      errorMessage: 'Sessions could not be loaded.',
      initialState: RuxtPreviewState.empty,
      contentBuilder: (context) => LayoutBuilder(
        builder: (context, constraints) {
          final listPane = _listPane(context);
          if (constraints.maxWidth < 600) return listPane;
          return Row(
            children: [
              SizedBox(width: 300, child: listPane),
              const VerticalDivider(width: 1),
              const Expanded(
                child: RuxtEmptyState(
                  icon: Icons.description_outlined,
                  title: 'No session selected',
                  message: 'Select a session to open it in the editor.',
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _listPane(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: EdgeInsets.all(RuxtTokens.spacingXl),
      children: [
        Text('Sessions', style: theme.textTheme.titleMedium),
        SizedBox(height: RuxtTokens.spacingMd),
        Text(
          'Your documents are grouped here, with Templates and Providers below them, as on the web dashboard.',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}
