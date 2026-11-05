package cloud.mashallow.ruxt.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Local-first session metadata, kept separate from CvDocumentStore:
// sessions are UI-level entries (title + open document id), CV document
// content itself lives in LocalCvRepository (LocalCvStore.kt).
data class LocalSession(val id: String, val title: String, val documentId: String?, val updatedAt: Long) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("title", title).put("documentId", documentId ?: JSONObject.NULL).put("updatedAt", updatedAt)
    companion object { fun fromJson(o: JSONObject): LocalSession = LocalSession(o.optString("id"), o.optString("title"), if (o.isNull("documentId")) null else o.optString("documentId"), o.optLong("updatedAt")) }
}

class LocalSessionsRepository(private val file: File) {
    private fun readAll(): MutableList<LocalSession> {
        if (!file.exists()) return mutableListOf()
        val text = file.readText().trim()
        if (text.isEmpty()) return mutableListOf()
        val arr = JSONArray(text)
        val out = mutableListOf<LocalSession>()
        for (i in 0 until arr.length()) out.add(LocalSession.fromJson(arr.getJSONObject(i)))
        return out
    }
    private fun writeAll(items: List<LocalSession>) {
        file.parentFile?.mkdirs()
        val arr = JSONArray()
        items.forEach { arr.put(it.toJson()) }
        file.writeText(arr.toString())
    }
    fun list(): List<LocalSession> = readAll().sortedByDescending { it.updatedAt }
    fun get(id: String): LocalSession? = readAll().firstOrNull { it.id == id }
    fun save(session: LocalSession) { val items = readAll().filter { it.id != session.id }.toMutableList(); items.add(session); writeAll(items) }
    fun delete(id: String) { writeAll(readAll().filter { it.id != id }) }
    fun clear() { writeAll(emptyList()) }
}
