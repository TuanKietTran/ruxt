import 'app/app_config.dart';
import 'app/bootstrap.dart';

/// Default entry point: prod flavor unless overridden with
/// `--dart-define=FLAVOR=canary` (or an `API_BASE_URL` override).
/// Prefer the explicit `main_prod.dart` / `main_canary.dart`
/// entry points together with the matching native `--flavor`.
Future<void> main() => bootstrap(AppConfig.fromEnvironment());
