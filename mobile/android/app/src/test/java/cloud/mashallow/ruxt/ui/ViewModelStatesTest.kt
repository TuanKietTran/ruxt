package cloud.mashallow.ruxt.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelStatesTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun sessionsStateIsEmptyOnlyWhenIdleErrorFreeAndNoSessions() {
        assertTrue(SessionsUiState().isEmpty)
        assertFalse(SessionsUiState(isLoading = true).isEmpty)
        assertFalse(SessionsUiState(error = "boom").isEmpty)
        assertFalse(SessionsUiState(sessions = listOf(SessionSummary("s1", "CV"))).isEmpty)
    }

    @Test fun profilesAndTemplatesStatesFollowTheSameEmptyRule() {
        assertTrue(ProfilesUiState().isEmpty)
        assertFalse(ProfilesUiState(profiles = listOf(ProfileUi("p1", "Ada"))).isEmpty)
        assertFalse(ProfilesUiState(isLoading = true).isEmpty)
        assertTrue(TemplatesUiState().isEmpty)
        assertFalse(TemplatesUiState(templates = listOf(TemplateUi("t1", "Modern"))).isEmpty)
        assertFalse(TemplatesUiState(error = "boom").isEmpty)
    }

    @Test fun refreshSettlesToEmptyIdleState() {
        val sessions = SessionsViewModel(); sessions.refresh()
        dispatcher.scheduler.runCurrent()
        assertEquals(SessionsUiState(), sessions.state.value)
        val profiles = ProfilesViewModel(); profiles.refresh()
        dispatcher.scheduler.runCurrent()
        assertEquals(ProfilesUiState(), profiles.state.value)
        val templates = TemplatesViewModel(); templates.refresh()
        dispatcher.scheduler.runCurrent()
        assertEquals(TemplatesUiState(), templates.state.value)
    }

    @Test fun editorOpenSetsSessionAndClearsLoading() {
        val vm = EditorViewModel(); vm.open("s1")
        dispatcher.scheduler.runCurrent()
        assertEquals("s1", vm.state.value.sessionId)
        assertFalse(vm.state.value.isLoading)
    }

    @Test fun editorTitleChangeAlsoDebouncesToLocalDraft() {
        val vm = EditorViewModel(); vm.onTitleChange("My CV")
        dispatcher.scheduler.advanceTimeBy(799); dispatcher.scheduler.runCurrent()
        assertNull(vm.state.value.lastSavedAt)
        dispatcher.scheduler.advanceTimeBy(1); dispatcher.scheduler.runCurrent()
        assertEquals("draft", vm.state.value.lastSavedAt)
        assertEquals("My CV", vm.state.value.title)
    }
}
