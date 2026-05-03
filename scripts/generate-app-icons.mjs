#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sourceIcon = join(repoRoot, "resources", "branding", "primary_logo.png");
const buildDir = join(repoRoot, "apps", "desktop", "build");
const iconsDir = join(buildDir, "icons");
const iconPng = join(buildDir, "icon.png");
const iconIcns = join(buildDir, "icon.icns");
const iconIco = join(buildDir, "icon.ico");
const pngSizes = [16, 32, 64, 128, 256, 512, 1024];
const icoSizes = [16, 32, 64, 128, 256];

ensureCommand("sips", "macOS sips is required to resize the committed PNG logo into app icons.");
mkdirSync(iconsDir, { recursive: true });

for (const size of pngSizes) {
  resizePng(sourceIcon, join(iconsDir, `${size}x${size}.png`), size);
}

copyFileSync(join(iconsDir, "1024x1024.png"), iconPng);
writeIcns();
writeIco();

console.log("Generated Electron app icons under apps/desktop/build.");

function ensureCommand(command, message) {
  const result = spawnSync(command, ["--help"], { stdio: "ignore" });
  if (result.error) {
    console.error(message);
    process.exit(1);
  }
}

function resizePng(input, output, size) {
  execFileSync("sips", ["-z", String(size), String(size), input, "--out", output], {
    stdio: "ignore"
  });
}

function writeIcns() {
  const entries = [
    ["icp4", "16x16.png"],
    ["icp5", "32x32.png"],
    ["icp6", "64x64.png"],
    ["ic07", "128x128.png"],
    ["ic08", "256x256.png"],
    ["ic09", "512x512.png"],
    ["ic10", "1024x1024.png"]
  ].map(([type, fileName]) => ({ type, buffer: readFileSync(join(iconsDir, fileName)) }));

  const totalLength = 8 + entries.reduce((sum, entry) => sum + 8 + entry.buffer.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(totalLength, 4);

  const chunks = entries.map((entry) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(entry.type, 0, 4, "ascii");
    chunkHeader.writeUInt32BE(8 + entry.buffer.length, 4);
    return Buffer.concat([chunkHeader, entry.buffer]);
  });

  writeFileSync(iconIcns, Buffer.concat([header, ...chunks]));
}

function writeIco() {
  const pngBuffers = icoSizes.map((size) => ({
    size,
    buffer: readFileSync(join(iconsDir, `${size}x${size}.png`))
  }));
  const headerSize = 6;
  const directorySize = 16 * pngBuffers.length;
  let imageOffset = headerSize + directorySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);

  const entries = [];
  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    entries.push(entry);
    imageOffset += buffer.length;
  }

  writeFileSync(iconIco, Buffer.concat([header, ...entries, ...pngBuffers.map(({ buffer }) => buffer)]));
}
