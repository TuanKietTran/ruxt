package cloud.mashallow.ruxt.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EditorViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun autosaveFiresAfterDebounceAsLocalDraft() {
        val vm = EditorViewModel()
        vm.onMarkdownChange("# Hello")
        dispatcher.scheduler.advanceTimeBy(799); dispatcher.scheduler.runCurrent()
        assertNull(vm.state.value.lastSavedAt)
        dispatcher.scheduler.advanceTimeBy(1); dispatcher.scheduler.runCurrent()
        assertEquals("draft", vm.state.value.lastSavedAt)
        assertEquals(false, vm.state.value.isSaving)
    }

    @Test fun rapidEditsResetTheDebounce() {
        val vm = EditorViewModel()
        vm.onMarkdownChange("a")
        dispatcher.scheduler.advanceTimeBy(400); dispatcher.scheduler.runCurrent()
        vm.onMarkdownChange("ab")
        dispatcher.scheduler.advanceTimeBy(799); dispatcher.scheduler.runCurrent()
        assertNull(vm.state.value.lastSavedAt)
        dispatcher.scheduler.advanceTimeBy(1); dispatcher.scheduler.runCurrent()
        assertEquals("draft", vm.state.value.lastSavedAt)
        assertEquals("ab", vm.state.value.markdown)
    }

    @Test fun emptyEditorStateByDefault() {
        val vm = EditorViewModel()
        assertNull(vm.state.value.sessionId)
        assertEquals("", vm.state.value.markdown)
    }
}
