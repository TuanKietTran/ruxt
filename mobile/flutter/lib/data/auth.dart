import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';

/// Auth seam. The working implementation is the legacy cookie flow;
/// Clerk is a flagged stub behind the same interface because its
/// native presentation is an open question in the contract - no
/// Clerk UI or token flow is invented here. Identity is always
/// server-derived from the session; no caller-chosen user id is
/// ever sent as authority.
abstract interface class AuthService {
  /// Current principal, or null when signed out (401).
  Future<AuthUser?> currentUser();

  Future<String?> signIn(String email, String password);

  Future<String?> register(String email, String password);

  Future<void> signOut();
}

/// Legacy email/password auth against /api/auth/*, carried by the
/// `auth_session` cookie managed by [RuxtApiClient].
class LegacyCookieAuthService implements AuthService {
  LegacyCookieAuthService(this._api);

  final RuxtApiClient _api;

  @override
  Future<AuthUser?> currentUser() async {
    try {
      return await _api.me();
    } on ApiUnauthorizedException {
      return null;
    }
  }

  @override
  Future<String?> signIn(String email, String password) =>
      _api.login(email, password);

  @override
  Future<String?> register(String email, String password) =>
      _api.register(email, password);

  @override
  Future<void> signOut() => _api.logout();
}

class ClerkUnavailableException implements Exception {
  const ClerkUnavailableException([
    this.message =
        'Clerk sign-in is not available in this build yet; use email and password.',
  ]);

  final String message;

  @override
  String toString() => 'ClerkUnavailableException: $message';
}

/// Stub for the Clerk flow: present so the UI can offer the entry
/// point and surface 'unavailable', but it performs no network or
/// token work until the native presentation is decided.
class ClerkAuthService implements AuthService {
  const ClerkAuthService();

  static const bool isAvailable = false;

  @override
  Future<AuthUser?> currentUser() async => null;

  @override
  Future<String?> signIn(String email, String password) async =>
      throw const ClerkUnavailableException();

  @override
  Future<String?> register(String email, String password) async =>
      throw const ClerkUnavailableException();

  @override
  Future<void> signOut() async {}
}

enum AuthStatus { unknown, signedOut, signedIn }

/// Observable auth state for the app shell and screens.
class AuthController extends ChangeNotifier {
  AuthController(this._auth);

  final AuthService _auth;

  AuthStatus status = AuthStatus.unknown;
  AuthUser? user;
  Object? error;

  bool get isSignedIn => status == AuthStatus.signedIn;

  Future<void> refresh() async {
    error = null;
    try {
      user = await _auth.currentUser();
      status = user == null ? AuthStatus.signedOut : AuthStatus.signedIn;
    } catch (e) {
      error = e;
      user = null;
      status = AuthStatus.signedOut;
    }
    notifyListeners();
  }

  Future<void> _afterCredential(Future<String?> action) async {
    error = null;
    try {
      final userId = await action;
      user = await _auth.currentUser() ??
          (userId == null ? null : AuthUser(id: userId, userId: userId));
      status = user == null ? AuthStatus.signedOut : AuthStatus.signedIn;
    } catch (e) {
      error = e;
      user = null;
      status = AuthStatus.signedOut;
    }
    notifyListeners();
  }

  Future<void> signIn(String email, String password) =>
      _afterCredential(_auth.signIn(email, password));

  Future<void> register(String email, String password) =>
      _afterCredential(_auth.register(email, password));

  Future<void> signOut() async {
    try {
      await _auth.signOut();
    } catch (e) {
      error = e;
    }
    user = null;
    status = AuthStatus.signedOut;
    notifyListeners();
  }
}
