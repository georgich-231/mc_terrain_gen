import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VERSION = "26.2";
const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run worldgen:extract-features -- /path/to/minecraft-26.2-server.jar");
  process.exit(1);
}

const sourcePath = resolve(input);
const sourceBytes = readFileSync(sourcePath);
const sourceSha1 = createHash("sha1").update(sourceBytes).digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "minecraft-26-features-"));

try {
  let dataJar = sourcePath;
  let entries = listZip(dataJar);
  if (!entries.some((entry) => entry.startsWith("data/minecraft/worldgen/configured_feature/"))) {
    const nested = entries.find((entry) => entry.endsWith(`/server-${VERSION}.jar`));
    if (!nested) throw new Error(`Input is not the official Minecraft Java ${VERSION} server JAR`);
    dataJar = join(temporary, `server-${VERSION}.jar`);
    writeFileSync(dataJar, readZipEntry(sourcePath, nested));
    entries = listZip(dataJar);
  }
  const version = JSON.parse(readZipEntry(dataJar, "version.json").toString("utf8"));
  if (version.id !== VERSION) throw new Error(`Expected Minecraft ${VERSION}, received ${version.id}`);

  const configuredFeatures = readRegistry(dataJar, entries, "configured_feature");
  const placedFeatures = readRegistry(dataJar, entries, "placed_feature");
  const outputPath = resolve("src/generated/minecraft26FeatureData.js");
  writeFileSync(outputPath, [
    `// Generated locally from the official Minecraft Java ${VERSION} server JAR.`,
    "// World-generation registry data only; no Mojang Java source is included.",
    `export const MINECRAFT_26_2_FEATURES = Object.freeze(${JSON.stringify({
      version: VERSION,
      sourceSha1,
      configuredFeatures,
      placedFeatures,
    })});`,
    "",
  ].join("\n"));
  console.log(`Wrote ${Object.keys(configuredFeatures).length} configured and ${Object.keys(placedFeatures).length} placed features to ${outputPath}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function readRegistry(jar, entries, registry) {
  const prefix = `data/minecraft/worldgen/${registry}/`;
  const result = {};
  for (const entry of entries.filter((value) => value.startsWith(prefix) && value.endsWith(".json")).sort()) {
    result[`minecraft:${entry.slice(prefix.length, -5)}`] = JSON.parse(readZipEntry(jar, entry).toString("utf8"));
  }
  return result;
}

function listZip(path) {
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim().split("\n");
}

function readZipEntry(path, entry) {
  return execFileSync("unzip", ["-p", path, entry], { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
}
