import Foundation

struct IMsgExecutor {
    static let shared = IMsgExecutor()

    private let imsgPath: String

    init() {
        // Find imsg in common locations
        let candidates = [
            "/opt/homebrew/bin/imsg",
            "/usr/local/bin/imsg",
            "/usr/bin/imsg"
        ]
        self.imsgPath = candidates.first { FileManager.default.fileExists(atPath: $0) } ?? "imsg"
    }

    func run(_ arguments: [String]) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: imsgPath)
        process.arguments = arguments

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        try process.run()
        process.waitUntilExit()

        let outData = stdout.fileHandleForReading.readDataToEndOfFile()
        let errData = stderr.fileHandleForReading.readDataToEndOfFile()

        guard process.terminationStatus == 0 else {
            let errStr = String(data: errData, encoding: .utf8) ?? ""
            let outStr = String(data: outData, encoding: .utf8) ?? ""
            throw NSError(domain: "IMsgBridge", code: Int(process.terminationStatus),
                          userInfo: [NSLocalizedDescriptionKey: errStr.isEmpty ? outStr : errStr])
        }
        return String(data: outData, encoding: .utf8) ?? ""
    }
}
