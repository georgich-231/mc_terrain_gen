import * as THREE from "three";
import { LegacyRandom, PerlinSimplexNoise } from "deepslate";
import { getMinecraft26Biome } from "../worldgen/biomes26";
import { Block } from "../worldgen/blocks";
import type { VoxelWorld } from "../worldgen/types";
import { sampleMinecraft26ColorMap, type Minecraft26TextureAtlas } from "./minecraft26Textures";

const DEFAULT_BLEND_RADIUS = 2;
const SWAMP_NOISE = new PerlinSimplexNoise(new LegacyRandom(2345n), [0]);
const FOLIAGE_TINTED = new Set<Block>([
  Block.OakLeaves,
  Block.JungleLeaves,
  Block.AcaciaLeaves,
  Block.DarkOakLeaves,
  Block.MangroveLeaves,
  Block.Vine,
]);

export interface Minecraft26BiomeColorCache {
  grass: Uint32Array;
  foliage: Uint32Array;
  water: Uint32Array;
}

const WORLD_COLOR_CACHES = new WeakMap<VoxelWorld, {
  atlas: Minecraft26TextureAtlas;
  colors: Minecraft26BiomeColorCache;
}>();

export function getMinecraft26BiomeColorCache(
  world: VoxelWorld,
  atlas: Minecraft26TextureAtlas,
): Minecraft26BiomeColorCache {
  const cached = WORLD_COLOR_CACHES.get(world);
  if (cached?.atlas === atlas) return cached.colors;
  const colors = createMinecraft26BiomeColorCache(world, atlas);
  WORLD_COLOR_CACHES.set(world, { atlas, colors });
  return colors;
}

export function createMinecraft26BiomeColorCache(
  world: VoxelWorld,
  atlas: Minecraft26TextureAtlas,
): Minecraft26BiomeColorCache {
  const length = world.width * world.length;
  const cache: Minecraft26BiomeColorCache = {
    grass: new Uint32Array(length),
    foliage: new Uint32Array(length),
    water: new Uint32Array(length),
  };
  const paddedWidth = world.width + DEFAULT_BLEND_RADIUS * 2;
  const paddedLength = world.length + DEFAULT_BLEND_RADIUS * 2;
  const paddedSize = paddedWidth * paddedLength;
  const rawGrass = new Uint32Array(paddedSize);
  const rawFoliage = new Uint32Array(paddedSize);
  const rawWater = new Uint32Array(paddedSize);
  for (let paddedZ = 0; paddedZ < paddedLength; paddedZ += 1) {
    const localZ = paddedZ - DEFAULT_BLEND_RADIUS;
    const sampleZ = Math.max(0, Math.min(world.length - 1, localZ));
    for (let paddedX = 0; paddedX < paddedWidth; paddedX += 1) {
      const localX = paddedX - DEFAULT_BLEND_RADIUS;
      const sampleX = Math.max(0, Math.min(world.width - 1, localX));
      const biomeName = world.biomeMap[sampleZ * world.width + sampleX] || "plains";
      const index = paddedZ * paddedWidth + paddedX;
      const worldX = world.originX + localX;
      const worldZ = world.originZ + localZ;
      rawGrass[index] = biomeColor(biomeName, "grass", worldX, worldZ, atlas);
      rawFoliage[index] = biomeColor(biomeName, "foliage", worldX, worldZ, atlas);
      rawWater[index] = biomeColor(biomeName, "water", worldX, worldZ, atlas);
    }
  }
  for (let z = 0; z < world.length; z += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const column = z * world.width + x;
      cache.grass[column] = averagePaddedColors(rawGrass, paddedWidth, x, z);
      cache.foliage[column] = averagePaddedColors(rawFoliage, paddedWidth, x, z);
      cache.water[column] = averagePaddedColors(rawWater, paddedWidth, x, z);
    }
  }
  return cache;
}

function averagePaddedColors(colors: Uint32Array, stride: number, x: number, z: number): number {
  let red = 0;
  let green = 0;
  let blue = 0;
  const diameter = DEFAULT_BLEND_RADIUS * 2 + 1;
  for (let dz = 0; dz < diameter; dz += 1) {
    let index = (z + dz) * stride + x;
    for (let dx = 0; dx < diameter; dx += 1, index += 1) {
      const color = colors[index];
      red += color >> 16 & 255;
      green += color >> 8 & 255;
      blue += color & 255;
    }
  }
  const samples = diameter * diameter;
  return Math.trunc(red / samples) << 16 | Math.trunc(green / samples) << 8 | Math.trunc(blue / samples);
}

