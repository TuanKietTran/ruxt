import 'package:flutter/material.dart';

import '../../theme/generated_theme.dart';
import '../../widgets/placeholder_screen.dart';

/// Profiles placeholder: the profile sections of the web editor, each
/// with its Add action. Profiles are client-local in the full app;
/// this shell stores nothing.
class ProfilesScreen extends StatelessWidget {
  const ProfilesScreen({super.key});

  static const List<String> sections = [
    'Identity',
    'About',
    'Contact',
    'Experience',
    'Skills',
    'Education',
    'Projects',
    'Certifications',
  ];

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Profiles',
      emptyIcon: Icons.person_outline,
      emptyTitle: 'No profile yet',
      emptyMessage: 'Create a profile to reuse your details across documents.',
      loadingLabel: 'Loading profiles',
      errorMessage: 'Profiles could not be loaded.',
      contentBuilder: (context) => ListView(
        padding: EdgeInsets.all(RuxtTokens.spacingXl),
        children: [
          for (final section in sections)
            ListTile(
              title: Text(section),
              trailing: TextButton.icon(
                onPressed: null,
                icon: const Icon(Icons.add),
                label: Text('Add $section'),
              ),
            ),
        ],
      ),
    );
  }
}
