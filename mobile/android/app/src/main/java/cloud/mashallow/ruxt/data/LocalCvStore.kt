package cloud.mashallow.ruxt.data

import android.content.Context
import java.io.File
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

// CV documents are local-first (contract sections a/f): there is no server CRUD
// route for them. This store mirrors the web localCvStore semantics: session
// ids are UUIDs independent of titles, and a save bumps `revision` (and
// `savedAtMillis`) only when markdown or css actually changed.
@Serializable
data class CvDocument(
    val id: String,
    val title: String,
    val markdown: String,
    val css: String,
    val revision: Int,
    val savedAtMillis: Long
)

class CvDocumentStore(
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() }
) {
    private val documents = LinkedHashMap<String, CvDocument>()

    fun list(): List<CvDocument> = documents.values.sortedByDescending { it.savedAtMillis }

    fun get(id: String): CvDocument? = documents[id]

    fun create(title: String, markdown: String = "", css: String = ""): CvDocument {
        val doc = CvDocument(newId(), title, markdown, css, revision = 1, savedAtMillis = clock())
        documents[doc.id] = doc
        return doc
    }

    fun save(id: String, markdown: String, css: String): CvDocument? {
        val current = documents[id] ?: return null
        if (current.markdown == markdown && current.css == css) return current
        val updated = current.copy(
            markdown = markdown,
            css = css,
            revision = current.revision + 1,
            savedAtMillis = clock()
        )
        documents[id] = updated
        return updated
    }

    fun rename(id: String, title: String): CvDocument? {
        val current = documents[id] ?: return null
        val updated = current.copy(title = title)
        documents[id] = updated
        return updated
    }

    fun fork(id: String): CvDocument? {
        val current = documents[id] ?: return null
        return create("${current.title} (copy)", current.markdown, current.css)
    }

    fun delete(id: String): Boolean = documents.remove(id) != null

    fun serialize(json: Json = CvStoreJson): String =
        json.encodeToString(ListSerializer(CvDocument.serializer()), list())

    fun restore(serialized: String, json: Json = CvStoreJson) {
        documents.clear()
        if (serialized.isBlank()) return
        val decoded = json.decodeFromString(ListSerializer(CvDocument.serializer()), serialized)
        for (doc in decoded) documents[doc.id] = doc
    }
}

val CvStoreJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

// File-backed repository used by the app: loads cv-documents.json on first use
// and persists after every mutation.
class LocalCvRepository(context: Context) {
    private val file = File(context.filesDir, "cv-documents.json")
    private val store = CvDocumentStore()

    init {
        if (file.exists()) store.restore(file.readText())
    }

    @Synchronized fun list(): List<CvDocument> = store.list()
    @Synchronized fun get(id: String): CvDocument? = store.get(id)
    @Synchronized fun create(title: String, markdown: String = "", css: String = ""): CvDocument =
        store.create(title, markdown, css).also { persist() }
    @Synchronized fun save(id: String, markdown: String, css: String): CvDocument? =
        store.save(id, markdown, css)?.also { persist() }
    @Synchronized fun rename(id: String, title: String): CvDocument? =
        store.rename(id, title)?.also { persist() }
    @Synchronized fun fork(id: String): CvDocument? = store.fork(id)?.also { persist() }
    @Synchronized fun delete(id: String): Boolean = store.delete(id).also { if (it) persist() }

    private fun persist() { file.writeText(store.serialize()) }
}
