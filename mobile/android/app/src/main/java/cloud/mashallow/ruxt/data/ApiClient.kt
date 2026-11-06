package cloud.mashallow.ruxt.data

import cloud.mashallow.ruxt.BuildConfig
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

// In-memory cookie jar for tests / non-Android callers. Production wiring
// uses PersistentCookieJar (SessionCookieJar.kt) so auth_session survives
// process death. Legacy cookie auth only: no bearer token, no refresh.
class SessionCookieJar : CookieJar {
    private val store = mutableMapOf<String, List<Cookie>>()
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) { store[url.host] = cookies }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = store[url.host].orEmpty().filter { it.expiresAt > System.currentTimeMillis() }
    @Synchronized fun clear() { store.clear() }
}

class ApiClient(
    val baseUrl: String = BuildConfig.API_BASE_URL,
    val cookieJar: CookieJar = SessionCookieJar(),
    private val http: OkHttpClient = OkHttpClient.Builder().cookieJar(cookieJar).build()
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun get(path: String): JSONObject = requestObject("GET", path, null)
    fun getList(path: String): JSONArray = requestArray("GET", path, null)
    fun post(path: String, body: JSONObject = JSONObject()): JSONObject = requestObject("POST", path, body)
    fun put(path: String, body: JSONObject): JSONObject = requestObject("PUT", path, body)
    fun patch(path: String, body: JSONObject): JSONObject = requestObject("PATCH", path, body)
    fun delete(path: String): JSONObject = requestObject("DELETE", path, null)
    fun clearSession() { (cookieJar as? PersistentCookieJar)?.clear(); (cookieJar as? SessionCookieJar)?.clear() }

    fun requestObject(method: String, path: String, body: JSONObject?): JSONObject {
        return when (val data = execute(method, path, body)) {
            is JSONObject -> data
            is JSONArray -> JSONObject().put("items", data)
            null -> JSONObject()
            else -> JSONObject().put("value", data)
        }
    }

    fun requestArray(method: String, path: String, body: JSONObject?): JSONArray {
        return when (val data = execute(method, path, body)) {
            is JSONArray -> data
            is JSONObject -> data.optJSONArray("items") ?: JSONArray().put(data)
            null -> JSONArray()
            else -> JSONArray().put(data)
        }
    }

    private fun execute(method: String, path: String, body: JSONObject?): Any? {
        val url = baseUrl.trimEnd('/') + "/" + path.trimStart('/')
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        val payload = body?.toString()?.toRequestBody(jsonMedia)
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> builder.delete()
            "POST" -> builder.post(payload ?: "{}".toRequestBody(jsonMedia))
            "PUT" -> builder.put(payload ?: "{}".toRequestBody(jsonMedia))
            "PATCH" -> builder.patch(payload ?: "{}".toRequestBody(jsonMedia))
            else -> throw IllegalArgumentException("Unsupported method: " + method)
        }
        http.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401) { clearSession(); throw SessionExpiredException() }
            val parsed: JSONObject? = try { if (text.isBlank()) null else JSONObject(text) } catch (e: JSONException) { null }
            if (parsed == null) {
                if (response.isSuccessful) return JSONObject().put("raw", text)
                throw ApiException(response.code, null, text.ifBlank { "HTTP " + response.code })
            }
            if (!response.isSuccessful) {
                val code = parsed.optJSONObject("data")?.optString("code")?.takeIf { it.isNotBlank() }
                val msg = parsed.optString("message").takeIf { it.isNotBlank() } ?: parsed.optString("statusMessage").takeIf { it.isNotBlank() } ?: ("HTTP " + response.code)
                throw ApiException(response.code, code, msg)
            }
            return if (parsed.has("data")) parsed.get("data") else parsed
        }
    }
}
