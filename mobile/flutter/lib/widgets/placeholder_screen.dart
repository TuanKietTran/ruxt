import 'package:flutter/material.dart';

import '../theme/generated_theme.dart';
import 'state_views.dart';

/// States a placeholder screen can preview. The shell ships no data
/// layer, so each screen lets the reader switch between its content
/// layout and the shared empty / loading / error / offline views it
/// will use in the full app.
enum RuxtPreviewState { content, empty, loading, error, offline }

class PlaceholderScreen extends StatefulWidget {
  const PlaceholderScreen({
    super.key,
    required this.title,
    required this.contentBuilder,
    required this.emptyIcon,
    required this.emptyTitle,
    required this.emptyMessage,
    this.loadingLabel = 'Loading',
    this.errorMessage = 'Something went wrong. Try again.',
    this.initialState = RuxtPreviewState.content,
  });

  final String title;
  final WidgetBuilder contentBuilder;
  final IconData emptyIcon;
  final String emptyTitle;
  final String emptyMessage;
  final String loadingLabel;
  final String errorMessage;
  final RuxtPreviewState initialState;

  @override
  State<PlaceholderScreen> createState() => _PlaceholderScreenState();
}

class _PlaceholderScreenState extends State<PlaceholderScreen> {
  late RuxtPreviewState _state = widget.initialState;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: EdgeInsets.symmetric(
            horizontal: RuxtTokens.spacingXl,
            vertical: RuxtTokens.spacingMd,
          ),
          child: Row(
            children: [
              for (final state in RuxtPreviewState.values) ...[
                ChoiceChip(
                  label: Text(state.name[0].toUpperCase() + state.name.substring(1)),
                  selected: _state == state,
                  onSelected: (_) => setState(() => _state = state),
                ),
                SizedBox(width: RuxtTokens.spacingMd),
              ],
            ],
          ),
        ),
        Expanded(child: _body(context)),
      ],
    );
  }

  Widget _body(BuildContext context) {
    switch (_state) {
      case RuxtPreviewState.content:
        return widget.contentBuilder(context);
      case RuxtPreviewState.empty:
        return RuxtEmptyState(
          icon: widget.emptyIcon,
          title: widget.emptyTitle,
          message: widget.emptyMessage,
        );
      case RuxtPreviewState.loading:
        return RuxtLoadingState(label: widget.loadingLabel);
      case RuxtPreviewState.error:
        return RuxtErrorState(
          message: widget.errorMessage,
          onRetry: () => setState(() => _state = RuxtPreviewState.content),
        );
      case RuxtPreviewState.offline:
        return RuxtOfflineState(
          onRetry: () => setState(() => _state = RuxtPreviewState.content),
        );
    }
  }
}