export function minecraft26TextureTintRgb(
  cache: Minecraft26BiomeColorCache,
  block: Block,
  faceIndex: number,
  column: number,
): number {
  if (block === Block.Grass && faceIndex !== 3) return 0xffffff;
  if (block === Block.Grass) return cache.grass[column];
  if (block === Block.Water) return cache.water[column];
  if (block === Block.SpruceLeaves) return 0x619961;
  if (block === Block.BirchLeaves) return 0x80a755;
  if (FOLIAGE_TINTED.has(block)) return cache.foliage[column];
  return 0xffffff;
}

export function minecraft26TextureTint(
  world: VoxelWorld,
  atlas: Minecraft26TextureAtlas,
  block: Block,
  faceIndex: number,
  localX: number,
  localZ: number,
): THREE.Color {
  if (block === Block.Grass && faceIndex !== 3) return new THREE.Color(1, 1, 1);
  if (block === Block.Grass) return colorFromRgb(averageBiomeColor(world, localX, localZ, "grass", atlas));
  if (block === Block.Water) return colorFromRgb(averageBiomeColor(world, localX, localZ, "water", atlas));
  if (block === Block.SpruceLeaves) return colorFromRgb(0x619961);
  if (block === Block.BirchLeaves) return colorFromRgb(0x80a755);
  if (FOLIAGE_TINTED.has(block)) return colorFromRgb(averageBiomeColor(world, localX, localZ, "foliage", atlas));
  return new THREE.Color(1, 1, 1);
}

export function minecraft26GrassSideOverlayTint(
  world: VoxelWorld,
  atlas: Minecraft26TextureAtlas,
  localX: number,
  localZ: number,
): THREE.Color {
  return colorFromRgb(averageBiomeColor(world, localX, localZ, "grass", atlas));
}

type TintKind = "grass" | "foliage" | "water";

function averageBiomeColor(
  world: VoxelWorld,
  localX: number,
  localZ: number,
  kind: TintKind,
  atlas: Minecraft26TextureAtlas,
): number {
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  for (let dz = -DEFAULT_BLEND_RADIUS; dz <= DEFAULT_BLEND_RADIUS; dz += 1) {
    for (let dx = -DEFAULT_BLEND_RADIUS; dx <= DEFAULT_BLEND_RADIUS; dx += 1) {
      const sampleX = Math.max(0, Math.min(world.width - 1, localX + dx));
      const sampleZ = Math.max(0, Math.min(world.length - 1, localZ + dz));
      const biomeName = world.biomeMap[sampleZ * world.width + sampleX] || "plains";
      const color = biomeColor(
        biomeName,
        kind,
        world.originX + localX + dx,
        world.originZ + localZ + dz,
        atlas,
      );
      red += color >> 16 & 255;
      green += color >> 8 & 255;
      blue += color & 255;
      samples += 1;
    }
  }
  return Math.trunc(red / samples) << 16 | Math.trunc(green / samples) << 8 | Math.trunc(blue / samples);
}

function biomeColor(
  biomeName: string,
  kind: TintKind,
  worldX: number,
  worldZ: number,
  atlas: Minecraft26TextureAtlas,
): number {
  const biome = getMinecraft26Biome(biomeName);
  const effects = biome.effects;
  if (kind === "water") return parseColor(effects.water_color, 0x3f76e4);
  if (kind === "foliage") {
    return effects.foliage_color !== undefined
      ? parseColor(effects.foliage_color, 0x48b518)
      : sampleMinecraft26ColorMap(atlas, "foliage", biome.temperature, biome.downfall);
  }

  let color = effects.grass_color !== undefined
    ? parseColor(effects.grass_color, 0x91bd59)
    : sampleMinecraft26ColorMap(atlas, "grass", biome.temperature, biome.downfall);
  if (effects.grass_color_modifier === "dark_forest") {
    color = ((color & 0xfefefe) + 0x28340a) >> 1;
  } else if (effects.grass_color_modifier === "swamp") {
    color = SWAMP_NOISE.sample(worldX * 0.0225, worldZ * 0.0225, false) < -0.1 ? 0x4c763c : 0x6a7039;
  }
  return color;
}

function parseColor(value: unknown, fallback: number): number {
  if (typeof value === "number") return value & 0xffffff;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/^#/, ""), 16);
    if (Number.isFinite(parsed)) return parsed & 0xffffff;
  }
  return fallback;
}

function colorFromRgb(rgb: number): THREE.Color {
  return new THREE.Color(rgb);
}
