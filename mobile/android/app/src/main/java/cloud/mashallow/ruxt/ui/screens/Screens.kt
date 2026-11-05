package cloud.mashallow.ruxt.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import cloud.mashallow.ruxt.data.AppPrefs
import cloud.mashallow.ruxt.data.DensityNames
import cloud.mashallow.ruxt.data.PreferencesRepository
import cloud.mashallow.ruxt.data.SaveModeNames
import cloud.mashallow.ruxt.theme.ThemeNames
import cloud.mashallow.ruxt.ui.components.EmptyState
import cloud.mashallow.ruxt.ui.components.LoadingState
import cloud.mashallow.ruxt.ui.components.OfflineState
import cloud.mashallow.ruxt.ui.components.PlannedBadge
import cloud.mashallow.ruxt.ui.EditorViewModel
import cloud.mashallow.ruxt.ui.ProfilesViewModel
import cloud.mashallow.ruxt.ui.SessionsViewModel
import cloud.mashallow.ruxt.ui.TemplatesViewModel
import kotlinx.coroutines.launch

@Composable
private fun Modifier.screen(): Modifier = this.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)

@Composable
fun SessionsScreen(onOpenEditor: () -> Unit = {}) {
    val vm = remember { SessionsViewModel() }
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.refresh() }
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Sessions", style = MaterialTheme.typography.headlineMedium)
        Text("CV sessions are local to this device in this shell. No server session list is called.", style = MaterialTheme.typography.bodyMedium)
        when {
            state.isLoading -> LoadingState("Loading sessions")
            state.error != null -> { Text(state.error ?: "Unknown error", style = MaterialTheme.typography.bodyMedium); Button(onClick = { vm.refresh() }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry") } }
            state.sessions.isNotEmpty() -> state.sessions.forEach { s -> OutlinedButton(onClick = onOpenEditor, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text(if (s.updatedAt.isBlank()) s.title else "${s.title} - ${s.updatedAt}") } }
            else -> EmptyState("No sessions yet", "Start a session locally; it stays on this device until a later phase adds sync.")
        }
        Button(onClick = onOpenEditor, modifier = Modifier.heightIn(min = 48.dp)) { Text("Open editor placeholder") }
    }
}

@Composable
fun EditorScreen() {
    val vm = remember { EditorViewModel() }
    val state by vm.state.collectAsState()
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Editor", style = MaterialTheme.typography.headlineMedium)
        Text("Contexts: cv and profiles only. The editor internals are not reimplemented in this shell.", style = MaterialTheme.typography.bodyMedium)
        when {
            state.isLoading -> LoadingState("Loading document")
            state.error != null -> Text(state.error ?: "Unknown error", style = MaterialTheme.typography.bodyMedium)
            state.sessionId == null && state.markdown.isBlank() -> EmptyState("No document open", "Open a session (s=) or a template (t=), not both.")
            else -> { if (state.title.isNotBlank()) Text(state.title, style = MaterialTheme.typography.titleMedium); Text(state.markdown, style = MaterialTheme.typography.bodyMedium) }
        }
        Button(onClick = { vm.save() }, enabled = !state.isSaving, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (state.isSaving) "Saving" else "Save") }
    }
}

@Composable
fun TemplatesScreen() {
    val vm = remember { TemplatesViewModel() }
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.refresh() }
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Templates", style = MaterialTheme.typography.headlineMedium)
        when {
            state.isLoading -> LoadingState("Loading templates")
            state.error != null -> { Text(state.error ?: "Unknown error", style = MaterialTheme.typography.bodyMedium); Button(onClick = { vm.refresh() }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry") } }
            state.templates.isNotEmpty() -> state.templates.forEach { t -> Text(t.name, style = MaterialTheme.typography.titleMedium); if (t.description.isNotBlank()) Text(t.description, style = MaterialTheme.typography.bodyMedium) }
            else -> EmptyState("No templates loaded", "Templates are local in this shell; cloud template behaviour follows the templates consent in Settings.")
        }
        OfflineState()
    }
}

