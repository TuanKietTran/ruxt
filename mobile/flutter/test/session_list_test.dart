import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/data/kv_store.dart';
import 'package:ruxt/data/local_stores.dart';
import 'package:ruxt/features/sessions/sessions_screen.dart';
import 'package:ruxt/widgets/state_views.dart';

Widget app() => const MaterialApp(home: Scaffold(body: SessionsScreen()));

Future<void> tapChip(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(ChoiceChip, label));
  await tester.pump();
}

void main() {
  group('session list data source (local store, not a server mock)', () {
    test('summaries come from LocalCvStore in newest-first order', () async {
      var now = DateTime.utc(2026, 11, 5, 9);
      final store = LocalCvStore(MemoryKeyValueStore(), now: () => now);
      expect(await store.list(), isEmpty);
      await store.create(title: 'Older CV', markdown: '# Older');
      now = now.add(const Duration(days: 1));
      await store.create(title: 'Newer CV', markdown: '# Newer');
      final summaries = await store.list();
      expect(summaries.map((s) => s.title), ['Newer CV', 'Older CV']);
      expect(summaries.every((s) => s.revision == 1), isTrue);
    });
  });

  group('SessionsScreen preview states', () {
    testWidgets('starts in the empty state', (tester) async {
      await tester.pumpWidget(app());
      await tester.pump();
      expect(find.byType(RuxtEmptyState), findsOneWidget);
      expect(find.text('No sessions yet'), findsOneWidget);
      expect(find.text('Documents you create or open will be listed here.'), findsOneWidget);
    });
    testWidgets('content state shows the session list pane', (tester) async {
      await tester.pumpWidget(app());
      await tapChip(tester, 'Content');
      expect(find.text('Your documents are grouped here, with Templates and Providers below them, as on the web dashboard.'), findsOneWidget);
      expect(find.text('No session selected'), findsOneWidget);
    });
    testWidgets('loading state uses the shared loading view', (tester) async {
      await tester.pumpWidget(app());
      await tapChip(tester, 'Loading');
      expect(find.byType(RuxtLoadingState), findsOneWidget);
    });
    testWidgets('error state shows the sessions error message', (tester) async {
      await tester.pumpWidget(app());
      await tapChip(tester, 'Error');
      expect(find.byType(RuxtErrorState), findsOneWidget);
      expect(find.text('Sessions could not be loaded.'), findsOneWidget);
    });
    testWidgets('offline state uses the shared offline view and states can be switched back', (tester) async {
      await tester.pumpWidget(app());
      await tapChip(tester, 'Offline');
      expect(find.byType(RuxtOfflineState), findsOneWidget);
      await tapChip(tester, 'Empty');
      expect(find.byType(RuxtEmptyState), findsOneWidget);
      expect(find.text('No sessions yet'), findsOneWidget);
    });
  });
}
