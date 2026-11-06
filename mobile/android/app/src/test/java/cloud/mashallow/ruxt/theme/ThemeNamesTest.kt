package cloud.mashallow.ruxt.theme

import org.junit.Assert.assertEquals
import org.junit.Test

class ThemeNamesTest {
    @Test fun themeNamesAreExactlyTheFourSupported() {
        assertEquals(listOf("system", "mocha", "latte", "opencode"), ThemeNames)
    }

    @Test fun validNamesAreKept() {
        for (name in ThemeNames) assertEquals(name, normalizeThemeName(name))
    }

    @Test fun invalidNamesFallBackToMocha() {
        for (bad in listOf(null, "", "bogus", "LATTE", "dark", "mocha ")) {
            assertEquals("mocha", normalizeThemeName(bad))
        }
    }
}
