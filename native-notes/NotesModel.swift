import Foundation

struct Note: Codable, Identifiable {
    var id = UUID().uuidString.lowercased()
    var content = ""
    var syncedContent = ""
    var version: Int?
    var conflict = false
    var title: String {
        let first = content.split(separator: "\n").first.map(String.init) ?? "新记录"
        return String(first.prefix(28))
    }
    var pending: Bool { !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content != syncedContent }
}
struct Notebook: Codable {
    var notes = [Note()]
    var activeID: String
    init() { activeID = notes[0].id }
    var activeIndex: Int { notes.firstIndex { $0.id == activeID } ?? 0 }
    mutating func accept(id: String, content: String, version: Int) {
        guard let index = notes.firstIndex(where: { $0.id == id }) else { return }
        notes[index].syncedContent = content
        notes[index].version = version
        notes[index].conflict = false
    }
    mutating func newNote() {
        if notes[activeIndex].content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return }
        let note = Note()
        notes.insert(note, at: 0)
        activeID = note.id
    }
}
struct Configuration: Decodable {
    var transport: String
    var sshTarget: String?
    var serverUrl: String
    var captureToken: String
}
struct RemoteMemo: Decodable {
    let id: String
    let content: String
    let version: Int
}
struct SyncFailure: LocalizedError {
    let message: String
    var conflict = false
    var errorDescription: String? { message }
}
func syncNote(_ note: Note, config: Configuration) throws -> RemoteMemo {
    let payload: [String: Any] = ["id": note.id, "content": note.content, "version": note.version as Any? ?? NSNull()]
    let result: Data
    var status: Int
    if config.transport == "ssh" {
        let host = config.sshTarget ?? "rn"
        guard host.range(of: "^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$", options: .regularExpression) != nil else { throw SyncFailure(message: "SSH 主机名无效") }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ssh")
        process.arguments = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, "docker exec -i mote node /app/scripts/notepad.js"]
        let input = Pipe(), output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        try process.run()
        let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + 25, execute: timeout)
        defer { timeout.cancel() }
        var envelope = payload
        envelope["token"] = config.captureToken
        try input.fileHandleForWriting.write(contentsOf: JSONSerialization.data(withJSONObject: envelope))
        try input.fileHandleForWriting.close()
        let bytes = try output.fileHandleForReading.readToEnd() ?? Data()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw SyncFailure(message: "连接未完成，内容已保存在本机，将自动重试") }
        guard let wrapper = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let body = wrapper["body"], let code = wrapper["status"] as? Int else { throw SyncFailure(message: "服务器响应异常，内容已保存在本机") }
        status = code
        result = try JSONSerialization.data(withJSONObject: body)
    } else {
        guard var parts = URLComponents(string: config.serverUrl), parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, parts.path.isEmpty || parts.path == "/",
              parts.scheme == "https" || (parts.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(parts.host ?? "")) else { throw SyncFailure(message: "请填写正确的 HTTPS 服务器地址") }
        parts.path = "/api/notepad"
        guard let url = parts.url else { throw SyncFailure(message: "服务器地址无效") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.captureToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let semaphore = DispatchSemaphore(value: 0)
        var received: Data?, responseCode: Int?, requestError: Error?
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        session.dataTask(with: request) { data, response, error in
            received = data; responseCode = (response as? HTTPURLResponse)?.statusCode; requestError = error
            semaphore.signal()
        }.resume()
        guard semaphore.wait(timeout: .now() + 25) == .success else { throw SyncFailure(message: "同步超时，内容已保存在本机") }
        if let error = requestError { throw error }
        guard let data = received, let code = responseCode else { throw SyncFailure(message: "未确认保存，内容已保存在本机") }
        result = data; status = code
    }
    guard status == 200 else {
        let body = (try? JSONSerialization.jsonObject(with: result)) as? [String: Any]
        throw SyncFailure(message: body?["error"] as? String ?? "同步未完成，内容已保存在本机", conflict: status == 409)
    }
    let memo = try JSONDecoder().decode(RemoteMemo.self, from: result)
    guard memo.id == note.id, memo.content == note.content.trimmingCharacters(in: .whitespacesAndNewlines) else { throw SyncFailure(message: "保存未确认，内容已保存在本机") }
    return memo
}

private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
