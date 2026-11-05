package cloud.mashallow.ruxt.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationDestsTest {
    @Test fun allDestsRoutesAndLabelsInOrder() {
        assertEquals(
            listOf("sessions", "templates", "profiles", "providers", "dashboard", "settings", "about", "login"),
            AllDests.map { it.route }
        )
        assertEquals(
            listOf("Sessions", "Templates", "Profiles", "Providers", "Dashboard", "Settings", "About", "Login"),
            AllDests.map { it.label }
        )
    }

    @Test fun topDestsAreTheCompactBottomBar() {
        assertEquals(listOf("sessions", "templates", "profiles", "more"), TopDests.map { it.route })
    }

    @Test fun noPlannedRoutesInPrimaryDestinations() {
        val planned = setOf("plans", "billing", "iam")
        assertTrue(AllDests.none { it.route in planned })
        assertTrue(TopDests.none { it.route in planned })
    }

    @Test fun destinationRoutesAreUniqueAndLabelsNonBlank() {
        assertEquals(AllDests.size, AllDests.map { it.route }.toSet().size)
        assertTrue(AllDests.all { it.label.isNotBlank() })
        assertTrue(TopDests.all { it.label.isNotBlank() })
    }
}
