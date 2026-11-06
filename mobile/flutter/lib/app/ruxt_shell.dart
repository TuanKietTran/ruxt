import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import '../features/editor/editor_screen.dart';
import '../features/profiles/profiles_screen.dart';
import '../features/secondary/secondary_screens.dart';
import '../features/sessions/sessions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/templates/templates_screen.dart';
import '../theme/theme_controller.dart';
import '../widgets/theme_select.dart';
import 'destinations.dart';

/// App shell: header with the theme control (reachable at every
/// width), bottom navigation on compact widths, a navigation rail
/// from 600dp up (extended on expanded widths), and one current
/// destination at a time, exposed programmatically as well as
/// visually. The app entry feeds OS brightness changes into the
/// theme controller; the shell itself does no networking.
class RuxtShell extends StatefulWidget {
  const RuxtShell({super.key, required this.controller});

  final ThemeController controller;

  @override
  State<RuxtShell> createState() => _RuxtShellState();
}

class _RuxtShellState extends State<RuxtShell> {
  int _primaryIndex = 0;
  RuxtDestination? _secondary;
  final FocusNode _contentFocus = FocusNode(debugLabel: 'main-content');
  bool _skipLinkFocused = false;

  @override
  void dispose() {
    _contentFocus.dispose();
    super.dispose();
  }

  RuxtDestination get _current =>
      _secondary ?? primaryDestinations[_primaryIndex];

  void _announce(RuxtDestination destination) {
    SemanticsService.announce(destination.label, TextDirection.ltr);
  }

  void _selectPrimary(int index) {
    setState(() {
      _primaryIndex = index;
      _secondary = null;
    });
    _announce(primaryDestinations[index]);
  }

  void _openSecondary(RuxtDestination destination) {
    setState(() => _secondary = destination);
    _announce(destination);
  }

  Widget _screenFor(RuxtDestinationId id) {
    switch (id) {
      case RuxtDestinationId.editor:
        return const EditorScreen();
      case RuxtDestinationId.sessions:
        return const SessionsScreen();
      case RuxtDestinationId.templates:
        return const TemplatesScreen();
      case RuxtDestinationId.profiles:
        return const ProfilesScreen();
      case RuxtDestinationId.settings:
        return SettingsScreen(
          controller: widget.controller,
          onOpenSecondary: _openSecondary,
        );
      case RuxtDestinationId.providers:
        return const ProvidersScreen();
      case RuxtDestinationId.cloudData:
        return const CloudDataScreen();
      case RuxtDestinationId.about:
        return const AboutScreen();
      case RuxtDestinationId.login:
        return const LoginScreen();
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 600;
    final current = _current;

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Skip to content: visually hidden until it takes keyboard
        // focus, then it moves focus to the main content region.
        Focus(
          onFocusChange: (focused) =>
              setState(() => _skipLinkFocused = focused),
          child: SizedBox(
            height: _skipLinkFocused ? 48 : 0,
            child: _skipLinkFocused
                ? TextButton(
                    onPressed: () => _contentFocus.requestFocus(),
                    child: const Text('Skip to content'),
                  )
                : const SizedBox.shrink(),
          ),
        ),
        Expanded(
          child: Focus(
            focusNode: _contentFocus,
            child: KeyedSubtree(
              key: ValueKey(current.id),
              child: _screenFor(current.id),
            ),
          ),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(current.label),
        leading: _secondary == null
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: 'Back',
                onPressed: () => setState(() => _secondary = null),
              ),
        actions: [ThemeSelect(controller: widget.controller)],
      ),
      body: wide
          ? Row(
              children: [
                NavigationRail(
                  extended: width >= 1280,
                  labelType: width >= 1280
                      ? NavigationRailLabelType.none
                      : NavigationRailLabelType.selected,
                  destinations: [
                    for (final d in primaryDestinations)
                      NavigationRailDestination(
                        icon: Icon(d.icon),
                        label: Text(d.label),
                      ),
                    for (final d in secondaryDestinations)
                      NavigationRailDestination(
                        icon: Icon(d.icon),
                        label: Text(d.label),
                      ),
                  ],
                  selectedIndex: _secondary == null
                      ? _primaryIndex
                      : primaryDestinations.length +
                          secondaryDestinations.indexOf(_secondary!),
                  onDestinationSelected: (index) {
                    if (index < primaryDestinations.length) {
                      _selectPrimary(index);
                    } else {
                      _openSecondary(secondaryDestinations[
                          index - primaryDestinations.length]);
                    }
                  },
                ),
                const VerticalDivider(width: 1),
                Expanded(child: content),
              ],
            )
          : content,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _primaryIndex,
              onDestinationSelected: _selectPrimary,
              destinations: [
                for (final d in primaryDestinations)
                  NavigationDestination(icon: Icon(d.icon), label: d.label),
              ],
            ),
    );
  }
}
