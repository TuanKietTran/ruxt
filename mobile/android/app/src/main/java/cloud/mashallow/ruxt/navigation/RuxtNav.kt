package cloud.mashallow.ruxt.navigation

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import cloud.mashallow.ruxt.ui.screens.AboutScreen
import cloud.mashallow.ruxt.ui.screens.DashboardScreen
import cloud.mashallow.ruxt.ui.screens.EditorScreen
import cloud.mashallow.ruxt.ui.screens.LoginScreen
import cloud.mashallow.ruxt.ui.screens.PlannedScreen
import cloud.mashallow.ruxt.ui.screens.ProfilesScreen
import cloud.mashallow.ruxt.ui.screens.ProvidersScreen
import cloud.mashallow.ruxt.ui.screens.SessionsScreen
import cloud.mashallow.ruxt.ui.screens.SettingsScreen
import cloud.mashallow.ruxt.ui.screens.TemplatesScreen

data class Dest(val route: String, val label: String)

val TopDests = listOf(Dest("sessions", "Sessions"), Dest("templates", "Templates"), Dest("profiles", "Profiles"), Dest("more", "More"))
val AllDests = listOf(Dest("sessions", "Sessions"), Dest("templates", "Templates"), Dest("profiles", "Profiles"), Dest("providers", "Providers"), Dest("dashboard", "Dashboard"), Dest("settings", "Settings"), Dest("about", "About"), Dest("login", "Login"))
private val MoreRoutes = listOf("more", "providers", "dashboard", "settings", "about", "login", "plans", "billing", "iam")

@Composable
fun RuxtShell() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination?.route
    fun go(route: String) { nav.navigate(route) { popUpTo(nav.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true } }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val expanded = maxWidth >= 600.dp
        if (expanded) {
            Row(Modifier.fillMaxSize()) {
                NavigationRail {
                    AllDests.forEach { d -> NavigationRailItem(selected = current == d.route, onClick = { go(d.route) }, icon = { Text(d.label.take(1)) }, label = { Text(d.label) }, modifier = Modifier.heightIn(min = 48.dp)) }
                }
                NavHost(navController = nav, startDestination = "sessions", Modifier.weight(1f)) { ruxtGraph(go = { go(it) }, onOpenEditor = { nav.navigate("editor") }) }
            }
        } else {
            Scaffold(bottomBar = { NavigationBar { TopDests.forEach { d -> NavigationBarItem(selected = current == d.route || (d.route == "more" && current in MoreRoutes), onClick = { go(d.route) }, icon = { Text(d.label.take(1)) }, label = { Text(d.label) }) } } }) { padding ->
                NavHost(navController = nav, startDestination = "sessions", Modifier.padding(padding)) { ruxtGraph(go = { go(it) }, onOpenEditor = { nav.navigate("editor") }) }
            }
        }
    }
}

private fun androidx.navigation.NavGraphBuilder.ruxtGraph(go: (String) -> Unit, onOpenEditor: () -> Unit) {
    composable("sessions") { SessionsScreen(onOpenEditor = onOpenEditor) }
    composable("editor") { EditorScreen() }
    composable("templates") { TemplatesScreen() }
    composable("profiles") { ProfilesScreen() }
    composable("providers") { ProvidersScreen() }
    composable("dashboard") { DashboardScreen(onOpen = go) }
    composable("settings") { SettingsScreen() }
    composable("about") { AboutScreen() }
    composable("login") { LoginScreen() }
    composable("more") { MoreScreen(onOpen = go) }
    composable("plans") { PlannedScreen("Plans") }
    composable("billing") { PlannedScreen("Billing") }
    composable("iam") { PlannedScreen("Account & IAM") }
}

@Composable
fun MoreScreen(onOpen: (String) -> Unit) {
    Column(Modifier.padding(16.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
        Text("More", style = MaterialTheme.typography.headlineMedium)
        listOf("providers" to "Providers", "dashboard" to "Dashboard", "settings" to "Settings", "about" to "About", "login" to "Login", "plans" to "Plans - Planned", "billing" to "Billing - Planned", "iam" to "Account & IAM - Planned").forEach { (route, label) -> Button(onClick = { onOpen(route) }, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) } }
    }
}
