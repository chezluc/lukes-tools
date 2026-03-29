import Foundation

enum Router {
    static func handle(_ req: HTTPRequest) -> HTTPResponse {
        // CORS preflight
        if req.method == "OPTIONS" {
            return .json(200, ["ok": true])
        }

        switch (req.method, req.path) {
        case ("GET", "/health"):
            return .json(200, ["ok": true])

        case ("POST", "/send"):
            return handleSend(req)

        case ("GET", "/chats"):
            return handleChats(req)

        case ("GET", "/history"):
            return handleHistory(req)

        default:
            return .json(404, ["error": "not found"])
        }
    }

    // MARK: - POST /send  {"to": "+1...", "message": "Hello", "file": "/path/to/image.jpg"}
    private static func handleSend(_ req: HTTPRequest) -> HTTPResponse {
        guard let body = req.body,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let to = json["to"] as? String else {
            return .json(400, ["error": "missing 'to' field"])
        }

        let message = json["message"] as? String
        let file = json["file"] as? String

        guard message != nil || file != nil else {
            return .json(400, ["error": "must provide 'message' and/or 'file'"])
        }

        var args = ["send", "--to", to]
        if let message = message, !message.isEmpty {
            args += ["--text", message]
        }
        if let file = file, !file.isEmpty {
            args += ["--file", file]
        }

        do {
            let output = try IMsgExecutor.shared.run(args)
            return .json(200, ["ok": true, "output": output.trimmingCharacters(in: .whitespacesAndNewlines)])
        } catch {
            return .json(500, ["error": error.localizedDescription])
        }
    }

    // MARK: - GET /chats?limit=20
    private static func handleChats(_ req: HTTPRequest) -> HTTPResponse {
        var args = ["chats"]
        if let limit = req.query["limit"] {
            args += ["--limit", limit]
        }

        do {
            let output = try IMsgExecutor.shared.run(args)
            let lines = output.split(separator: "\n").map { String($0) }
            return .json(200, ["chats": lines])
        } catch {
            return .json(500, ["error": error.localizedDescription])
        }
    }

    // MARK: - GET /history?contact=+1...&limit=50
    private static func handleHistory(_ req: HTTPRequest) -> HTTPResponse {
        guard let contact = req.query["contact"], !contact.isEmpty else {
            return .json(400, ["error": "missing 'contact' query parameter"])
        }

        var args = ["history", contact]
        if let limit = req.query["limit"] {
            args += ["--limit", limit]
        }

        do {
            let output = try IMsgExecutor.shared.run(args)
            let lines = output.split(separator: "\n").map { String($0) }
            return .json(200, ["messages": lines])
        } catch {
            return .json(500, ["error": error.localizedDescription])
        }
    }
}
