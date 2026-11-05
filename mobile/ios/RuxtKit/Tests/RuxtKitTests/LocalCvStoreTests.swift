import XCTest
@testable import RuxtKit

final class LocalCvStoreTests: XCTestCase {
    private var storage: InMemoryCvStorage!
    private var now: Date!
    private var store: LocalCvStore!

    override func setUp() {
        storage = InMemoryCvStorage()
        now = Date(timeIntervalSince1970: 1_700_000_000)
        store = LocalCvStore(storage: storage, now: { [unowned self] in self.now })
    }

    private func advance(seconds: TimeInterval = 60) { now = now.addingTimeInterval(seconds) }

    func testCreateStartsAtRevisionOneWithPlaceholderTitle() {
        let document = store.create(id: "a", title: "  ", markdown: "body", css: "")
        XCTAssertEqual(document?.revision, 1)
        XCTAssertEqual(document?.title, "Untitled CV")
        XCTAssertEqual(document?.updatedAt, "2023-11-14T22:13:20.000Z")
        XCTAssertEqual(store.get("a")?.markdown, "body")
    }

    func testCreateRefusesExistingIdEvenWhenStoredValueIsCorrupt() {
        XCTAssertNotNil(store.create(id: "a", markdown: "x", css: ""))
        XCTAssertNil(store.create(id: "a", markdown: "y", css: ""))
        storage.setString("not json", forKey: LocalCvStore.keyPrefix + "b")
        XCTAssertNil(store.create(id: "b", markdown: "y", css: ""))
        XCTAssertEqual(storage.string(forKey: LocalCvStore.keyPrefix + "b"), "not json")
    }

    func testSaveBumpsRevisionOnlyWhenSourceChanges() {
        XCTAssertEqual(store.save(id: "a", markdown: "one", css: "")?.revision, 1)
        advance()
        let unchanged = store.save(id: "a", markdown: "one", css: "")
        XCTAssertEqual(unchanged?.revision, 1)
        XCTAssertEqual(unchanged?.updatedAt, "2023-11-14T22:13:20.000Z")
        let changed = store.save(id: "a", markdown: "two", css: "")
        XCTAssertEqual(changed?.revision, 2)
        XCTAssertEqual(changed?.updatedAt, "2023-11-14T22:14:20.000Z")
    }

    func testSaveNeverOverwritesCorruptBackup() {
        storage.setString("{broken", forKey: LocalCvStore.keyPrefix + "a")
        XCTAssertNil(store.save(id: "a", markdown: "x", css: ""))
        XCTAssertEqual(storage.string(forKey: LocalCvStore.keyPrefix + "a"), "{broken")
    }

    func testRenameTrimsAndKeepsRevisionAndTimestamp() {
        _ = store.create(id: "a", title: "Old", markdown: "x", css: "")
        advance()
        let renamed = store.rename(id: "a", title: "  New Name  ")
        XCTAssertEqual(renamed?.title, "New Name")
        XCTAssertEqual(renamed?.revision, 1)
        XCTAssertEqual(renamed?.updatedAt, "2023-11-14T22:13:20.000Z")
        XCTAssertEqual(store.rename(id: "a", title: " ")?.title, "Untitled CV")
        XCTAssertNil(store.rename(id: "missing", title: "X"))
    }

    func testForkDefaultsToCopyTitleAndStartsAtRevisionOne() {
        _ = store.create(id: "a", title: "Jane Doe", markdown: "# Jane", css: "c")
        _ = store.save(id: "a", markdown: "# Jane v2", css: "c")
        let fork = store.fork(sourceId: "a", newId: "b")
        XCTAssertEqual(fork?.title, "Jane Doe (copy)")
        XCTAssertEqual(fork?.revision, 1)
        XCTAssertEqual(fork?.markdown, "# Jane v2")
        XCTAssertNil(store.fork(sourceId: "a", newId: "b"))
        XCTAssertNil(store.fork(sourceId: "missing", newId: "c"))
    }

    func testListSortsNewestFirstAndDerivesTitleFromHeading() {
        _ = store.create(id: "b", title: "Untitled CV", markdown: "# Beta Person {cv}", css: "")
        advance()
        _ = store.create(id: "a", markdown: "no heading", css: "")
        let list = store.list()
        XCTAssertEqual(list.map(\.id), ["a", "b"])
        XCTAssertEqual(list[1].title, "Beta Person")
        XCTAssertEqual(list[0].title, "Untitled CV")
    }

    func testTitleFromMarkdown() {
        XCTAssertEqual(LocalCvStore.titleFromMarkdown("intro\n#  Jane Doe  \n## Sub"), "Jane Doe")
        XCTAssertEqual(LocalCvStore.titleFromMarkdown("## Not H1"), nil)
        XCTAssertEqual(LocalCvStore.titleFromMarkdown("#Name"), nil)
        XCTAssertEqual(LocalCvStore.titleFromMarkdown("plain"), nil)
    }

    func testRemoveDeletesAndPutRoundTrips() {
        let document = CvDocument(id: "a", title: "T", markdown: "m", css: "c", revision: 3, updatedAt: "2023-11-14T22:13:20.000Z")
        XCTAssertTrue(store.put(document))
        XCTAssertEqual(store.get("a"), document)
        store.remove(id: "a")
        XCTAssertNil(store.get("a"))
        XCTAssertEqual(store.list(), [])
    }
}
