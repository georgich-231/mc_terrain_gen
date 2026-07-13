import {
  BlockState,
  Identifier,
  LegacyRandom,
  PerlinSimplexNoise,
  type RandomState,
  type SurfaceContext,
} from "deepslate";
import { getMinecraft26Biome, normalizeBiomeId } from "./biomes26";
import { positionalRandomFromHash } from "./random26";

type JsonObject = Record<string, unknown>;
type SurfaceRule = (x: number, y: number, z: number) => BlockState | undefined;
type SurfaceCondition = () => boolean;

const TEMPERATURE_NOISE = new PerlinSimplexNoise(new LegacyRandom(1234n), [0]);
const FROZEN_TEMPERATURE_NOISE = new PerlinSimplexNoise(new LegacyRandom(3456n), [-2, -1, 0]);
const BIOME_INFO_NOISE = new PerlinSimplexNoise(new LegacyRandom(2345n), [0]);
const TERRACOTTA = new BlockState("minecraft:terracotta");

/** Compiles every surface-rule and condition type present in Java 26.2. */
export function createMinecraft26SurfaceRule(
  source: unknown,
  context: SurfaceContext,
  randomState: RandomState,
  worldSurfaceHeights: Int16Array,
): SurfaceRule {
  const positionalRandoms = new Map<string, ReturnType<typeof positionalRandomFromHash>>();

  const compileRule = (value: unknown): SurfaceRule => {
    const rule = asObject(value, "surface rule");
    switch (typeName(rule)) {
      case "block": {
        const state = BlockState.fromJson(rule.result_state);
        return () => state;
      }
      case "sequence": {
        const rules = asArray(rule.sequence, "surface sequence").map(compileRule);
        return (x, y, z) => {
          for (const child of rules) {
            const state = child(x, y, z);
            if (state) return state;
          }
          return undefined;
        };
      }
      case "condition": {
        const condition = compileCondition(rule.if_true);
        const next = compileRule(rule.then_run);
        return (x, y, z) => condition() ? next(x, y, z) : undefined;
      }
      case "bandlands":
        // The terrain lab intentionally represents every dyed terracotta state
        // with one Terracotta voxel ID. Band placement is therefore preserved
        // while the cosmetic dye variant is normalized at the block palette.
        return () => TERRACOTTA;
      default:
        throw new Error(`Unsupported Minecraft 26.2 surface rule: ${String(rule.type)}`);
    }
  };

  const compileCondition = (value: unknown): SurfaceCondition => {
    const condition = asObject(value, "surface condition");
    switch (typeName(condition)) {
      case "above_preliminary_surface":
        return () => context.blockY >= context.minSurfaceLevel();
      case "biome": {
        const values = Array.isArray(condition.biome_is) ? condition.biome_is : [condition.biome_is];
        const biomes = new Set(values.map((biome) => normalizeBiomeId(asString(biome, "biome ID"))));
        return () => biomes.has(normalizeBiomeId(context.biome()));
      }
      case "not": {
        const inverted = compileCondition(condition.invert);
        return () => !inverted();
      }
      case "stone_depth": {
        const offset = asNumber(condition.offset, 0);
        const addSurfaceDepth = asBoolean(condition.add_surface_depth, false);
        const secondaryRange = asNumber(condition.secondary_depth_range, 0);
        const ceiling = condition.surface_type === "ceiling";
        return () => {
          const depth = ceiling ? context.stoneDepthBelow : context.stoneDepthAbove;
          const surfaceDepth = addSurfaceDepth ? context.surfaceDepth : 0;
          const secondaryDepth = secondaryRange === 0
            ? 0
            : Math.trunc(((context.surfaceSecondary() + 1) / 2) * secondaryRange);
          return depth <= 1 + offset + surfaceDepth + secondaryDepth;
        };
      }
      case "vertical_gradient": {
        const name = asString(condition.random_name, "surface random name");
        const trueAtAndBelow = resolveAnchor(condition.true_at_and_below, context);
        const falseAtAndAbove = resolveAnchor(condition.false_at_and_above, context);
        let factory = positionalRandoms.get(name);
        if (!factory) {
          factory = positionalRandomFromHash(randomState.random, name);
          positionalRandoms.set(name, factory);
        }
        return () => {
          if (context.blockY <= trueAtAndBelow) return true;
          if (context.blockY >= falseAtAndAbove) return false;
          const chance = (falseAtAndAbove - context.blockY) / (falseAtAndAbove - trueAtAndBelow);
          return factory!.at(context.blockX, context.blockY, context.blockZ).nextFloat() < chance;
        };
      }
      case "water": {
        const offset = asNumber(condition.offset, 0);
        const multiplier = asNumber(condition.surface_depth_multiplier, 0);
        const addStoneDepth = asBoolean(condition.add_stone_depth, false);
        return () => context.waterHeight === Number.MIN_SAFE_INTEGER
          || context.blockY + (addStoneDepth ? context.stoneDepthAbove : 0)
            >= context.waterHeight + offset + context.surfaceDepth * multiplier;
      }
      case "y_above": {
        const anchor = resolveAnchor(condition.anchor, context);
        const multiplier = asNumber(condition.surface_depth_multiplier, 0);
        const addStoneDepth = asBoolean(condition.add_stone_depth, false);
        return () => context.blockY + (addStoneDepth ? context.stoneDepthAbove : 0)
          >= anchor + context.surfaceDepth * multiplier;
      }
      case "noise_threshold": {
        const noiseId = Identifier.parse(asString(condition.noise, "surface noise ID"));
        const noise = randomState.getOrCreateNoise(noiseId);
        const min = asNumber(condition.min_threshold, 0);
        const max = asNumber(condition.max_threshold, 0);
        const is3d = asBoolean(condition.is_3d, false);
        let lastX = Number.NaN;
        let lastY = Number.NaN;
        let lastZ = Number.NaN;
        let lastValue = 0;
        return () => {
          const y = is3d ? context.blockY : 0;
          if (lastX !== context.blockX || lastY !== y || lastZ !== context.blockZ) {
            lastX = context.blockX;
            lastY = y;
            lastZ = context.blockZ;
            lastValue = noise.sample(lastX, lastY, lastZ);
          }
          return lastValue >= min && lastValue <= max;
        };
      }
      case "hole":
        return () => context.surfaceDepth <= 0;
      case "steep":
        return () => isSteep(context.blockX, context.blockZ, worldSurfaceHeights);
      case "temperature":
        return () => coldEnoughToSnow(context.biome(), context.blockX, context.blockY, context.blockZ);
      default:
        throw new Error(`Unsupported Minecraft 26.2 surface condition: ${String(condition.type)}`);
    }
  };

  return compileRule(source);
}

