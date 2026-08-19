process.env.BRIDGE_PORT = "4471";
process.env.BRIDGE_INSTANCE = "canary";

await import("../bridge/server.mjs");
