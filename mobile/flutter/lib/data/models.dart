/// Model types for the Ruxt API and the local stores. Shapes follow
/// notes/mobile-contract.md and notes/ruxt-mobile.openapi.yaml;
/// passthrough fields the client does not interpret are preserved in
/// `raw` maps so unknown server fields never break decoding.

/// First `# heading` in [markdown], with a trailing `{...}` attribute
/// suffix stripped. Mirrors `cvTitleFromMarkdown` in the web app.
String? cvTitleFromMarkdown(String markdown) {
  for (final line in markdown.split('\n')) {
    final match = RegExp(r'^#\s+(.+)$').firstMatch(line.trim());
    if (match != null) {
      var title = match.group(1)!.trim();
      final brace = title.lastIndexOf('{');
      if (brace > 0 && title.endsWith('}')) {
        title = title.substring(0, brace).trim();
      }
      return title.isEmpty ? null : title;
    }
  }
  return null;
}

Map<String, dynamic> _asMap(Object? value) =>
    value is Map ? value.map((k, v) => MapEntry(k.toString(), v)) : {};

/// A CV document. Client-local only: no server route stores CV
/// documents, so this type is never sent to or received from the API.
class CvDocument {
  const CvDocument({
    required this.id,
    required this.title,
    required this.markdown,
    required this.css,
    required this.revision,
    required this.updatedAt,
  });

  final String id;
  final String? title;
  final String markdown;
  final String css;
  final int revision;
  final DateTime updatedAt;

  CvDocumentSummary get summary => CvDocumentSummary(
        id: id,
        title: title,
        revision: revision,
        updatedAt: updatedAt,
      );
}

class CvDocumentSummary {
  const CvDocumentSummary({
    required this.id,
    required this.title,
    required this.revision,
    required this.updatedAt,
  });

  final String id;
  final String? title;
  final int revision;
  final DateTime updatedAt;
}

/// Auth principal. Two server shapes exist and both are tolerated:
/// Clerk returns `{id, email}` (id is the owner id `clerk:<userId>`);
/// the legacy flow returns the raw user record, which carries
/// `userId`. Identity is always server-derived from the session.
class AuthUser {
  const AuthUser({this.id, this.email, this.userId});

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String?,
        email: json['email'] as String?,
        userId: json['userId'] as String?,
      );

  final String? id;
  final String? email;
  final String? userId;

  String? get effectiveId => id ?? userId;
}

class CvTemplateCapabilities {
  const CvTemplateCapabilities({
    this.pageFormats = const [],
    this.supportsPhoto = false,
    this.atsFriendly = false,
  });

