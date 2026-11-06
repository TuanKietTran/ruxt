package cloud.mashallow.ruxt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import cloud.mashallow.ruxt.data.AppPrefs
import cloud.mashallow.ruxt.data.PreferencesRepository
import cloud.mashallow.ruxt.navigation.RuxtShell
import cloud.mashallow.ruxt.theme.RuxtTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val context = LocalContext.current
            val repo = remember { PreferencesRepository(context.applicationContext) }
            val prefs by repo.prefs.collectAsState(initial = AppPrefs())
            RuxtTheme(themeName = prefs.theme) { RuxtShell() }
        }
    }
}
