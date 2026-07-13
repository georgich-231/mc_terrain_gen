export interface Minecraft26Spawner {
  type: string;
  weight: number;
  minCount: number;
  maxCount: number;
}

export interface Minecraft26SpawnCost {
  energy_budget: number;
  charge: number;
}

export interface Minecraft26BiomeDefinition {
  temperature: number;
  temperature_modifier?: "none" | "frozen";
  downfall: number;
  has_precipitation: boolean;
  attributes: Record<string, unknown>;
  effects: Record<string, unknown>;
  carvers: string[];
  features: string[][];
  spawn_costs: Record<string, Minecraft26SpawnCost>;
  spawners: Record<string, Minecraft26Spawner[]>;
}

// @ts-expect-error generated JavaScript asset intentionally has no declaration file
import { MINECRAFT_26_2_BIOMES } from "../generated/minecraft26BiomeData.js";

const BIOMES = MINECRAFT_26_2_BIOMES.biomes as Readonly<Record<string, Minecraft26BiomeDefinition>>;

export const MINECRAFT_26_2_BIOME_REGISTRY = Object.freeze({
  version: MINECRAFT_26_2_BIOMES.version as "26.2",
  worldVersion: MINECRAFT_26_2_BIOMES.worldVersion as number,
  dataPackVersion: MINECRAFT_26_2_BIOMES.dataPackVersion as string,
  sourceSha1: MINECRAFT_26_2_BIOMES.sourceSha1 as string,
  biomes: BIOMES,
});

export function getMinecraft26Biome(name: string): Minecraft26BiomeDefinition {
  const id = normalizeBiomeId(name);
  const biome = BIOMES[id];
  if (!biome) throw new RangeError(`Unknown Minecraft Java 26.2 biome: ${name}`);
  return biome;
}

export function getMinecraft26SpawnEntries(biomeName: string, category: string): readonly Minecraft26Spawner[] {
  return getMinecraft26Biome(biomeName).spawners[category] ?? [];
}

export function getMinecraft26SpawnCost(biomeName: string, entityType: string): Minecraft26SpawnCost | undefined {
  return getMinecraft26Biome(biomeName).spawn_costs[normalizeBiomeId(entityType)];
}

export function normalizeBiomeId(name: string): string {
  return name.includes(":") ? name : `minecraft:${name}`;
}
