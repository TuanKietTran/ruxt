package cloud.mashallow.ruxt.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// UI state models — local-first, backed by the data layer in a later wiring pass.

data class SessionSummary(val id: String, val title: String, val updatedAt: String = "")

data class SessionsUiState(
    val isLoading: Boolean = false,
    val sessions: List<SessionSummary> = emptyList(),
    val error: String? = null
) { val isEmpty: Boolean get() = !isLoading && error == null && sessions.isEmpty() }

class SessionsViewModel : ViewModel() {
    private val _state = MutableStateFlow(SessionsUiState())
    val state: StateFlow<SessionsUiState> = _state.asStateFlow()
    fun refresh() {
        viewModelScope.launch {
            _state.value = SessionsUiState(isLoading = true)
            // TODO: collect LocalCvStore sessions and map to SessionSummary.
            _state.value = SessionsUiState(sessions = emptyList())
        }
    }
    fun clearError() { _state.value = _state.value.copy(error = null) }
}

data class EditorUiState(
    val sessionId: String? = null,
    val title: String = "",
    val markdown: String = "",
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val lastSavedAt: String? = null
)

class EditorViewModel : ViewModel() {
    private var autosaveJob: Job? = null
    private val _state = MutableStateFlow(EditorUiState())
    val state: StateFlow<EditorUiState> = _state.asStateFlow()
    fun open(sessionId: String) {
        viewModelScope.launch {
            _state.value = EditorUiState(sessionId = sessionId, isLoading = true)
            // TODO: load local CV document for sessionId from LocalCvStore.
            _state.value = EditorUiState(sessionId = sessionId)
        }
    }
    fun onTitleChange(value: String) { _state.value = _state.value.copy(title = value); scheduleAutosave() }
    fun onMarkdownChange(value: String) { _state.value = _state.value.copy(markdown = value); scheduleAutosave() }
    private fun scheduleAutosave() {
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(800)
            _state.value = _state.value.copy(isSaving = true, error = null)
            // Local draft persistence point: write the current title/markdown as the
            // local draft for sessionId via LocalCvStore (no network, no cloud sync).
            _state.value = _state.value.copy(isSaving = false, lastSavedAt = "draft")
        }
    }
    fun save() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)
            // TODO: persist via LocalCvStore with contract autosave debounce.
            _state.value = _state.value.copy(isSaving = false)
        }
    }
    fun clearError() { _state.value = _state.value.copy(error = null) }
}

data class ProfileUi(val id: String, val name: String, val headline: String = "")

data class ProfilesUiState(
    val isLoading: Boolean = false,
    val profiles: List<ProfileUi> = emptyList(),
    val error: String? = null
) { val isEmpty: Boolean get() = !isLoading && error == null && profiles.isEmpty() }

class ProfilesViewModel : ViewModel() {
    private val _state = MutableStateFlow(ProfilesUiState())
    val state: StateFlow<ProfilesUiState> = _state.asStateFlow()
    fun refresh() {
        viewModelScope.launch {
            _state.value = ProfilesUiState(isLoading = true)
            // TODO: collect local profiles from LocalCvStore.
            _state.value = ProfilesUiState(profiles = emptyList())
        }
    }
    fun clearError() { _state.value = _state.value.copy(error = null) }
}

data class TemplateUi(val id: String, val name: String, val description: String = "")

data class TemplatesUiState(
    val isLoading: Boolean = false,
    val templates: List<TemplateUi> = emptyList(),
    val error: String? = null
) { val isEmpty: Boolean get() = !isLoading && error == null && templates.isEmpty() }

class TemplatesViewModel : ViewModel() {
    private val _state = MutableStateFlow(TemplatesUiState())
    val state: StateFlow<TemplatesUiState> = _state.asStateFlow()
    fun refresh() {
        viewModelScope.launch {
            _state.value = TemplatesUiState(isLoading = true)
            // TODO: load local templates; remote templates only with templatesConsent.
            _state.value = TemplatesUiState(templates = emptyList())
        }
    }
    fun clearError() { _state.value = _state.value.copy(error = null) }
}