  factory CvTemplateCapabilities.fromJson(Map<String, dynamic> json) =>
      CvTemplateCapabilities(
        pageFormats: (json['pageFormats'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
        supportsPhoto: json['supportsPhoto'] == true,
        atsFriendly: json['atsFriendly'] == true,
      );

  final List<String> pageFormats;
  final bool supportsPhoto;
  final bool atsFriendly;
}

/// A CV template. The server catalog (`GET /api/public/templates`)
/// is read-only and public-only; private templates live in the local
/// template store with the same shape.
class CvTemplate {
  const CvTemplate({
    required this.id,
    required this.version,
    this.name,
    this.markdownSkeleton,
    this.css,
    this.capabilities = const CvTemplateCapabilities(),
    this.builtIn = false,
    this.tags = const [],
    this.createdAt,
    this.raw = const {},
  });

  factory CvTemplate.fromJson(Map<String, dynamic> json) => CvTemplate(
        id: json['id']?.toString() ?? '',
        version: (json['version'] as num?)?.toInt() ?? 1,
        name: json['name'] as String?,
        markdownSkeleton: json['markdownSkeleton'] as String?,
        css: json['css'] as String?,
        capabilities: CvTemplateCapabilities.fromJson(
            _asMap(json['capabilities'])),
        builtIn: json['builtIn'] == true,
        tags: (json['tags'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
        createdAt: json['createdAt'] as String?,
        raw: json,
      );

  final String id;
  final int version;
  final String? name;
  final String? markdownSkeleton;
  final String? css;
  final CvTemplateCapabilities capabilities;
  final bool builtIn;
  final List<String> tags;
  final String? createdAt;
  final Map<String, dynamic> raw;

  bool get isPublic => tags.contains('public') && !tags.contains('internal');

  Map<String, dynamic> toJson() => {
        ...raw,
        'id': id,
        'version': version,
        if (name != null) 'name': name,
        if (markdownSkeleton != null) 'markdownSkeleton': markdownSkeleton,
        if (css != null) 'css': css,
        'builtIn': builtIn,
        'tags': tags,
        if (createdAt != null) 'createdAt': createdAt,
      };
}

/// A standalone local profile. Profiles are client-local only and
/// are never scanned or uploaded by cloud sync.
class CvProfile {
  const CvProfile({
    required this.id,
    this.name,
    this.headline,
    this.updatedAt,
    this.raw = const {},
  });

  factory CvProfile.fromJson(Map<String, dynamic> json) => CvProfile(
        id: json['id']?.toString() ?? '',
        name: json['name'] as String?,
        headline: json['headline'] as String?,
        updatedAt: json['updatedAt'] as String?,
        raw: json,
      );

  final String id;
  final String? name;
  final String? headline;
  final String? updatedAt;
  final Map<String, dynamic> raw;

  Map<String, dynamic> toJson() => {
        ...raw,
        'id': id,
        if (name != null) 'name': name,
        if (headline != null) 'headline': headline,
        if (updatedAt != null) 'updatedAt': updatedAt,
      };
}

enum ProfileSaveMode {
  auto,
  manual;

  static ProfileSaveMode fromWire(Object? value) =>
      value == 'manual' ? ProfileSaveMode.manual : ProfileSaveMode.auto;

  String get wireName => name;
}

/// Account/local preferences record. Unknown keys are preserved;
/// only `profileSaveMode` is interpreted today (default auto,
/// matching the web app's normalisation).
class UserPreferences {
  const UserPreferences({this.raw = const {}});

  factory UserPreferences.fromJson(Map<String, dynamic> json) =>
      UserPreferences(raw: json);

  final Map<String, dynamic> raw;

  ProfileSaveMode get profileSaveMode =>
      ProfileSaveMode.fromWire(raw['profileSaveMode']);

  UserPreferences withPatch(Map<String, dynamic> patch) =>
      UserPreferences(raw: {...raw, ...patch});

  Map<String, dynamic> toJson() => {...raw};
}

enum ConsentCategory {
  cloudSessions,
  cloudTemplates;

  String get wireName => name;

  static ConsentCategory? fromWire(Object? value) {
    for (final c in ConsentCategory.values) {
      if (c.wireName == value) return c;
    }
    return null;
  }
}

class ConsentState {
  const ConsentState({this.granted = false, this.changedAt});

  factory ConsentState.fromJson(Object? value) {
    if (value is bool) return ConsentState(granted: value);
    final map = _asMap(value);
    return ConsentState(
      granted: map['granted'] == true,
      changedAt: map['changedAt'] as String?,
    );
  }

  final bool granted;
  final String? changedAt;
}

/// Cloud-data consent view. Consent is per-category and
/// default-deny: a missing category means not granted.
class CloudDataConsent {
  const CloudDataConsent({this.policyVersion, this.states = const {}});

  factory CloudDataConsent.fromJson(Map<String, dynamic> json) {
    final states = <ConsentCategory, ConsentState>{};
    for (final category in ConsentCategory.values) {
      if (json.containsKey(category.wireName)) {
        states[category] = ConsentState.fromJson(json[category.wireName]);
      }
    }
    return CloudDataConsent(
      policyVersion: json['policyVersion'] as String?,
      states: states,
    );
  }

  final String? policyVersion;
  final Map<ConsentCategory, ConsentState> states;

  ConsentState stateFor(ConsentCategory category) =>
      states[category] ?? const ConsentState();

  bool grantedFor(ConsentCategory category) => stateFor(category).granted;
}

class CvCapabilities {
  const CvCapabilities({
    required this.available,
    this.degradedReason,
    this.maxUploadBytes = 0,
    this.formats = const [],
  });

  factory CvCapabilities.fromJson(Map<String, dynamic> json) =>
      CvCapabilities(
        available: json['available'] == true,
        degradedReason: json['degradedReason'] as String?,
        maxUploadBytes: (json['maxUploadBytes'] as num?)?.toInt() ?? 0,
        formats: (json['formats'] as List? ?? const [])
            .map((e) => e.toString())
            .toList(),
      );

  final bool available;
  final String? degradedReason;
  final int maxUploadBytes;
  final List<String> formats;
}

class HealthStatus {
  const HealthStatus({required this.status, required this.ts});

  factory HealthStatus.fromJson(Map<String, dynamic> json) => HealthStatus(
        status: json['status']?.toString() ?? '',
        ts: (json['ts'] as num?)?.toInt() ?? 0,
      );

  final String status;
  final int ts;
}

/// A CV import job (create + poll). The full payload is passthrough;
/// the fields below are the ones the client acts on.
class CvImportJob {
  const CvImportJob({required this.id, this.status, this.stage, this.raw = const {}});

  factory CvImportJob.fromJson(Map<String, dynamic> json) => CvImportJob(
        id: json['id']?.toString() ?? '',
        status: (json['status'] ?? json['state']) as String?,
        stage: json['stage'] as String?,
        raw: json,
      );

  final String id;
  final String? status;
  final String? stage;
  final Map<String, dynamic> raw;

  bool get isComplete =>
      status == 'completed' || status == 'complete' || status == 'succeeded';

  bool get isFailed =>
      status == 'failed' || status == 'error' || status == 'cancelled';

  bool get isTerminal => isComplete || isFailed;

  /// Imported document source, when the finished job carries it
  /// inline. The client commits this into its own local store; the
  /// server-side commit route is disabled by design.
  String? get resultMarkdown {
    final doc = _asMap(raw['document']);
    return (raw['markdown'] ?? doc['markdown']) as String?;
  }

  String? get resultCss {
    final doc = _asMap(raw['document']);
    return (raw['css'] ?? doc['css']) as String?;
  }

  String? get resultTitle {
    final doc = _asMap(raw['document']);
    return (raw['title'] ?? doc['title']) as String?;
  }
}
