import 'package:flutter/material.dart';

import '../theme/generated_theme.dart';

/// Reusable empty / loading / error / offline views. Every data view
/// in the shell uses these instead of per-screen copies.
///
/// Loading always carries a text label inside a live region, never a
/// bare spinner; under reduced motion the spinner is replaced by a
/// static placeholder.
class RuxtEmptyState extends StatelessWidget {
  const RuxtEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.all(RuxtTokens.spacing3xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: RuxtTokens.spacing5xl, color: theme.colorScheme.onSurfaceVariant),
            SizedBox(height: RuxtTokens.spacingLg),
            Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
            SizedBox(height: RuxtTokens.spacingMd),
            Text(message, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
            if (actionLabel != null) ...[
              SizedBox(height: RuxtTokens.spacingXl),
              ElevatedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class RuxtLoadingState extends StatelessWidget {
  const RuxtLoadingState({super.key, this.label = 'Loading'});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      container: true,
      liveRegion: true,
      label: label,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (reducedMotion)
              Container(
                width: RuxtTokens.spacing6xl,
                height: RuxtTokens.spacingMd,
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(RuxtTokens.radiusFull),
                ),
              )
            else
              const CircularProgressIndicator(),
            SizedBox(height: RuxtTokens.spacingLg),
            Text(label, style: theme.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}

class RuxtErrorState extends StatelessWidget {
  const RuxtErrorState({
    super.key,
    required this.message,
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.all(RuxtTokens.spacing3xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: RuxtTokens.spacing5xl, color: theme.colorScheme.error),
            SizedBox(height: RuxtTokens.spacingLg),
            Text(message, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              SizedBox(height: RuxtTokens.spacingXl),
              ElevatedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

class RuxtOfflineState extends StatelessWidget {
  const RuxtOfflineState({super.key, this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return RuxtErrorState(
      message: 'You are offline. Changes stay on this device until you reconnect.',
      onRetry: onRetry,
    );
  }
}
