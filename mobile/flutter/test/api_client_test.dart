import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/data/api_client.dart';
import 'package:ruxt/data/auth.dart';
import 'package:ruxt/data/kv_store.dart';
import 'package:ruxt/data/models.dart';

class RecordedRequest {
  RecordedRequest(this.method, this.uri, this.headers, this.bodyBytes);
  final String method;
  final Uri uri;
  final Map<String, String> headers;
  final List<int>? bodyBytes;
  String get body => utf8.decode(bodyBytes ?? const []);
  Map<String, dynamic> get jsonBody => jsonDecode(body) as Map<String, dynamic>;
}

class FakeTransport implements HttpTransport {
  FakeTransport(this._handler);
  final ApiResponse Function(RecordedRequest request) _handler;
  final List<RecordedRequest> requests = [];
  @override
  Future<ApiResponse> send(String method, Uri uri, {Map<String, String> headers = const {}, List<int>? bodyBytes}) async {
    final request = RecordedRequest(method, uri, headers, bodyBytes);
    requests.add(request);
    return _handler(request);
  }
}

ApiResponse jsonResponse(int status, Object? body, {Map<String, List<String>> headers = const {}}) =>
    ApiResponse(statusCode: status, headers: headers, bodyBytes: utf8.encode(body is String ? body : jsonEncode(body)));

RuxtApiClient clientFor(FakeTransport transport, {KeyValueStore? cookieStore}) =>
    RuxtApiClient(baseUri: Uri.parse('https://example.test/'), transport: transport, cookieStore: cookieStore);

