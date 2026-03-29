import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var server: HTTPServer?
    private let port: UInt16 = 8423

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "\u{1F4AC}"
        buildMenu()
        startServer()
    }

    private func buildMenu() {
        let menu = NSMenu()

        let statusMenuItem = NSMenuItem(title: "Starting...", action: nil, keyEquivalent: "")
        statusMenuItem.tag = 1
        menu.addItem(statusMenuItem)

        menu.addItem(NSMenuItem.separator())

        let toggleItem = NSMenuItem(title: "Stop Server", action: #selector(toggleServer), keyEquivalent: "")
        toggleItem.target = self
        toggleItem.tag = 2
        menu.addItem(toggleItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    private func startServer() {
        server = HTTPServer(port: port)
        server?.start()
        updateMenu(running: true)
    }

    private func stopServer() {
        server?.stop()
        server = nil
        updateMenu(running: false)
    }

    private func updateMenu(running: Bool) {
        guard let menu = statusItem.menu else { return }
        if let statusMenuItem = menu.item(withTag: 1) {
            statusMenuItem.title = running ? "Server running on :\(port)" : "Server stopped"
        }
        if let toggleItem = menu.item(withTag: 2) {
            toggleItem.title = running ? "Stop Server" : "Start Server"
        }
    }

    @objc private func toggleServer() {
        if server != nil {
            stopServer()
        } else {
            startServer()
        }
    }

    @objc private func quit() {
        server?.stop()
        NSApp.terminate(nil)
    }
}
