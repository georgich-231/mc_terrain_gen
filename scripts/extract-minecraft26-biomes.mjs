import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const VERSION = "26.2";
const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run worldgen:extract-biomes -- /path/to/minecraft-26.2-server.jar");
  process.exit(1);
}

const sourcePath = resolve(input);
const sourceBytes = readFileSync(sourcePath);
const sourceSha1 = sha1(sourceBytes);
const temporary = mkdtempSync(join(tmpdir(), "minecraft-26-biomes-"));

try {
  let dataJar = sourcePath;
  let entries = listZip(dataJar);
  if (!entries.some((entry) => entry.startsWith("data/minecraft/worldgen/biome/"))) {
    const nested = entries.find((entry) => entry.endsWith(`/server-${VERSION}.jar`));
    if (!nested) throw new Error(`${basename(sourcePath)} is not the official Minecraft Java ${VERSION} server JAR`);
    dataJar = join(temporary, `server-${VERSION}.jar`);
    writeFileSync(dataJar, readZipEntry(sourcePath, nested));
    entries = listZip(dataJar);
  }

  const version = JSON.parse(readZipEntry(dataJar, "version.json").toString("utf8"));
  if (version.id !== VERSION) throw new Error(`Expected Minecraft ${VERSION}, received ${version.id ?? "an unknown version"}`);

  const biomePrefix = "data/minecraft/worldgen/biome/";
  const biomeEntries = entries.filter((entry) => entry.startsWith(biomePrefix) && entry.endsWith(".json")).sort();
  const biomes = {};
  for (const entry of biomeEntries) {
    const id = `minecraft:${entry.slice(biomePrefix.length, -".json".length)}`;
    biomes[id] = JSON.parse(readZipEntry(dataJar, entry).toString("utf8"));
  }

  const output = [
    `// Generated locally from the official Minecraft Java ${VERSION} server JAR.`,
    "// Registry data only: no Mojang Java source or game assets are included.",
    `export const MINECRAFT_26_2_BIOMES = Object.freeze(${JSON.stringify({
      version: version.id,
      worldVersion: version.world_version,
      dataPackVersion: `${version.pack_version.data_major}.${version.pack_version.data_minor}`,
      sourceSha1,
      biomes,
    })});`,
    "",
  ].join("\n");
  const outputPath = resolve("src/generated/minecraft26BiomeData.js");
  writeFileSync(outputPath, output);
  console.log(`Wrote ${biomeEntries.length} biome definitions to ${outputPath}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function listZip(path) {
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim().split("\n");
}

function readZipEntry(path, entry) {
  return execFileSync("unzip", ["-p", path, entry], { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
}

function sha1(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}
