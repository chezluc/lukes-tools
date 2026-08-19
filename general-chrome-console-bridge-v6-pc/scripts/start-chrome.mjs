process.env.BRIDGE_PORT = "4472";
process.env.BRIDGE_INSTANCE = "chrome";

await import("../bridge/server.mjs");
