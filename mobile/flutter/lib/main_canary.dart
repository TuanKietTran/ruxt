import 'app/app_config.dart';
import 'app/bootstrap.dart';

/// Canary flavor entry point:
/// `flutter run --flavor canary -t lib/main_canary.dart`
Future<void> main() => bootstrap(AppConfig.canary);
