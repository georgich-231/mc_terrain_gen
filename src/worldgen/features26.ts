// Generated registries extracted from the user's local official 26.2 server.
// @ts-expect-error generated JavaScript asset intentionally has no declaration file
import { MINECRAFT_26_2_FEATURES } from "../generated/minecraft26FeatureData.js";
// @ts-expect-error generated JavaScript asset intentionally has no declaration file
import { MINECRAFT_26_2_BIOMES } from "../generated/minecraft26BiomeData.js";
import { listMinecraft26OverworldBiomesInGenerationOrder } from "./minecraft26BiomeSource.js";

export type Minecraft26Json = string | number | boolean | null | Minecraft26Json[] | { [key: string]: Minecraft26Json };
export type Minecraft26JsonObject = { [key: string]: Minecraft26Json };

interface FeatureRegistryData {
  configuredFeatures: Record<string, Minecraft26JsonObject>;
  placedFeatures: Record<string, Minecraft26JsonObject>;
}

interface BiomeRegistryData {
  biomes: Record<string, { features?: string[][] }>;
}

export interface Minecraft26StepFeature {
  id: string;
  index: number;
  step: number;
}

const FEATURE_DATA = MINECRAFT_26_2_FEATURES as FeatureRegistryData;
const BIOME_DATA = MINECRAFT_26_2_BIOMES as BiomeRegistryData;
let cachedSteps: readonly (readonly Minecraft26StepFeature[])[] | undefined;

export function getMinecraft26ConfiguredFeature(id: string): Minecraft26JsonObject | undefined {
  return FEATURE_DATA.configuredFeatures[normalizeId(id)];
}

export function getMinecraft26PlacedFeature(id: string): Minecraft26JsonObject | undefined {
  return FEATURE_DATA.placedFeatures[normalizeId(id)];
}

export function getMinecraft26BiomeFeatureSteps(biome: string): readonly (readonly string[])[] {
  return BIOME_DATA.biomes[normalizeId(biome)]?.features ?? [];
}

export function minecraft26BiomeHasFeature(biome: string, featureId: string): boolean {
  const normalized = normalizeId(featureId);
  return getMinecraft26BiomeFeatureSteps(biome).some((step) => step.includes(normalized));
}

/**
 * Reproduces FeatureSorter.buildFeaturesPerStep. The resulting index is the
 * value mixed into Minecraft's independent random seed for a feature.
 */
export function getMinecraft26FeaturesPerStep(): readonly (readonly Minecraft26StepFeature[])[] {
  if (cachedSteps) return cachedSteps;

  type Node = { id: string; encounter: number; step: number };
  const encounterById = new Map<string, number>();
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Set<string>>();
  let nextEncounter = 0;
  let stepCount = 0;

  const compare = (a: Node, b: Node) => a.step - b.step || a.encounter - b.encounter;
  for (const biome of listMinecraft26OverworldBiomesInGenerationOrder()) {
    const flattened: Node[] = [];
    const steps = getMinecraft26BiomeFeatureSteps(biome);
    stepCount = Math.max(stepCount, steps.length);
    for (let step = 0; step < steps.length; step += 1) {
      for (const rawId of steps[step]) {
        const id = normalizeId(rawId);
        let encounter = encounterById.get(id);
        if (encounter === undefined) {
          encounter = nextEncounter;
          nextEncounter += 1;
          encounterById.set(id, encounter);
        }
        const key = `${step}:${id}`;
        let node = nodes.get(key);
        if (!node) {
          node = { id, encounter, step };
          nodes.set(key, node);
          edges.set(key, new Set());
        }
        flattened.push(node);
      }
    }
    for (let index = 0; index + 1 < flattened.length; index += 1) {
      edges.get(nodeKey(flattened[index]))?.add(nodeKey(flattened[index + 1]));
    }
  }

  const sortedNodes = [...nodes.values()].sort(compare);
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const postOrder: Node[] = [];
  const visit = (node: Node): void => {
    const key = nodeKey(node);
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error("Minecraft 26.2 feature order contains a cycle");
    visiting.add(key);
    const children = [...(edges.get(key) ?? [])]
      .map((child) => nodes.get(child))
      .filter((child): child is Node => child !== undefined)
      .sort(compare);
    for (const child of children) visit(child);
    visiting.delete(key);
    visited.add(key);
    postOrder.push(node);
  };
  for (const node of sortedNodes) visit(node);
  postOrder.reverse();

  const steps: Minecraft26StepFeature[][] = Array.from({ length: stepCount }, () => []);
  for (const node of postOrder) {
    const features = steps[node.step];
    features.push({ id: node.id, index: features.length, step: node.step });
  }
  cachedSteps = Object.freeze(steps.map((step) => Object.freeze(step.map((feature) => Object.freeze(feature)))));
  return cachedSteps;
}

function nodeKey(node: { id: string; step: number }): string {
  return `${node.step}:${node.id}`;
}

function normalizeId(id: string): string {
  return id.includes(":") ? id : `minecraft:${id}`;
}
