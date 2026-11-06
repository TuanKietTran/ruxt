package cloud.mashallow.ruxt.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CvDocumentStoreTest {
    private var now = 1_000L
    private var seq = 0
    private fun store() = CvDocumentStore(clock = { now }, newId = { "id-${++seq}" })

    @Test fun createStartsAtRevisionOneWithGeneratedId() {
        val doc = store().create("My CV", "# Hi")
        assertEquals("id-1", doc.id)
        assertEquals(1, doc.revision)
        assertEquals(1_000L, doc.savedAtMillis)
        assertEquals("My CV", doc.title)
    }

    @Test fun saveUnchangedDoesNotBumpRevisionOrTimestamp() {
        val s = store(); val doc = s.create("T", "a", "b")
        now = 2_000L
        val saved = s.save(doc.id, "a", "b")
        assertEquals(1, saved?.revision)
        assertEquals(1_000L, saved?.savedAtMillis)
    }

    @Test fun saveChangedBumpsRevisionAndTimestamp() {
        val s = store(); val doc = s.create("T", "a")
        now = 2_000L
        val saved = s.save(doc.id, "a2", "")
        assertEquals(2, saved?.revision)
        assertEquals(2_000L, saved?.savedAtMillis)
        assertEquals("a2", s.get(doc.id)?.markdown)
    }

    @Test fun saveMissingReturnsNull() { assertNull(store().save("nope", "x", "")) }

    @Test fun renameChangesTitleOnly() {
        val s = store(); val doc = s.create("Old", "m")
        val renamed = s.rename(doc.id, "New")
        assertEquals("New", renamed?.title)
        assertEquals(1, renamed?.revision)
        assertNull(s.rename("nope", "X"))
    }

    @Test fun forkCopiesContentWithCopySuffixAndRevisionOne() {
        val s = store(); val doc = s.create("Base", "md", "css")
        s.save(doc.id, "md2", "css")
        val fork = s.fork(doc.id)
        assertEquals("Base (copy)", fork?.title)
        assertEquals("md2", fork?.markdown)
        assertEquals(1, fork?.revision)
        assertFalse(fork?.id == doc.id)
        assertNull(s.fork("nope"))
    }

    @Test fun deleteRemovesDocument() {
        val s = store(); val doc = s.create("T")
        assertTrue(s.delete(doc.id))
        assertNull(s.get(doc.id))
        assertFalse(s.delete(doc.id))
    }

    @Test fun listIsNewestFirst() {
        val s = store(); val a = s.create("A"); now = 3_000L; val b = s.create("B")
        assertEquals(listOf(b.id, a.id), s.list().map { it.id })
    }

    @Test fun serializeRestoreRoundTrips() {
        val s = store(); s.create("A", "# A"); now = 2_000L; s.create("B", "# B", ".x{}")
        val restored = store(); restored.restore(s.serialize())
        assertEquals(s.list(), restored.list())
    }

    @Test fun restoreBlankClearsStore() {
        val s = store(); s.create("A")
        s.restore("")
        assertTrue(s.list().isEmpty())
    }
}
