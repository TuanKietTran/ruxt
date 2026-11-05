import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;
import 'dart:typed_data';

import 'kv_store.dart';
import 'models.dart';

/// HTTP layer for the Ruxt API. Shapes follow notes/mobile-contract.md
/// and notes/ruxt-mobile.openapi.yaml. Auth is the legacy sealed
/// `auth_session` cookie (7 days, no bearer token, no refresh): the
/// cookie set by login/register is captured, persisted in the local
/// key/value store and sent on later requests; a 401 means the user
/// must sign in again. This client never calls the legacy plans,
/// subscriptions or iam routes, and never calls the disabled
/// cv-import commit, template clone or template save routes - those
/// results are produced in the local stores instead.

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message, {this.body});

  final int statusCode;
  final String message;
  final String? body;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// 401 from the API: the session is gone, re-login is required.
class ApiUnauthorizedException extends ApiException {
  const ApiUnauthorizedException([String message = 'unauthorized'])
      : super(401, message);
}

class ApiResponse {
  const ApiResponse({
    required this.statusCode,
    this.headers = const {},
    required this.bodyBytes,
  });

  final int statusCode;
  final Map<String, List<String>> headers;
  final List<int> bodyBytes;

  String get body => utf8.decode(bodyBytes, allowMalformed: true);
}

/// Raw HTTP seam so tests can fake the network.
abstract interface class HttpTransport {
  Future<ApiResponse> send(
    String method,
    Uri uri, {
    Map<String, String> headers = const {},
    List<int>? bodyBytes,
  });
}

/// Transport backed by dart:io. Cookie handling is manual (see
/// [RuxtApiClient]); HttpClient's own cookie jar is not used.
class IoHttpTransport implements HttpTransport {
  IoHttpTransport([io.HttpClient? client])
      : _client = client ?? io.HttpClient();

  final io.HttpClient _client;

  @override
  Future<ApiResponse> send(
    String method,
    Uri uri, {
    Map<String, String> headers = const {},
    List<int>? bodyBytes,
  }) async {
    final request = await _client.openUrl(method, uri);
    headers.forEach(request.headers.set);
    if (bodyBytes != null) {
      request.contentLength = bodyBytes.length;
      request.add(bodyBytes);
    }
    final response = await request.close();
    final bytes = await response.fold<List<int>>(
      <int>[],
      (acc, chunk) => acc..addAll(chunk),
    );
    final out = <String, List<String>>{};
    response.headers.forEach((name, values) => out[name] = values);
    return ApiResponse(
      statusCode: response.statusCode,
      headers: out,
      bodyBytes: bytes,
    );
  }
}

