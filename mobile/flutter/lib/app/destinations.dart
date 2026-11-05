import 'package:flutter/material.dart';

/// Navigation destinations, in the governing order used on every
/// platform. Primary destinations sit in the bottom navigation bar
/// (compact) or the navigation rail (wider); secondary destinations
/// are reached from Settings and from the expanded rail.
enum RuxtDestinationId {
  editor,
  sessions,
  templates,
  profiles,
  settings,
  providers,
  cloudData,
  about,
  login,
}

class RuxtDestination {
  const RuxtDestination({
    required this.id,
    required this.label,
    required this.icon,
    required this.path,
  });

  final RuxtDestinationId id;
  final String label;
  final IconData icon;
  final String path;
}

const List<RuxtDestination> primaryDestinations = [
  RuxtDestination(id: RuxtDestinationId.editor, label: 'Editor', icon: Icons.edit_note, path: '/'),
  RuxtDestination(id: RuxtDestinationId.sessions, label: 'Sessions', icon: Icons.folder_open, path: '/d'),
  RuxtDestination(id: RuxtDestinationId.templates, label: 'Templates', icon: Icons.grid_view, path: '/d/templates'),
  RuxtDestination(id: RuxtDestinationId.profiles, label: 'Profiles', icon: Icons.person_outline, path: '/p'),
  RuxtDestination(id: RuxtDestinationId.settings, label: 'Settings', icon: Icons.settings_outlined, path: '/settings'),
];

const List<RuxtDestination> secondaryDestinations = [
  RuxtDestination(id: RuxtDestinationId.providers, label: 'Providers', icon: Icons.extension_outlined, path: '/d/providers'),
  RuxtDestination(id: RuxtDestinationId.cloudData, label: 'Cloud data', icon: Icons.cloud_sync_outlined, path: '/settings/cloud-data'),
  RuxtDestination(id: RuxtDestinationId.about, label: 'About', icon: Icons.info_outline, path: '/about'),
  RuxtDestination(id: RuxtDestinationId.login, label: 'Sign in', icon: Icons.login, path: '/login'),
];

RuxtDestination destinationById(RuxtDestinationId id) {
  for (final d in [...primaryDestinations, ...secondaryDestinations]) {
    if (d.id == id) return d;
  }
  return primaryDestinations.first;
}
