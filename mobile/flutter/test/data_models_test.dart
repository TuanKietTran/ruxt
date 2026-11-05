import 'package:flutter_test/flutter_test.dart';
import 'package:ruxt/app/app_config.dart';
import 'package:ruxt/data/models.dart';

void main() {
  group('cvTitleFromMarkdown', () {
    test('takes the first level-1 heading and strips a trailing attribute block', () {
      expect(cvTitleFromMarkdown('intro\n# Jane Doe {.header}\nbody'), 'Jane Doe');
      expect(cvTitleFromMarkdown('# Plain Title'), 'Plain Title');
    });
    test('returns null without a level-1 heading', () {
      expect(cvTitleFromMarkdown('no heading\n## Sub heading'), isNull);
      expect(cvTitleFromMarkdown(''), isNull);
    });
  });

  group('CvDocument', () {
    test('summary carries id, title, revision and updatedAt', () {
      final at = DateTime.utc(2026, 11, 5, 9, 30);
      final doc = CvDocument(id: 'doc-1', title: 'CV', markdown: '# CV', css: '', revision: 3, updatedAt: at);
      final summary = doc.summary;
      expect(summary.id, 'doc-1');
      expect(summary.title, 'CV');
      expect(summary.revision, 3);
      expect(summary.updatedAt, at);
    });
  });

  group('AuthUser', () {
    test('tolerates the Clerk shape and the legacy shape', () {
      final clerk = AuthUser.fromJson({'id': 'user_1', 'email': 'a@b.c'});
      expect(clerk.effectiveId, 'user_1');
      expect(clerk.email, 'a@b.c');
      final legacy = AuthUser.fromJson({'userId': 'legacy-9'});
      expect(legacy.effectiveId, 'legacy-9');
      expect(legacy.id, isNull);
    });
  });

  group('CvTemplate', () {
    test('maps the catalog shape, coercing id and version', () {
      final template = CvTemplate.fromJson({
        'id': 42,
        'version': 2.0,
        'name': 'Modern',
        'markdownSkeleton': '# Name',
        'css': 'body {}',
        'capabilities': {'pageFormats': ['a4'], 'supportsPhoto': true, 'atsFriendly': false},
        'builtIn': true,
        'tags': ['public'],
        'unknownField': 'kept',
      });
      expect(template.id, '42');
      expect(template.version, 2);
      expect(template.name, 'Modern');
      expect(template.capabilities.pageFormats, ['a4']);
      expect(template.capabilities.supportsPhoto, isTrue);
      expect(template.capabilities.atsFriendly, isFalse);
      expect(template.builtIn, isTrue);
      expect(template.isPublic, isTrue);
      expect(template.raw['unknownField'], 'kept');
    });
    test('defaults version to 1 and treats internal templates as not public', () {
      final template = CvTemplate.fromJson({'id': 't1', 'tags': ['public', 'internal']});
      expect(template.version, 1);
      expect(template.isPublic, isFalse);
      expect(template.capabilities.pageFormats, isEmpty);
    });
  });

  group('CvProfile', () {
    test('fromJson/toJson round-trips and preserves unknown fields', () {
      final profile = CvProfile.fromJson({'id': 'p1', 'name': 'Jane', 'headline': 'Engineer', 'updatedAt': '2026-11-05', 'extra': 7});
      expect(profile.name, 'Jane');
      final json = profile.toJson();
      expect(json['id'], 'p1');
      expect(json['headline'], 'Engineer');
      expect(json['extra'], 7);
    });
  });

  group('preferences and consent', () {
    test('profileSaveMode defaults to auto, manual is explicit', () {
      expect(const UserPreferences().profileSaveMode, ProfileSaveMode.auto);
      expect(UserPreferences.fromJson({'profileSaveMode': 'manual'}).profileSaveMode, ProfileSaveMode.manual);
      expect(UserPreferences.fromJson({'profileSaveMode': 'weird'}).profileSaveMode, ProfileSaveMode.auto);
    });
    test('preferences pass unknown keys through and withPatch merges', () {
      final prefs = UserPreferences.fromJson({'theme': 'dark', 'profileSaveMode': 'auto'});
      final patched = prefs.withPatch({'profileSaveMode': 'manual'});
      expect(patched.toJson(), {'theme': 'dark', 'profileSaveMode': 'manual'});
      expect(prefs.profileSaveMode, ProfileSaveMode.auto);
    });
    test('consent is per-category and default-deny', () {
      final consent = CloudDataConsent.fromJson({
        'policyVersion': 'v3',
        'cloudSessions': true,
        'cloudTemplates': {'granted': false, 'changedAt': '2026-11-01'},
      });
      expect(consent.policyVersion, 'v3');
      expect(consent.grantedFor(ConsentCategory.cloudSessions), isTrue);
      expect(consent.grantedFor(ConsentCategory.cloudTemplates), isFalse);
      expect(consent.stateFor(ConsentCategory.cloudTemplates).changedAt, '2026-11-01');
      expect(const CloudDataConsent().grantedFor(ConsentCategory.cloudSessions), isFalse);
    });
    test('consent category wire names round-trip, unknown is null', () {
      expect(ConsentCategory.cloudSessions.wireName, 'cloudSessions');
      expect(ConsentCategory.fromWire('cloudTemplates'), ConsentCategory.cloudTemplates);
      expect(ConsentCategory.fromWire('nope'), isNull);
    });
  });

  group('capabilities, health and import jobs', () {
    test('capabilities and health map with defaults', () {
      final caps = CvCapabilities.fromJson({'available': true, 'maxUploadBytes': 2048.0, 'formats': ['md', 7]});
      expect(caps.available, isTrue);
      expect(caps.maxUploadBytes, 2048);
      expect(caps.formats, ['md', '7']);
      expect(CvCapabilities.fromJson({}).available, isFalse);
      final health = HealthStatus.fromJson({'status': 'ok', 'ts': 123.0});
      expect(health.status, 'ok');
      expect(health.ts, 123);
    });
    test('import job accepts status or state and classifies terminal states', () {
      expect(CvImportJob.fromJson({'id': 'j1', 'state': 'processing'}).isTerminal, isFalse);
      for (final done in ['completed', 'complete', 'succeeded']) {
        expect(CvImportJob.fromJson({'id': 'j', 'status': done}).isComplete, isTrue);
      }
      for (final failed in ['failed', 'error', 'cancelled']) {
        expect(CvImportJob.fromJson({'id': 'j', 'status': failed}).isFailed, isTrue);
      }
    });
    test('import result falls back to the nested document fields', () {
      final job = CvImportJob.fromJson({'id': 'j', 'status': 'completed', 'document': {'markdown': '# Hi', 'css': 'x{}', 'title': 'Hi'}});
      expect(job.resultMarkdown, '# Hi');
      expect(job.resultCss, 'x{}');
      expect(job.resultTitle, 'Hi');
      final flat = CvImportJob.fromJson({'id': 'j', 'markdown': '# Flat'});
      expect(flat.resultMarkdown, '# Flat');
    });
  });

  group('AppConfig', () {
    test('prod and canary constants match the flavor contract', () {
      expect(AppConfig.prod.appName, 'Ruxt');
      expect(AppConfig.prod.bundleId, 'cloud.mashallow.ruxt');
      expect(AppConfig.prod.apiBaseUrl, 'https://ruxt.mashallow.cloud');
      expect(AppConfig.prod.isProd, isTrue);
      expect(AppConfig.canary.appName, 'Ruxt Canary');
      expect(AppConfig.canary.bundleId, 'cloud.mashallow.ruxt.canary');
      expect(AppConfig.canary.apiBaseUrl, 'https://ruxt-canary.mashallow.cloud');
      expect(AppConfig.canary.isCanary, isTrue);
      expect(AppConfig.canary.apiBaseUri.host, 'ruxt-canary.mashallow.cloud');
    });
    test('forFlavor, fromEnvironment default and copyWith', () {
      expect(AppConfig.forFlavor(AppFlavor.canary), AppConfig.canary);
      expect(AppConfig.forFlavor(AppFlavor.prod), AppConfig.prod);
      expect(AppConfig.fromEnvironment(), AppConfig.prod);
      final local = AppConfig.prod.copyWith(apiBaseUrl: 'http://localhost:3000');
      expect(local.apiBaseUrl, 'http://localhost:3000');
      expect(local.bundleId, AppConfig.prod.bundleId);
      expect(local, isNot(AppConfig.prod));
      expect(AppConfig.prod.copyWith(), AppConfig.prod);
    });
  });
}