@Composable
fun ProfilesScreen() {
    val vm = remember { ProfilesViewModel() }
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.refresh() }
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Profiles", style = MaterialTheme.typography.headlineMedium)
        Text("Profiles are local to this device in this shell.", style = MaterialTheme.typography.bodyMedium)
        when {
            state.isLoading -> LoadingState("Loading profiles")
            state.error != null -> { Text(state.error ?: "Unknown error", style = MaterialTheme.typography.bodyMedium); Button(onClick = { vm.refresh() }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry") } }
            state.profiles.isNotEmpty() -> state.profiles.forEach { p -> Text(p.name, style = MaterialTheme.typography.titleMedium); if (p.headline.isNotBlank()) Text(p.headline, style = MaterialTheme.typography.bodyMedium) }
            else -> EmptyState("No profiles yet", "Create a profile locally; save mode (auto/manual) is set in Settings.")
        }
    }
}

@Composable
fun ProvidersScreen() {
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Providers", style = MaterialTheme.typography.headlineMedium)
        PlannedBadge()
        EmptyState("No providers connected", "Provider connection is a placeholder in this shell; no network call is made.")
    }
}

@Composable
fun DashboardScreen(onOpen: (String) -> Unit = {}) {
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Dashboard", style = MaterialTheme.typography.headlineMedium)
        EmptyState("Nothing to show yet", "Dashboard summaries appear here in a later phase.")
        OutlinedButton(onClick = { onOpen("plans") }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text("Plans - Planned") }
        OutlinedButton(onClick = { onOpen("billing") }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text("Billing - Planned") }
        OutlinedButton(onClick = { onOpen("iam") }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text("Account & IAM - Planned") }
    }
}

@Composable
fun AboutScreen() {
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("About", style = MaterialTheme.typography.headlineMedium)
        Text("Ruxt Android shell. Kotlin / Jetpack Compose, Material 3, design tokens from design/tokens.json.", style = MaterialTheme.typography.bodyMedium)
        EmptyState("Shell only", "No real API, auth or editor logic is included in this phase.")
    }
}

@Composable
fun LoginScreen() {
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Sign in", style = MaterialTheme.typography.headlineMedium)
        Text("Login gate placeholder. Dual auth is supported by the contract in a later phase; no sign-in is performed here.", style = MaterialTheme.typography.bodyMedium)
        EmptyState("Not signed in", "Continue offline with local sessions, CVs, profiles and templates.")
        Button(onClick = {}, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Sign in, planned" }) { Text("Sign in - Planned") }
    }
}

@Composable
fun PlannedScreen(title: String) {
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        PlannedBadge()
        EmptyState("$title is planned", "This area is a Planned-only placeholder with no functionality in this shell.")
    }
}

@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val repo = remember { PreferencesRepository(context.applicationContext) }
    val prefs by repo.prefs.collectAsState(initial = AppPrefs())
    val scope = rememberCoroutineScope()
    Column(Modifier.screen(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Text("Theme", style = MaterialTheme.typography.titleMedium)
        ThemeNames.forEach { name ->
            OutlinedButton(onClick = { scope.launch { repo.setTheme(name) } }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text(if (prefs.theme == name) "$name (current)" else name) }
        }
        Text("Density", style = MaterialTheme.typography.titleMedium)
        DensityNames.forEach { name ->
            OutlinedButton(onClick = { scope.launch { repo.setDensity(name) } }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text(if (prefs.density == name) "$name (current)" else name) }
        }
        Text("Profile save mode", style = MaterialTheme.typography.titleMedium)
        SaveModeNames.forEach { name ->
            OutlinedButton(onClick = { scope.launch { repo.setSaveMode(name) } }, modifier = Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text(if (prefs.saveMode == name) "$name (current)" else name) }
        }
        Text("Cloud consents", style = MaterialTheme.typography.titleMedium)
        Text("Session recovery")
        Switch(checked = prefs.sessionRecoveryConsent, onCheckedChange = { v -> scope.launch { repo.setSessionRecoveryConsent(v) } }, modifier = Modifier.semantics { contentDescription = "Session recovery consent" })
        Text("Templates")
        Switch(checked = prefs.templatesConsent, onCheckedChange = { v -> scope.launch { repo.setTemplatesConsent(v) } }, modifier = Modifier.semantics { contentDescription = "Templates consent" })
    }
}
