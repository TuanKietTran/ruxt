package cloud.mashallow.ruxt.data

import org.json.JSONArray
import org.json.JSONObject

class AuthRepository(private val api: ApiClient) {
    fun me(): JSONObject = api.get("/api/auth/me")
    fun login(email: String, password: String): JSONObject = api.post("/api/auth/login", JSONObject().put("email", email).put("password", password))
    fun register(email: String, password: String): JSONObject = api.post("/api/auth/register", JSONObject().put("email", email).put("password", password))
    fun logout(): JSONObject { try { return api.post("/api/auth/logout") } finally { api.clearSession() } }
}

// Remote counterpart of the local DataStore PreferencesRepository:
// PUT wraps the patch as { preferences: <patch> } per the contract.
class ApiPreferencesRepository(private val api: ApiClient) {
    fun get(): JSONObject = api.get("/api/preferences")
    fun update(patch: JSONObject): JSONObject = api.put("/api/preferences", JSONObject().put("preferences", patch))
}

class ApiConsentRepository(private val api: ApiClient) {
    fun get(): JSONObject = api.get("/api/cloud-data/consent")
    fun update(category: String, granted: Boolean): JSONObject = api.put("/api/cloud-data/consent", JSONObject().put("category", category).put("granted", granted))
}

class CvImportRepository(private val api: ApiClient) {
    fun create(payload: JSONObject): JSONObject = api.post("/api/cv-imports", payload)
    fun get(id: String): JSONObject = api.get("/api/cv-imports/" + id)
    fun list(): JSONArray = api.getList("/api/cv-imports")
    fun poll(id: String, maxAttempts: Int = 30, delayMs: Long = 2000): JSONObject {
        var last = get(id)
        var attempt = 1
        while (attempt < maxAttempts) {
            val state = (last.optString("state").ifBlank { last.optString("status") }).lowercase()
            if (state == "succeeded" || state == "failed" || state == "cancelled") return last
            Thread.sleep(delayMs)
            last = get(id)
            attempt++
        }
        return last
    }
}

class ArtifactRepository(private val api: ApiClient) {
    fun list(): JSONArray = api.getList("/api/cv-artifacts")
    fun get(id: String): JSONObject = api.get("/api/cv-artifacts/" + id)
    fun create(payload: JSONObject): JSONObject = api.post("/api/cv-artifacts", payload)
    fun delete(id: String): JSONObject = api.delete("/api/cv-artifacts/" + id)
}

// Templates are local-first per the contract (no server CRUD); this covers
// only the read routes the contract exposes.
class TemplateRepository(private val api: ApiClient) {
    fun list(): JSONArray = api.getList("/api/templates")
    fun get(id: String): JSONObject = api.get("/api/templates/" + id)
}