void main() {
  group('request core', () {
    test('health hits /api/health with an accept header and no cookie', () async {
      final transport = FakeTransport((_) => jsonResponse(200, {'status': 'ok', 'ts': 5}));
      final health = await clientFor(transport).health();
      expect(health.status, 'ok');
      final request = transport.requests.single;
      expect(request.method, 'GET');
      expect(request.uri.toString(), 'https://example.test/api/health');
      expect(request.headers['accept'], 'application/json');
      expect(request.headers.containsKey('cookie'), isFalse);
    });
    test('a persisted cookie is loaded and sent on the first request', () async {
      final store = MemoryKeyValueStore();
      await store.write(RuxtApiClient.cookieStorageKey, 'auth_session=seeded');
      final transport = FakeTransport((_) => jsonResponse(200, {'status': 'ok', 'ts': 1}));
      await clientFor(transport, cookieStore: store).health();
      expect(transport.requests.single.headers['cookie'], 'auth_session=seeded');
    });
    test('non-2xx throws ApiException with the server error message', () async {
      final transport = FakeTransport((_) => jsonResponse(500, {'error': 'boom'}));
      await expectLater(clientFor(transport).health(), throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 500).having((e) => e.message, 'message', 'boom')));
    });
    test('an empty error body falls back to the HTTP status', () async {
      final transport = FakeTransport((_) => jsonResponse(503, ''));
      await expectLater(clientFor(transport).health(), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'HTTP 503')));
    });
  });

  group('cookie session', () {
    test('login posts only email and password, captures and persists auth_session', () async {
      final store = MemoryKeyValueStore();
      final transport = FakeTransport((request) {
        if (request.uri.path == '/api/auth/login') {
          return jsonResponse(200, {'userId': 'u-1'}, headers: {'set-cookie': ['auth_session=abc123; Path=/; HttpOnly']});
        }
        return jsonResponse(200, {'id': 'u-1', 'email': 'a@b.c'});
      });
      final client = clientFor(transport, cookieStore: store);
      expect(await client.login('a@b.c', 'secret'), 'u-1');
      final loginRequest = transport.requests.first;
      expect(loginRequest.headers['content-type'], 'application/json');
      expect(loginRequest.jsonBody, {'email': 'a@b.c', 'password': 'secret'});
      expect(await store.read(RuxtApiClient.cookieStorageKey), 'auth_session=abc123');
      final me = await client.me();
      expect(me.effectiveId, 'u-1');
      expect(transport.requests.last.headers['cookie'], 'auth_session=abc123');
    });
    test('unrelated set-cookie headers are ignored', () async {
      final store = MemoryKeyValueStore();
      final transport = FakeTransport((_) => jsonResponse(200, {'userId': 'u'}, headers: {'set-cookie': ['theme=dark; Path=/']}));
      await clientFor(transport, cookieStore: store).register('a@b.c', 'pw');
      expect(await store.read(RuxtApiClient.cookieStorageKey), isNull);
    });
    test('an empty auth_session set-cookie clears the persisted session', () async {
      final store = MemoryKeyValueStore();
      await store.write(RuxtApiClient.cookieStorageKey, 'auth_session=old');
      final transport = FakeTransport((_) => jsonResponse(200, {'status': 'ok', 'ts': 1}, headers: {'set-cookie': ['auth_session=; Path=/; Max-Age=0']}));
      await clientFor(transport, cookieStore: store).health();
      expect(await store.read(RuxtApiClient.cookieStorageKey), isNull);
    });
    test('logout posts to the API and clears the local session', () async {
      final store = MemoryKeyValueStore();
      await store.write(RuxtApiClient.cookieStorageKey, 'auth_session=old');
      final transport = FakeTransport((_) => jsonResponse(200, {}));
      await clientFor(transport, cookieStore: store).logout();
      expect(transport.requests.single.uri.path, '/api/auth/logout');
      expect(await store.read(RuxtApiClient.cookieStorageKey), isNull);
    });
  });

  group('401 handling', () {
    test('401 throws ApiUnauthorizedException with the server message', () async {
      final transport = FakeTransport((_) => jsonResponse(401, {'error': 'session expired'}));
      await expectLater(clientFor(transport).me(), throwsA(isA<ApiUnauthorizedException>().having((e) => e.statusCode, 'statusCode', 401).having((e) => e.message, 'message', 'session expired')));
    });
    test('LegacyCookieAuthService.currentUser maps 401 to null', () async {
      final transport = FakeTransport((_) => jsonResponse(401, {'message': 'nope'}));
      final auth = LegacyCookieAuthService(clientFor(transport));
      expect(await auth.currentUser(), isNull);
    });
  });

  group('account endpoints', () {
    test('putPreferences wraps the payload in the preferences envelope', () async {
      final transport = FakeTransport((_) => jsonResponse(200, {}));
      await clientFor(transport).putPreferences(UserPreferences.fromJson({'profileSaveMode': 'manual'}));
      final request = transport.requests.single;
      expect(request.method, 'PUT');
      expect(request.uri.path, '/api/preferences');
      expect(request.jsonBody, {'preferences': {'profileSaveMode': 'manual'}});
    });
    test('putConsent sends the category wire name and granted flag', () async {
      final transport = FakeTransport((_) => jsonResponse(200, {}));
      await clientFor(transport).putConsent(ConsentCategory.cloudSessions, true);
      expect(transport.requests.single.jsonBody, {'category': 'cloudSessions', 'granted': true});
    });
    test('template catalogs parse both the templates and items envelopes', () async {
      final transport = FakeTransport((request) => request.uri.path == '/api/public/templates'
          ? jsonResponse(200, {'templates': [{'id': 'a', 'version': 1}]})
          : jsonResponse(200, {'items': [{'id': 'b', 'version': 3}]}));
      final client = clientFor(transport);
      expect((await client.publicTemplates()).single.id, 'a');
      expect((await client.templateCatalog()).single.version, 3);
    });
    test('capabilities and raw artifact bytes pass through', () async {
      final transport = FakeTransport((request) => request.uri.path == '/api/cv-capabilities'
          ? jsonResponse(200, {'available': true, 'formats': ['md']})
          : ApiResponse(statusCode: 200, bodyBytes: const [1, 2, 3]));
      final client = clientFor(transport);
      expect((await client.capabilities()).available, isTrue);
      expect(await client.artifactBytes('art 1'), [1, 2, 3]);
      expect(transport.requests.last.uri.path, '/api/cv-artifacts/art%201');
    });
  });

  group('cv imports', () {
    test('createImport sends multipart with fields and the idempotency key', () async {
      final transport = FakeTransport((_) => jsonResponse(202, {'id': 'job-1', 'status': 'processing'}));
      final job = await clientFor(transport).createImport(fileBytes: utf8.encode('# CV'), filename: 'cv.md', templateId: 'tpl-1', templateVersion: 2, idempotencyKey: 'key-9');
      expect(job.id, 'job-1');
      final request = transport.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.path, '/api/cv-imports');
      expect(request.headers['content-type'], startsWith('multipart/form-data; boundary='));
      expect(request.headers['idempotency-key'], 'key-9');
      expect(request.body, contains('name="templateId"'));
      expect(request.body, contains('tpl-1'));
      expect(request.body, contains('filename="cv.md"'));
      expect(request.body, contains('# CV'));
    });
    test('pollImport polls until terminal without real delays', () async {
      final statuses = ['processing', 'processing', 'completed'];
      var calls = 0;
      final transport = FakeTransport((_) => jsonResponse(200, {'id': 'job-1', 'status': statuses[calls++]}));
      final job = await clientFor(transport).pollImport('job-1', interval: Duration.zero, delay: (_) async {});
      expect(job.isComplete, isTrue);
      expect(calls, 3);
    });
    test('pollImport stops at maxAttempts and returns the last job', () async {
      final transport = FakeTransport((_) => jsonResponse(200, {'id': 'job-1', 'status': 'processing'}));
      final job = await clientFor(transport).pollImport('job-1', maxAttempts: 4, delay: (_) async {});
      expect(job.isTerminal, isFalse);
      expect(transport.requests, hasLength(4));
    });
  });

  group('security guard', () {
    test('no lib source calls the legacy plans, subscriptions or iam routes or uses Bearer auth', () {
      final bannedRoute = RegExp(r'/api/(plans|subscriptions|iam)');
      final libDir = Directory('lib');
      expect(libDir.existsSync(), isTrue);
      for (final entity in libDir.listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        final source = entity.readAsStringSync();
        expect(bannedRoute.hasMatch(source), isFalse, reason: entity.path);
        expect(source.contains('Bearer'), isFalse, reason: entity.path);
      }
    });
    test('credential requests never carry a caller-chosen userId', () async {
      final transport = FakeTransport((_) => jsonResponse(200, {'userId': 'server-id'}));
      final client = clientFor(transport);
      await client.login('a@b.c', 'pw');
      await client.register('a@b.c', 'pw');
      for (final request in transport.requests) {
        expect(request.jsonBody.containsKey('userId'), isFalse);
        expect(request.headers.containsKey('x-user-id'), isFalse);
      }
    });
  });
}
