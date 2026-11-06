/// Flavor configuration for the Ruxt app.
///
/// Two flavors ship from this tree (briefs/mob-dart.md):
/// - prod:   bundle/application id `cloud.mashallow.ruxt`,
///   display name `Ruxt`, API `https://ruxt.mashallow.cloud`
/// - canary: bundle/application id `cloud.mashallow.ruxt.canary`,
///   display name `Ruxt Canary`, API
///   `https://ruxt-canary.mashallow.cloud`
///
/// The hosts are the build convention from the brief; no API host
/// is referenced anywhere else in the repo, so they live only here
/// and in the native flavor files (Android productFlavors, iOS
/// xcconfigs). Select a flavor with a dedicated entry point
/// (`main_prod.dart` / `main_canary.dart`, i.e.
/// `flutter run -t lib/main_canary.dart --flavor canary`) or with
/// `--dart-define=FLAVOR=canary`; `API_BASE_URL` may be overridden
/// with `--dart-define=API_BASE_URL=...` for local development.
enum AppFlavor { prod, canary }

class AppConfig {
  const AppConfig({
    required this.flavor,
    required this.appName,
    required this.bundleId,
    required this.apiBaseUrl,
  });

  final AppFlavor flavor;
  final String appName;
  final String bundleId;
  final String apiBaseUrl;

  bool get isCanary => flavor == AppFlavor.canary;
  bool get isProd => flavor == AppFlavor.prod;

  Uri get apiBaseUri => Uri.parse(apiBaseUrl);

  static const AppConfig prod = AppConfig(
    flavor: AppFlavor.prod,
    appName: 'Ruxt',
    bundleId: 'cloud.mashallow.ruxt',
    apiBaseUrl: 'https://ruxt.mashallow.cloud',
  );

  static const AppConfig canary = AppConfig(
    flavor: AppFlavor.canary,
    appName: 'Ruxt Canary',
    bundleId: 'cloud.mashallow.ruxt.canary',
    apiBaseUrl: 'https://ruxt-canary.mashallow.cloud',
  );

  static AppConfig forFlavor(AppFlavor flavor) =>
      flavor == AppFlavor.canary ? canary : prod;

  /// Resolves the config from compile-time environment values.
  /// Defaults to prod so a plain `flutter run` matches the shell
  /// behaviour that predates flavors.
  factory AppConfig.fromEnvironment() {
    const flavorName = String.fromEnvironment('FLAVOR', defaultValue: 'prod');
    const apiOverride = String.fromEnvironment('API_BASE_URL');
    final base =
        forFlavor(flavorName == 'canary' ? AppFlavor.canary : AppFlavor.prod);
    if (apiOverride.isEmpty) return base;
    return AppConfig(
      flavor: base.flavor,
      appName: base.appName,
      bundleId: base.bundleId,
      apiBaseUrl: apiOverride,
    );
  }

  AppConfig copyWith({String? apiBaseUrl}) => AppConfig(
        flavor: flavor,
        appName: appName,
        bundleId: bundleId,
        apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      );

  @override
  bool operator ==(Object other) =>
      other is AppConfig &&
      other.flavor == flavor &&
      other.appName == appName &&
      other.bundleId == bundleId &&
      other.apiBaseUrl == apiBaseUrl;

  @override
  int get hashCode => Object.hash(flavor, appName, bundleId, apiBaseUrl);
}
