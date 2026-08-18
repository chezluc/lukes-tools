import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const bridgeHost = process.env.BRIDGE_HOST ?? "127.0.0.1";
const bridgePort = process.env.BRIDGE_PORT ?? "4471";
const bridgeInstance = process.env.BRIDGE_INSTANCE ?? "default";
const bridgeBrowserLabel = process.env.BRIDGE_BROWSER_LABEL ?? bridgeInstance;
const bridgeBaseUrl = `http://${bridgeHost}:${bridgePort}`;
const extensionName = process.env.BRIDGE_EXTENSION_NAME ?? `Chrome Console Bridge v5 (${bridgeBrowserLabel})`;
const extensionDescription = process.env.BRIDGE_EXTENSION_DESCRIPTION
  ?? `Background-first agent bridge for ${bridgeBrowserLabel} on ${bridgeBaseUrl}.`;
const dist = resolve(root, process.env.DIST_DIR ?? "dist");

// Clean dist folder without deleting the folder itself to avoid Finder focus shifts
try {
  const entries = await readdir(dist);
  for (const entry of entries) {
    await rm(resolve(dist, entry), { recursive: true, force: true });
  }
} catch {
  await mkdir(dist, { recursive: true });
}

await mkdir(resolve(dist, "icons"), { recursive: true });

await Promise.all([
  buildEntry("src/background/index.ts", "background.js"),
  buildEntry("src/bridge/index.ts", "bridge.js")
]);

const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
manifest.name = extensionName;
manifest.description = extensionDescription;

// Pinned key -> the extension ID is identical in every browser, on every
// machine, and across reloads, so the bridge.html URL never changes.
const { key } = JSON.parse(await readFile(resolve(root, "scripts/extension-id.json"), "utf8"));
manifest.key = key;

await Promise.all([
  writeFile(resolve(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  cp(resolve(root, "src/bridge/bridge.html"), resolve(dist, "bridge.html"))
]);

const icons = [
  ["icon16.png", 16],
  ["icon32.png", 32],
  ["icon48.png", 48],
  ["icon128.png", 128]
];

for (const [name, size] of icons) {
  await writeFile(resolve(dist, "icons", name), createPng(size));
}

console.log(`built ${dist} (${extensionName})`);

async function buildEntry(entryPoint, outfile) {
  await build({
    entryPoints: [resolve(root, entryPoint)],
    outfile: resolve(dist, outfile),
    bundle: true,
    format: "esm",
    target: "chrome120",
    sourcemap: false,
    define: {
      __BRIDGE_BASE_URL__: JSON.stringify(bridgeBaseUrl),
      __BRIDGE_INSTANCE__: JSON.stringify(bridgeInstance),
      __BRIDGE_BROWSER_LABEL__: JSON.stringify(bridgeBrowserLabel),
      __BRIDGE_PORT__: JSON.stringify(bridgePort),
    }
  });
}

function createPng(size) {
  const width = size;
  const height = size;
  const row = width * 4 + 1;
  const data = Buffer.alloc(row * height);

  for (let y = 0; y < height; y += 1) {
    const offset = y * row;
    data[offset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = offset + 1 + x * 4;
      const blend = x / Math.max(width - 1, 1);
      data[pixel] = Math.round(16 * (1 - blend) + 5 * blend);
      data[pixel + 1] = Math.round(185 * (1 - blend) + 118 * blend);
      data[pixel + 2] = Math.round(129 * (1 - blend) + 110 * blend);
      data[pixel + 3] = 255;
    }
  }

  const chunks = [
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(data)),
    chunk("IEND", Buffer.alloc(0))
  ];

  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
