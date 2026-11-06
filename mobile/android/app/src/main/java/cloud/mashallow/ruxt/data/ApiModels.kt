package cloud.mashallow.ruxt.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// DTOs for the Ruxt mobile API contract (notes/mobile-contract.md).
// Passthrough shapes from @ruxt/core are modelled tolerantly: unknown keys are
// ignored by the client Json config and every field the routes do not read
// directly is nullable/defaulted. No plans/subscriptions/IAM types exist here:
// mobile clients must not call those legacy routes (briefs/security-req.md).

@Serializable
data class AuthResponse(val userId: String? = null)

@Serializable
data class AuthUser(
    val id: String? = null,
    val userId: String? = null,
    val email: String? = null,
    val name: String? = null
) {
    // GET /api/auth/me returns {id, email} for a Clerk principal but the raw
    // getUserQuery result for a legacy principal (contract section h.6).
    val effectiveId: String? get() = id ?: userId
}

@Serializable
data class CredentialsRequest(val email: String, val password: String)

@Serializable
data class LogoutResponse(val ok: Boolean = false)

@Serializable
data class ConsentUpdateRequest(val category: String, val granted: Boolean)

@Serializable
data class PreferencesUpdateRequest(val preferences: JsonObject)

@Serializable
data class CvTemplate(
    val id: String,
    val version: Int = 1,
    val tags: List<String> = emptyList(),
    val name: String? = null,
    val title: String? = null
)

@Serializable
data class TemplatesResponse(val templates: List<CvTemplate> = emptyList())

@Serializable
data class CvCapabilities(
    val available: Boolean = false,
    val degradedReason: String? = null,
    val maxUploadBytes: Long? = null,
    val formats: List<String> = emptyList(),
    val ocr: Boolean? = null,
    val renderer: String? = null
)

@Serializable
data class CvImportJob(
    val id: String,
    val state: String? = null,
    val status: String? = null,
    val stage: String? = null,
    val progress: Int? = null,
    val errorCode: String? = null,
    val error: String? = null,
    val warnings: List<String> = emptyList()
) {
    val effectiveState: String? get() = state ?: status
    val isTerminal: Boolean get() = effectiveState in setOf("succeeded", "failed", "cancelled")
}

@Serializable
data class CvImportPreview(
    val importId: String? = null,
    val id: String? = null,
    val state: String? = null,
    val concept: JsonElement? = null,
    val markdown: String? = null,
    val css: String? = null,
    val warnings: List<String> = emptyList()
)

@Serializable
data class CvApplication(
    val id: String,
    val ownerId: String? = null,
    val status: String? = null,
    val revision: Int? = null
)
