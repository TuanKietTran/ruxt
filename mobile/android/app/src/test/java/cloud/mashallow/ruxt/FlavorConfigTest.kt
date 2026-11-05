package cloud.mashallow.ruxt

import org.junit.Assert.assertTrue
import org.junit.Test

class FlavorConfigTest {
    @Test fun apiBaseUrlIsOneOfTheFlavorHosts() {
        // Single BuildConfig field per flavor (prod / canary) — no other env branching.
        assertTrue(BuildConfig.API_BASE_URL in setOf("https://ruxt.mashallow.cloud", "https://ruxt-canary.mashallow.cloud"))
    }

    @Test fun apiBaseUrlIsHttpsWithoutTrailingSlash() {
        assertTrue(BuildConfig.API_BASE_URL.startsWith("https://"))
        assertTrue(!BuildConfig.API_BASE_URL.endsWith("/"))
    }
}
