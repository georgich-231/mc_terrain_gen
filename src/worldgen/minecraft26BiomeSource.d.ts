import type { Climate } from "deepslate/worldgen";

export interface Minecraft26BiomeParameters {
  readonly things: readonly unknown[];
}

export function createMinecraft26OverworldBiomeParameters(): Minecraft26BiomeParameters;
export function listMinecraft26OverworldBiomes(): readonly string[];
export function listMinecraft26OverworldBiomesInGenerationOrder(): readonly string[];
export function sampleMinecraft26NoiseBiome(
  parameters: Minecraft26BiomeParameters,
  sampler: Climate.Sampler,
  quartX: number,
  quartY: number,
  quartZ: number,
): string;
export function sampleMinecraft26SurfaceBiome(
  parameters: Minecraft26BiomeParameters,
  sampler: Climate.Sampler,
  zoomSeed: bigint,
  x: number,
  y: number,
  z: number,
): string;
export function obfuscateMinecraft26BiomeSeed(seed: bigint): bigint;
