import AppKit
import SwiftUI

final class NotesStore: ObservableObject {
    @Published var notebook: Notebook
    @Published var status = ""
    @Published var working = false
    private var debounce: DispatchWorkItem?
    private var retry: Timer?
    private let file: URL
    let configurationPath: String
    var content: String { notebook.notes[notebook.activeIndex].content }
    init(configurationPath: String) {
        self.configurationPath = configurationPath
        let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Mote")
        file = directory.appendingPathComponent("notebook.json")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if FileManager.default.fileExists(atPath: file.path) {
                notebook = try JSONDecoder().decode(Notebook.self, from: Data(contentsOf: file))
                if notebook.notes.isEmpty { notebook = Notebook() }
            } else { notebook = Notebook() }
        } catch {
            // Never overwrite an unreadable notebook with a fresh empty one.
            fatalError("无法读取本机记事本，请保留 notebook.json 并检查文件权限：\(error)")
        }
        status = notebook.notes[notebook.activeIndex].pending ? "本机已保存 · 等待同步" : "随手写下，自动同步"
        retry = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.syncPending() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.syncPending() }
    }
    @discardableResult func persist() -> Bool {
        do {
            try JSONEncoder().encode(notebook).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
            return true
        } catch { status = "本机保存失败，请勿关闭窗口"; return false }
    }
    func change(_ text: String) {
        notebook.notes[notebook.activeIndex].content = text
        guard persist() else { return }
        status = "本机已保存 · 等待同步"
        debounce?.cancel()
        let next = DispatchWorkItem { [weak self] in self?.syncPending() }
        debounce = next
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: next)
    }
    func save() { debounce?.cancel(); if persist() { syncPending() } }
    func newNote() { guard persist() else { return }; notebook.newNote(); _ = persist(); status = "新记录 · 自动保存"; syncPending() }
    func select(_ id: String) { guard persist() else { return }; notebook.activeID = id; _ = persist(); status = notebook.notes[notebook.activeIndex].pending ? "本机已保存 · 等待同步" : "已同步到 Mote" }
    func syncPending() {
        guard !working, let note = notebook.notes.first(where: { $0.pending && !$0.conflict }) else { return }
        guard note.content.count <= 50_000 else { status = "内容超过 50,000 字，已保存在本机"; return }
        working = true; status = "正在同步…"
        let path = configurationPath
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let result = Result { () throws -> RemoteMemo in
                let config = try JSONDecoder().decode(Configuration.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
                return try syncNote(note, config: config)
            }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.working = false
                switch result {
                case .success(let memo):
                    // Keep edits typed while a save was in flight and advance only its base version.
                    self.notebook.accept(id: note.id, content: note.content, version: memo.version)
                    guard self.persist() else { return }
                    self.status = "已同步到 Mote"
                    self.syncPending()
                case .failure(let error):
                    if let failure = error as? SyncFailure, failure.conflict,
                       let index = self.notebook.notes.firstIndex(where: { $0.id == note.id }) {
                        self.notebook.notes[index].conflict = true
                        _ = self.persist()
                    }
                    self.status = error.localizedDescription
                }
            }
        }
    }
}
struct PlainEditor: NSViewRepresentable {
    @Binding var text: String
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true; scroll.drawsBackground = false
        let editor = NSTextView()
        editor.isRichText = false; editor.importsGraphics = false; editor.drawsBackground = false
        editor.font = .systemFont(ofSize: 15)
        editor.textColor = .labelColor
        editor.insertionPointColor = .labelColor
        editor.textContainerInset = NSSize(width: 24, height: 20)
        editor.isVerticallyResizable = true; editor.isHorizontallyResizable = false
        editor.autoresizingMask = [.width]
        editor.textContainer?.widthTracksTextView = true
        editor.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        let paragraph = NSMutableParagraphStyle(); paragraph.lineSpacing = 7
        editor.defaultParagraphStyle = paragraph
        editor.isAutomaticQuoteSubstitutionEnabled = false
        editor.isAutomaticDashSubstitutionEnabled = false
        editor.setAccessibilityLabel("记事本正文")
        editor.delegate = context.coordinator
        scroll.documentView = editor
        DispatchQueue.main.async { editor.window?.makeFirstResponder(editor) }
        return scroll
    }
    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        if let editor = scroll.documentView as? NSTextView, editor.string != text { editor.string = text }
    }
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: PlainEditor
        init(_ parent: PlainEditor) { self.parent = parent }
        func textDidChange(_ notification: Notification) {
            guard let editor = notification.object as? NSTextView, !editor.hasMarkedText() else { return }
            parent.text = editor.string
        }
    }
}
struct NotesView: View {
    @ObservedObject var store: NotesStore
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("mote").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundColor(Color(red: 0.19, green: 0.73, blue: 0.47))
                Spacer()
                Menu {
                    ForEach(store.notebook.notes) { note in Button(note.title) { store.select(note.id) } }
                } label: { Image(systemName: "clock") }.menuStyle(.borderlessButton).fixedSize().help("最近记录")
                Button(action: store.newNote) { Image(systemName: "square.and.pencil") }.buttonStyle(.plain).keyboardShortcut("n").help("新记录 ⌘N")
                Button(action: store.save) { Image(systemName: "checkmark.circle") }.buttonStyle(.plain).keyboardShortcut("s").help("保存并同步 ⌘S")
            }.padding(.horizontal, 24).padding(.vertical, 16)
            Divider().opacity(0.4)
            ZStack(alignment: .topLeading) {
                if store.content.isEmpty { Text("现在的想法是…").foregroundColor(.secondary).font(.system(size: 15)).padding(.leading, 29).padding(.top, 22).allowsHitTesting(false) }
                PlainEditor(text: Binding(get: {store.content}, set: store.change))
            }
            Divider().opacity(0.4)
            HStack(spacing: 8) {
                Circle().fill(store.working ? Color.orange : store.notebook.notes[store.notebook.activeIndex].pending ? Color.secondary : Color(red: 0.19, green: 0.73, blue: 0.47)).frame(width: 5, height: 5)
                Text(store.status).font(.system(size: 11)).lineLimit(2)
                Spacer(minLength: 12)
                Text("⌘S 保存   ⌘N 新建").font(.system(size: 10)).foregroundColor(.secondary)
            }.foregroundColor(.secondary).padding(.horizontal, 24).padding(.vertical, 12)
        }.background(Color(nsColor: .windowBackgroundColor))
    }
}
final class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var panel: FloatingPanel!
    var store: NotesStore!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let argument = CommandLine.arguments.dropFirst().first
        let configuration = argument ?? UserDefaults.standard.string(forKey: "configurationPath")
        guard let path = configuration else { NSApplication.shared.terminate(nil); return }
        UserDefaults.standard.set(path, forKey: "configurationPath")
        store = NotesStore(configurationPath: path)
        panel = FloatingPanel(contentRect: NSRect(x: 0, y: 0, width: 560, height: 440), styleMask: [.titled, .closable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        panel.title = "Mote Notes"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true; panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.minSize = NSSize(width: 380, height: 260)
        panel.setFrameAutosaveName("MoteNotesWindow")
        panel.contentView = NSHostingView(rootView: NotesView(store: store))
        panel.delegate = self
        if UserDefaults.standard.string(forKey: "NSWindow Frame MoteNotesWindow") == nil { panel.center() }
        let menu = NSMenu()
        let app = NSMenuItem(); menu.addItem(app); app.submenu = NSMenu()
        app.submenu?.addItem(withTitle: "退出 Mote Notes", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        NSApplication.shared.mainMenu = menu
        show()
    }
    func show() { NSApplication.shared.activate(ignoringOtherApps: true); panel.makeKeyAndOrderFront(nil) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { show(); return true }
    func windowShouldClose(_ sender: NSWindow) -> Bool { store.save(); panel.orderOut(nil); return false }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationWillTerminate(_ notification: Notification) { _ = store.persist() }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
