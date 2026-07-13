import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION = "26.2";
const EXPECTED_CLIENT_SHA1 = "2dc72797acbc1b63fc16a11c4ac393605f453754";
const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run assets:extract-textures -- /path/to/minecraft-26.2-client.jar");
  process.exit(1);
}

const clientJar = resolve(input);
const bytes = readFileSync(clientJar);
const sha1 = createHash("sha1").update(bytes).digest("hex");
if (sha1 !== EXPECTED_CLIENT_SHA1) {
  throw new Error(`Expected the official Minecraft Java ${VERSION} client SHA-1 ${EXPECTED_CLIENT_SHA1}, received ${sha1}`);
}

const output = resolve("public/minecraft26");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
execFileSync("unzip", [
  "-oq",
  clientJar,
  "assets/minecraft/textures/block/*",
  "assets/minecraft/textures/colormap/*",
  "assets/minecraft/models/block/*",
  "assets/minecraft/blockstates/*",
  "-d",
  output,
]);
writeFileSync(resolve(output, "source.json"), `${JSON.stringify({
  version: VERSION,
  clientSha1: sha1,
  notice: "Local files extracted from the user's official Minecraft client. Do not redistribute.",
}, null, 2)}\n`);
console.log(`Extracted Minecraft Java ${VERSION} block textures, colormaps, and models to ${output}`);
