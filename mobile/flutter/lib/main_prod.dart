import 'app/app_config.dart';
import 'app/bootstrap.dart';

/// Prod flavor entry point:
/// `flutter run --flavor prod -t lib/main_prod.dart`
Future<void> main() => bootstrap(AppConfig.prod);
