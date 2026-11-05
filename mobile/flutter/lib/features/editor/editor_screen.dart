import 'package:flutter/material.dart';

import '../../theme/generated_theme.dart';
import '../../theme/theme_selection.dart';
import '../../widgets/placeholder_screen.dart';

/// Editor placeholder: source editor and live preview panes, split
/// per window class. Compact shows one pane at a time; medium shows
/// editor + preview; expanded adds nothing here (the shell adds the
/// sidebar). No document storage is wired in this shell.
class EditorScreen extends StatefulWidget {
  const EditorScreen({super.key});

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  final TextEditingController _controller = TextEditingController(
    text: '# Your name\n\nWrite your CV in Markdown.',
  );
  bool _showPreview = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(
      title: 'Editor',
      emptyIcon: Icons.description_outlined,
      emptyTitle: 'No document open',
      emptyMessage: 'Open a session or start a new document to begin editing.',
      loadingLabel: 'Loading document',
      errorMessage: 'The document could not be loaded.',
      contentBuilder: (context) => LayoutBuilder(
        builder: (context, constraints) {
          final windowClass = windowClassForWidth(constraints.maxWidth);
          final editor = _editorPane();
          final preview = _previewPane();
          if (windowClass == RuxtWindowClass.compact) {
            return Column(
              children: [
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('Source')),
                    ButtonSegment(value: true, label: Text('Preview')),
                  ],
                  selected: {_showPreview},
                  onSelectionChanged: (s) => setState(() => _showPreview = s.first),
                ),
                SizedBox(height: RuxtTokens.spacingMd),
                Expanded(child: _showPreview ? preview : editor),
              ],
            );
          }
          return Row(
            children: [
              Expanded(child: editor),
              const VerticalDivider(width: 1),
              Expanded(child: preview),
            ],
          );
        },
      ),
    );
  }

  Widget _editorPane() {
    return Padding(
      padding: EdgeInsets.all(RuxtTokens.spacingXl),
      child: TextField(
        controller: _controller,
        expands: true,
        maxLines: null,
        textAlignVertical: TextAlignVertical.top,
        style: const TextStyle(fontFamily: 'monospace'),
        decoration: const InputDecoration(
          hintText: 'Write your CV in Markdown',
          alignLabelWithHint: true,
        ),
        onChanged: (_) => setState(() {}),
      ),
    );
  }

  Widget _previewPane() {
    final theme = Theme.of(context);
    final lines = _controller.text.split('\n');
    return Padding(
      padding: EdgeInsets.all(RuxtTokens.spacingXl),
      child: ListView(
        children: [
          Text('Preview', style: theme.textTheme.labelLarge),
          SizedBox(height: RuxtTokens.spacingLg),
          for (final line in lines)
            if (line.startsWith('# '))
              Text(line.substring(2), style: theme.textTheme.headlineLarge)
            else if (line.isEmpty)
              SizedBox(height: RuxtTokens.spacingMd)
            else
              Text(line, style: theme.textTheme.bodyMedium),
          SizedBox(height: RuxtTokens.spacingLg),
          Text(
            'Placeholder rendering; the full app renders the formatted document.',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