function isSteep(worldX: number, worldZ: number, heights: Int16Array): boolean {
  const x = worldX & 15;
  const z = worldZ & 15;
  const north = heights[Math.max(z - 1, 0) * 16 + x];
  const south = heights[Math.min(z + 1, 15) * 16 + x];
  if (south >= north + 4) return true;
  const west = heights[z * 16 + Math.max(x - 1, 0)];
  const east = heights[z * 16 + Math.min(x + 1, 15)];
  return west >= east + 4;
}

export function minecraft26TemperatureAt(biomeName: string, x: number, y: number, z: number): number {
  const biome = getMinecraft26Biome(biomeName);
  let temperature = Math.fround(biome.temperature);
  if (biome.temperature_modifier === "frozen") {
    const large = FROZEN_TEMPERATURE_NOISE.sample(x * 0.05, z * 0.05, false) * 7;
    const edge = BIOME_INFO_NOISE.sample(x * 0.2, z * 0.2, false);
    if (large + edge < 0.3 && BIOME_INFO_NOISE.sample(x * 0.09, z * 0.09, false) < 0.8) {
      temperature = Math.fround(0.2);
    }
  }
  const snowLevel = 80;
  if (y > snowLevel) {
    const variation = Math.fround(TEMPERATURE_NOISE.sample(x / 8, z / 8, false) * 8);
    const altitude = Math.fround(variation + y - snowLevel);
    const cooling = Math.fround(Math.fround(altitude * Math.fround(0.05)) / Math.fround(40));
    temperature = Math.fround(temperature - cooling);
  }
  return temperature;
}

export function coldEnoughToSnow(biomeName: string, x: number, y: number, z: number): boolean {
  return minecraft26TemperatureAt(biomeName, x, y, z) < Math.fround(0.15);
}

function resolveAnchor(value: unknown, context: SurfaceContext): number {
  const anchor = asObject(value, "vertical anchor");
  if (typeof anchor.absolute === "number") return Math.trunc(anchor.absolute);
  if (typeof anchor.above_bottom === "number") return context.context.minY + Math.trunc(anchor.above_bottom);
  if (typeof anchor.below_top === "number") return context.context.minY + context.context.height - 1 - Math.trunc(anchor.below_top);
  throw new Error(`Invalid Minecraft 26.2 vertical anchor: ${JSON.stringify(value)}`);
}

function typeName(value: JsonObject): string {
  return asString(value.type, "surface type").replace(/^minecraft:/, "");
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`Invalid ${label}`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`Invalid ${label}`);
  return value;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
