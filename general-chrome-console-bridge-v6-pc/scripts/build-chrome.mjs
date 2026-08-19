process.env.BRIDGE_PORT = "4472";
process.env.BRIDGE_INSTANCE = "chrome";
process.env.BRIDGE_BROWSER_LABEL = "Google Chrome";
process.env.BRIDGE_EXTENSION_NAME = "Chrome Console Bridge v6 (Google Chrome)";
process.env.DIST_DIR = "dist-chrome";

await import("./build.mjs");
