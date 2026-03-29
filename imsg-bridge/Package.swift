// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "imsg-bridge",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "imsg-bridge",
            path: "Sources/IMsgBridge"
        )
    ]
)
