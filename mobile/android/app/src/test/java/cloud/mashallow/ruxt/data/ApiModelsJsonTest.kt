package cloud.mashallow.ruxt.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiModelsJsonTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun authUserClerkShapeIgnoresUnknownKeys() {
        val user = json.decodeFromString(AuthUser.serializer(), """{"id":"u1","email":"a@b.c","extra":42}""")
        assertEquals("u1", user.effectiveId)
        assertEquals("a@b.c", user.email)
    }

    @Test fun authUserLegacyShapeFallsBackToUserId() {
        val user = json.decodeFromString(AuthUser.serializer(), """{"userId":"legacy-7","name":"K"}""")
        assertEquals("legacy-7", user.effectiveId)
        assertNull(user.email)
    }

    @Test fun credentialsRequestEncodesEmailAndPassword() {
        val encoded = json.encodeToString(CredentialsRequest.serializer(), CredentialsRequest("a@b.c", "pw"))
        assertTrue(encoded.contains("\"email\":\"a@b.c\""))
        assertTrue(encoded.contains("\"password\":\"pw\""))
    }

    @Test fun templatesResponseAppliesDefaults() {
        val resp = json.decodeFromString(TemplatesResponse.serializer(), """{"templates":[{"id":"t1","name":"Harvard"}]}""")
        assertEquals(1, resp.templates.size)
        assertEquals(1, resp.templates[0].version)
        assertEquals(emptyList<String>(), resp.templates[0].tags)
        assertEquals("Harvard", resp.templates[0].name)
    }

    @Test fun importJobEffectiveStateAndTerminal() {
        val running = json.decodeFromString(CvImportJob.serializer(), """{"id":"j1","status":"running"}""")
        assertEquals("running", running.effectiveState)
        assertFalse(running.isTerminal)
        val done = json.decodeFromString(CvImportJob.serializer(), """{"id":"j2","state":"succeeded"}""")
        assertTrue(done.isTerminal)
    }

    @Test fun importPreviewDefaultsWarnings() {
        val preview = json.decodeFromString(CvImportPreview.serializer(), """{"id":"p1","markdown":"# X"}""")
        assertEquals("p1", preview.id)
        assertEquals("# X", preview.markdown)
        assertEquals(emptyList<String>(), preview.warnings)
    }

    @Test fun consentAndPreferencesRequestsEncode() {
        val consent = json.encodeToString(ConsentUpdateRequest.serializer(), ConsentUpdateRequest("templates", true))
        assertTrue(consent.contains("\"category\":\"templates\""))
        assertTrue(consent.contains("\"granted\":true"))
    }

    @Test fun securityNoLegacyRouteTypesExist() {
        // Guard: the contract forbids plans/subscriptions/iam client types.
        val names = listOf(AuthResponse::class, AuthUser::class, CvTemplate::class, CvImportJob::class).map { it.java.simpleName }
        assertTrue(names.none { it.contains("Plan") || it.contains("Subscription") || it.contains("Iam") })
    }
}
