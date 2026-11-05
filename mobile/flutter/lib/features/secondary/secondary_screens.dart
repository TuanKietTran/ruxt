import 'package:flutter/material.dart';

import '../../theme/generated_theme.dart';
import '../../widgets/placeholder_screen.dart';

/// Providers placeholder: one section per provider group, as on the
/// web page. Account required in the full app.
class ProvidersScreen extends StatelessWidget {
  const ProvidersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Providers',
      emptyIcon: Icons.extension_outlined,
      emptyTitle: 'No providers',
      emptyMessage: 'Connected providers will be grouped here.',
      loadingLabel: 'Loading providers',
      errorMessage: 'Providers could not be loaded.',
      contentBuilder: (context) {
        final theme = Theme.of(context);
        return ListView(
          padding: EdgeInsets.all(RuxtTokens.spacingXl),
          children: [
            Text('Providers', style: theme.textTheme.titleMedium),
            SizedBox(height: RuxtTokens.spacingMd),
            Text(
              'One section per provider group, headed by the provider name.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        );
      },
    );
  }
}

/// Cloud data placeholder: consent controls for cloud session
/// recovery and cloud templates. Controls reflect a pending state
/// rather than a guessed default; nothing is fetched in this shell.
class CloudDataScreen extends StatelessWidget {
  const CloudDataScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Cloud data',
      emptyIcon: Icons.cloud_sync_outlined,
      emptyTitle: 'Cloud data is off',
      emptyMessage: 'Your documents stay on this device.',
      loadingLabel: 'Loading consent',
      errorMessage: 'The consent change could not be saved.',
      contentBuilder: (context) {
        final theme = Theme.of(context);
        return ListView(
          padding: EdgeInsets.all(RuxtTokens.spacingXl),
          children: [
            const SwitchListTile(
              value: false,
              onChanged: null,
              title: Text('Cloud session recovery'),
              subtitle: Text('Consent loads from your account in the full app. Turning this off stops cloud recovery of your sessions.'),
            ),
            const SwitchListTile(
              value: false,
              onChanged: null,
              title: Text('Cloud templates'),
              subtitle: Text('Turning this off keeps templates on this device only.'),
            ),
            SizedBox(height: RuxtTokens.spacingLg),
            Text(
              'A failed change shows the server message and returns the control to its previous state.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        );
      },
    );
  }
}

/// About: static content, as on the web page.
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: EdgeInsets.all(RuxtTokens.spacing3xl),
      children: [
        Text('About Ruxt', style: theme.textTheme.headlineLarge),
        SizedBox(height: RuxtTokens.spacingLg),
        Text('Write your CV in Markdown', style: theme.textTheme.titleMedium),
        SizedBox(height: RuxtTokens.spacingXl),
        Text('Local-first', style: theme.textTheme.labelLarge),
        Text('Your documents and profiles stay on this device unless you choose otherwise.', style: theme.textTheme.bodyMedium),
        SizedBox(height: RuxtTokens.spacingLg),
        Text('Optional cloud', style: theme.textTheme.labelLarge),
        Text('Cloud recovery and templates are opt-in from Cloud data settings.', style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

/// Sign-in placeholder: the form shape only. This shell does no
/// networking and holds no credentials.
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: EdgeInsets.all(RuxtTokens.spacing3xl),
      children: [
        Text('Sign in', style: theme.textTheme.headlineLarge),
        SizedBox(height: RuxtTokens.spacingMd),
        Text('Create your account', style: theme.textTheme.bodySmall),
        SizedBox(height: RuxtTokens.spacingXl),
        const TextField(decoration: InputDecoration(labelText: 'Email')),
        SizedBox(height: RuxtTokens.spacingLg),
        const TextField(
          obscureText: true,
          decoration: InputDecoration(labelText: 'Password'),
        ),
        SizedBox(height: RuxtTokens.spacingXl),
        ElevatedButton(
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Sign-in is not wired in this shell.')),
            );
          },
          child: const Text('Sign in'),
        ),
        SizedBox(height: RuxtTokens.spacingLg),
        Text('Return to the editor', style: theme.textTheme.bodySmall),
      ],
    );
  }
}
