import Foundation
var book = Notebook()
let first = book.activeID
book.newNote()
assert(book.notes.count == 1, "Empty notes do not multiply")
book.notes[0].content = "第一行"
let submitted = book.notes[0]
book.notes[0].content = "第一行\n继续输入"
book.accept(id: first, content: submitted.content, version: 1)
assert(book.notes[0].content == "第一行\n继续输入", "Acknowledgements preserve in-flight edits")
assert(book.notes[0].pending && book.notes[0].version == 1)
book.accept(id: first, content: book.notes[0].content, version: 2)
assert(!book.notes[0].pending)
book.newNote()
assert(book.notes.count == 2 && book.activeID != first)
assert(book.notes[1].content == "第一行\n继续输入")
let restored = try JSONDecoder().decode(Notebook.self, from: JSONEncoder().encode(book))
assert(restored.activeID == book.activeID && restored.notes[1].version == 2)
book.notes[1].conflict = true
let conflictRestored = try JSONDecoder().decode(Notebook.self, from: JSONEncoder().encode(book))
assert(conflictRestored.notes[1].conflict)
print("Native notebook state checks passed")
let testNote = Note(content: "test")
for host in ["-oProxyCommand=bad", "rn;whoami", "rn\nwhoami", "$(whoami)"] {
    do { _ = try syncNote(testNote, config: Configuration(transport: "ssh", sshTarget: host, serverUrl: "", captureToken: "test")); assertionFailure("Unsafe SSH host accepted") } catch { }
}
for server in ["http://example.com", "https://user:password@example.com", "https://example.com/api", "https://example.com/?key=secret"] {
    do { _ = try syncNote(testNote, config: Configuration(transport: "https", serverUrl: server, captureToken: "test")); assertionFailure("Unsafe server URL accepted") } catch { }
}
print("Native transport input checks passed")
