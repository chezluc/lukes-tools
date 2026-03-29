import Foundation
import Network

class HTTPServer {
    private let port: UInt16
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "imsg-bridge.server", qos: .userInitiated)

    init(port: UInt16) {
        self.port = port
    }

    func start() {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback

        do {
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        } catch {
            print("Failed to create listener: \(error)")
            return
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        listener?.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("imsg-bridge listening on http://127.0.0.1:\(self.port)")
            case .failed(let error):
                print("Listener failed: \(error)")
            default:
                break
            }
        }

        listener?.start(queue: queue)
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(connection, buffer: Data())
    }

    private func receiveRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] content, _, isComplete, error in
            guard let self = self else { return }

            var accumulated = buffer
            if let content = content {
                accumulated.append(content)
            }

            // Check if we have the full request
            if let request = self.parseHTTP(accumulated) {
                let response = Router.handle(request)
                self.sendResponse(connection, response: response)
            } else if !isComplete && error == nil {
                // Need more data
                self.receiveRequest(connection, buffer: accumulated)
            } else {
                connection.cancel()
            }
        }
    }

    private func parseHTTP(_ data: Data) -> HTTPRequest? {
        guard let str = String(data: data, encoding: .utf8) else { return nil }

        // Check we have the full headers
        guard let headerEnd = str.range(of: "\r\n\r\n") else { return nil }

        let headerSection = String(str[str.startIndex..<headerEnd.lowerBound])
        let lines = headerSection.split(separator: "\r\n", omittingEmptySubsequences: false)
        guard let requestLine = lines.first else { return nil }

        let parts = requestLine.split(separator: " ", maxSplits: 2)
        guard parts.count >= 2 else { return nil }

        let method = String(parts[0])
        let rawPath = String(parts[1])

        // Parse path and query
        var path = rawPath
        var query: [String: String] = [:]
        if let qIndex = rawPath.firstIndex(of: "?") {
            path = String(rawPath[rawPath.startIndex..<qIndex])
            let queryStr = String(rawPath[rawPath.index(after: qIndex)...])
            for param in queryStr.split(separator: "&") {
                let kv = param.split(separator: "=", maxSplits: 1)
                if kv.count == 2 {
                    let key = String(kv[0]).removingPercentEncoding ?? String(kv[0])
                    let val = String(kv[1]).removingPercentEncoding ?? String(kv[1])
                    query[key] = val
                }
            }
        }

        // Parse headers
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            if let colonIdx = line.firstIndex(of: ":") {
                let key = line[line.startIndex..<colonIdx].lowercased().trimmingCharacters(in: .whitespaces)
                let val = line[line.index(after: colonIdx)...].trimmingCharacters(in: .whitespaces)
                headers[key] = val
            }
        }

        // Check if we have the full body
        let bodyStart = str[headerEnd.upperBound...]
        let contentLength = Int(headers["content-length"] ?? "0") ?? 0
        guard bodyStart.utf8.count >= contentLength else { return nil }

        let body = contentLength > 0 ? Data(String(bodyStart.prefix(contentLength)).utf8) : nil

        return HTTPRequest(method: method, path: path, query: query, headers: headers, body: body)
    }

    private func sendResponse(_ connection: NWConnection, response: HTTPResponse) {
        let body = response.body
        var header = "HTTP/1.1 \(response.status) \(response.statusText)\r\n"
        header += "Content-Type: application/json\r\n"
        header += "Content-Length: \(body.count)\r\n"
        header += "Connection: close\r\n"
        header += "\r\n"

        var data = Data(header.utf8)
        data.append(body)

        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}

struct HTTPRequest {
    let method: String
    let path: String
    let query: [String: String]
    let headers: [String: String]
    let body: Data?
}

struct HTTPResponse {
    let status: Int
    let body: Data

    var statusText: String {
        switch status {
        case 200: return "OK"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 404: return "Not Found"
        case 500: return "Internal Server Error"
        default: return "Unknown"
        }
    }

    static func json(_ status: Int, _ dict: [String: Any]) -> HTTPResponse {
        let data = (try? JSONSerialization.data(withJSONObject: dict)) ?? Data("{}".utf8)
        return HTTPResponse(status: status, body: data)
    }
}
