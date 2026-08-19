process.env.BRIDGE_PORT = "4471";
process.env.BRIDGE_INSTANCE = "canary";
process.env.BRIDGE_BROWSER_LABEL = "Google Chrome Canary";
process.env.BRIDGE_EXTENSION_NAME = "Chrome Console Bridge v6 (Canary)";
process.env.DIST_DIR = "dist-canary";

await import("./build.mjs");
