package cloud.mashallow.ruxt.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import cloud.mashallow.ruxt.theme.normalizeThemeName
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class AppPrefs(
    val theme: String = "mocha",
    val density: String = "comfortable",
    val saveMode: String = "manual",
    val sessionRecoveryConsent: Boolean = false,
    val templatesConsent: Boolean = false
)

val DensityNames = listOf("comfortable", "compact")
val SaveModeNames = listOf("auto", "manual")

fun normalizeDensity(value: String?): String = if (value in DensityNames) value!! else "comfortable"
fun normalizeSaveMode(value: String?): String = if (value in SaveModeNames) value!! else "manual"

private val Context.dataStore by preferencesDataStore(name = "ruxt_prefs")

class PreferencesRepository(private val context: Context) {
    private object Keys {
        val theme = stringPreferencesKey("theme")
        val density = stringPreferencesKey("density")
        val saveMode = stringPreferencesKey("save_mode")
        val sessionRecovery = booleanPreferencesKey("consent_session_recovery")
        val templates = booleanPreferencesKey("consent_templates")
    }
    val prefs: Flow<AppPrefs> = context.dataStore.data.map { p ->
        AppPrefs(
            theme = normalizeThemeName(p[Keys.theme]),
            density = normalizeDensity(p[Keys.density]),
            saveMode = normalizeSaveMode(p[Keys.saveMode]),
            sessionRecoveryConsent = p[Keys.sessionRecovery] ?: false,
            templatesConsent = p[Keys.templates] ?: false
        )
    }
    suspend fun setTheme(value: String) { context.dataStore.edit { it[Keys.theme] = normalizeThemeName(value) } }
    suspend fun setDensity(value: String) { context.dataStore.edit { it[Keys.density] = normalizeDensity(value) } }
    suspend fun setSaveMode(value: String) { context.dataStore.edit { it[Keys.saveMode] = normalizeSaveMode(value) } }
    suspend fun setSessionRecoveryConsent(value: Boolean) { context.dataStore.edit { it[Keys.sessionRecovery] = value } }
    suspend fun setTemplatesConsent(value: Boolean) { context.dataStore.edit { it[Keys.templates] = value } }
}