Map<String, dynamic> _mapOf(Object? value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : {};

class RuxtApiClient {
  RuxtApiClient({
    required this.baseUri,
    required HttpTransport transport,
    KeyValueStore? cookieStore,
  })  : _transport = transport,
        _cookieStore = cookieStore;

  /// Scheme + host root, e.g. https://ruxt.mashallow.cloud.
  final Uri baseUri;
  final HttpTransport _transport;
  final KeyValueStore? _cookieStore;

  static const String cookieStorageKey = 'ruxt:auth-session-cookie';

  String? _cookie;
  bool _cookieLoaded = false;

  Future<String?> _loadCookie() async {
    if (!_cookieLoaded) {
      _cookie = await _cookieStore?.read(cookieStorageKey);
      _cookieLoaded = true;
    }
    return _cookie;
  }

  Future<void> _captureCookies(ApiResponse response) async {
    final setCookies = response.headers['set-cookie'];
    if (setCookies == null) return;
    for (final header in setCookies) {
      final pair = header.split(';').first.trim();
      if (!pair.startsWith('auth_session=')) continue;
      final value = pair.substring('auth_session='.length);
      if (value.isEmpty) {
        _cookie = null;
        await _cookieStore?.remove(cookieStorageKey);
      } else {
        _cookie = pair;
        await _cookieStore?.write(cookieStorageKey, pair);
      }
    }
  }

  /// Drops the locally held session cookie (logout).
  Future<void> clearSession() async {
    _cookie = null;
    _cookieLoaded = true;
    await _cookieStore?.remove(cookieStorageKey);
  }

  Uri _uri(String path) {
    final root = baseUri.toString().replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$root$path');
  }

  String _errorMessage(ApiResponse response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) {
        final message = decoded['error'] ?? decoded['message'];
        if (message != null) return message.toString();
      }
    } catch (_) {
      // fall through to the raw body
    }
    final body = response.body.trim();
    return body.isEmpty ? 'HTTP ${response.statusCode}' : body;
  }

  Future<ApiResponse> _request(
    String method,
    String path, {
    Object? jsonBody,
    List<int>? rawBody,
    String? contentType,
    Map<String, String> extraHeaders = const {},
  }) async {
    final headers = <String, String>{
      'accept': 'application/json',
      ...extraHeaders,
    };
    List<int>? bodyBytes = rawBody;
    if (jsonBody != null) {
      headers['content-type'] = 'application/json';
      bodyBytes = utf8.encode(jsonEncode(jsonBody));
    } else if (contentType != null) {
      headers['content-type'] = contentType;
    }
    final cookie = await _loadCookie();
    if (cookie != null && cookie.isNotEmpty) headers['cookie'] = cookie;
    final response = await _transport.send(
      method,
      _uri(path),
      headers: headers,
      bodyBytes: bodyBytes,
    );
    await _captureCookies(response);
    if (response.statusCode == 401) {
      throw ApiUnauthorizedException(_errorMessage(response));
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.statusCode,
        _errorMessage(response),
        body: response.body,
      );
    }
    return response;
  }

  Future<Map<String, dynamic>> _json(
    String method,
    String path, {
    Object? jsonBody,
  }) async {
    final response = await _request(method, path, jsonBody: jsonBody);
    if (response.body.trim().isEmpty) return {};
    final decoded = jsonDecode(response.body);
    if (decoded is Map) return _mapOf(decoded);
    if (decoded is List) return {'items': decoded};
    return {};
  }

  // --- health / auth -------------------------------------------------

  Future<HealthStatus> health() async =>
      HealthStatus.fromJson(await _json('GET', '/api/health'));

  /// Current principal; tolerates both the Clerk {id, email} shape
  /// and the legacy raw user record ({userId, ...}).
  Future<AuthUser> me() async =>
      AuthUser.fromJson(await _json('GET', '/api/auth/me'));

  /// Logs in with the legacy cookie flow; returns the user id.
  Future<String?> login(String email, String password) async {
    final json = await _json('POST', '/api/auth/login',
        jsonBody: {'email': email, 'password': password});
    return json['userId'] as String?;
  }

  /// Registers with the legacy cookie flow; returns the user id.
  Future<String?> register(String email, String password) async {
    final json = await _json('POST', '/api/auth/register',
        jsonBody: {'email': email, 'password': password});
    return json['userId'] as String?;
  }

  Future<void> logout() async {
    try {
      await _request('POST', '/api/auth/logout');
    } finally {
      await clearSession();
    }
  }

  // --- preferences / consent ----------------------------------------

  Future<UserPreferences> getPreferences() async =>
      UserPreferences.fromJson(await _json('GET', '/api/preferences'));

  /// The preferences object is passed through verbatim, wrapped in
  /// the {preferences: ...} envelope the route expects.
  Future<Map<String, dynamic>> putPreferences(
          UserPreferences preferences) =>
      _json('PUT', '/api/preferences',
          jsonBody: {'preferences': preferences.toJson()});

  Future<CloudDataConsent> getConsent() async => CloudDataConsent.fromJson(
      await _json('GET', '/api/cloud-data/consent'));

  Future<Map<String, dynamic>> putConsent(
          ConsentCategory category, bool granted) =>
      _json('PUT', '/api/cloud-data/consent',
          jsonBody: {'category': category.wireName, 'granted': granted});

  // --- templates ------------------------------------------------------

  List<CvTemplate> _templateList(Map<String, dynamic> json) {
    final raw = json['templates'] ?? json['items'];
    if (raw is! List) return const [];
    return raw.map((e) => CvTemplate.fromJson(_mapOf(e))).toList();
  }

  /// Public catalog; the only unauthenticated catalog route.
  Future<List<CvTemplate>> publicTemplates() async =>
      _templateList(await _json('GET', '/api/public/templates'));

  /// Authenticated catalog; the server filters to public only.
  Future<List<CvTemplate>> templateCatalog() async =>
      _templateList(await _json('GET', '/api/cv-templates'));

  // --- capabilities / applications / artifacts -----------------------

  Future<CvCapabilities> capabilities() async =>
      CvCapabilities.fromJson(await _json('GET', '/api/cv-capabilities'));

  /// One tracked job application (owner-scoped passthrough).
  Future<Map<String, dynamic>> getApplication(String id) =>
      _json('GET', '/api/cv-applications/${Uri.encodeComponent(id)}');

  /// Raw artifact bytes; the kind segment in [id] selects the
  /// content type server-side. There is no pdf kind.
  Future<List<int>> artifactBytes(String id) async {
    final response =
        await _request('GET', '/api/cv-artifacts/${Uri.encodeComponent(id)}');
    return response.bodyBytes;
  }

  // --- CV imports ------------------------------------------------------

  /// Creates an import job (multipart: file + optional templateId /
  /// templateVersion). Returns the 202 job; poll with [getImport] or
  /// [pollImport]. The imported document is committed into the local
  /// CV store by the caller - the server commit route is disabled.
  Future<CvImportJob> createImport({
    required List<int> fileBytes,
    required String filename,
    String? templateId,
    int? templateVersion,
    String? idempotencyKey,
  }) async {
    final boundary =
        '----ruxt-${DateTime.now().microsecondsSinceEpoch.toRadixString(16)}';
    const crlf = '\r\n';
    final builder = BytesBuilder();
    void field(String name, String value) {
      builder.add(utf8.encode(
          '--$boundary$crlf' 'Content-Disposition: form-data; name="$name"$crlf$crlf' '$value$crlf'));
    }

    if (templateId != null) field('templateId', templateId);
    if (templateVersion != null) {
      field('templateVersion', templateVersion.toString());
    }
    builder.add(utf8.encode('--$boundary$crlf'
        'Content-Disposition: form-data; name="file"; filename="$filename"$crlf'
        'Content-Type: application/octet-stream$crlf$crlf'));
    builder.add(fileBytes);
    builder.add(utf8.encode('$crlf--$boundary--$crlf'));
    final response = await _request(
      'POST',
      '/api/cv-imports',
      rawBody: builder.takeBytes(),
      contentType: 'multipart/form-data; boundary=$boundary',
      extraHeaders: {
        if (idempotencyKey != null) 'idempotency-key': idempotencyKey,
      },
    );
    return CvImportJob.fromJson(_mapOf(jsonDecode(response.body)));
  }

  Future<CvImportJob> getImport(String id) async => CvImportJob.fromJson(
      await _json('GET', '/api/cv-imports/${Uri.encodeComponent(id)}'));

  /// Preview payload for a finished import; the client creates the
  /// local CV document from this.
  Future<Map<String, dynamic>> importPreview(String id) =>
      _json('GET', '/api/cv-imports/${Uri.encodeComponent(id)}/preview');

  Future<Map<String, dynamic>> cancelImport(String id) =>
      _json('POST', '/api/cv-imports/${Uri.encodeComponent(id)}/cancel');

  Future<Map<String, dynamic>> retryImport(String id) =>
      _json('POST', '/api/cv-imports/${Uri.encodeComponent(id)}/retry');

  /// Polls [getImport] until the job is terminal or [maxAttempts] is
  /// exhausted; the last seen job is returned either way.
  Future<CvImportJob> pollImport(
    String id, {
    Duration interval = const Duration(seconds: 2),
    int maxAttempts = 30,
    Future<void> Function(Duration)? delay,
  }) async {
    final wait = delay ?? Future.delayed;
    var job = await getImport(id);
    var attempts = 1;
    while (!job.isTerminal && attempts < maxAttempts) {
      await wait(interval);
      job = await getImport(id);
      attempts++;
    }
    return job;
  }
}
