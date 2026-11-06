import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/app/ruxt_shell.dart';
import 'package:ruxt/theme/ruxt_theme_data.dart';
import 'package:ruxt/theme/theme_controller.dart';
import 'package:ruxt/theme/theme_preferences.dart';

Future<ThemeController> loadedController() async {
  final controller =
      ThemeController(ThemePreferences(MemoryThemePreferencesStore()));
  await controller.load();
  return controller;
}

Widget appFor(ThemeController controller) {
  return MaterialApp(
    theme: buildRuxtThemeData(
      palette: controller.palette,
      density: controller.density,
    ),
    home: RuxtShell(controller: controller),
  );
}

void main() {
  testWidgets('compact width shows bottom navigation with the primary destinations',
      (tester) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(400, 900);
    addTearDown(tester.view.reset);
    final controller = await loadedController();
    await tester.pumpWidget(appFor(controller));
    await tester.pump();

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    for (final label in ['Editor', 'Sessions', 'Templates', 'Profiles', 'Settings']) {
      expect(
        find.descendant(of: find.byType(NavigationBar), matching: find.text(label)),
        findsOneWidget,
      );
    }
    // Editor is the initial destination.
    expect(find.byType(TextField), findsOneWidget);
  });

  testWidgets('tapping a destination switches the current screen', (tester) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(400, 900);
    addTearDown(tester.view.reset);
    final controller = await loadedController();
    await tester.pumpWidget(appFor(controller));
    await tester.pump();

    await tester.tap(find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text('Templates'),
    ));
    await tester.pump();
    expect(find.text('Classic'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('wide width shows a navigation rail instead of bottom navigation',
      (tester) async {
    tester.view.devicePixelRatio = 1.0;
    tester.view.physicalSize = const Size(1200, 900);
    addTearDown(tester.view.reset);
    final controller = await loadedController();
    await tester.pumpWidget(appFor(controller));
    await tester.pump();

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });
}
