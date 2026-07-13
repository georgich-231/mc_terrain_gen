import {
  BlockPos,
  BlockState,
  Chunk,
  ChunkPos,
  DensityFunction,
  Identifier,
  NoiseChunk,
  NoiseChunkGenerator,
  NoiseGeneratorSettings,
  RandomState,
  SurfaceContext,
  WorldgenRegistries,
  clampedMap,
} from "deepslate";
import { Block, blockIdFromMinecraftName } from "./blocks";
import type { VoxelWorld } from "./types";

// Generated from the official 26.2 server JAR by the user's local extraction tool.
// @ts-expect-error generated JavaScript asset intentionally has no declaration file
import { MINECRAFT_26_2_WORLDGEN } from "../generated/minecraft26WorldgenData.js";
// @ts-expect-error local JavaScript port of the 26.2 OverworldBiomeBuilder table
import { createMinecraft26OverworldBiomeParameters, sampleMinecraft26SurfaceBiome } from "./minecraft26BiomeSource.js";

export const MODERN_26_2 = Object.freeze({
  version: "26.2" as const,
  minY: -64,
  height: 384,
  maxY: 319,
  seaLevel: 63,
  cellWidth: 4,
  cellHeight: 8,
});

export interface ModernGenerateOptions {
  seed: bigint;
  size: number;
  startChunkX?: number;
  startChunkZ?: number;
  onProgress?: (stage: string, progress: number) => void;
}

function ensureRegistries(): ReturnType<typeof NoiseGeneratorSettings.fromJson> {
  // Density cache wrappers are stateful. Reparse the settings for each region
  // so output depends only on seed and absolute coordinates, never on which
  // region happened to run earlier in the same worker.
  WorldgenRegistries.NOISE.clear();
  WorldgenRegistries.DENSITY_FUNCTION.clear();
  for (const [resourceId, json] of MINECRAFT_26_2_WORLDGEN.noise) {
    const id = Identifier.parse(resourceId);
    WorldgenRegistries.NOISE.register(id, () => WorldgenRegistries.NOISE.parse(json));
  }
  for (const [resourceId, json] of MINECRAFT_26_2_WORLDGEN.densityFunctions) {
    const id = Identifier.parse(resourceId);
    const compatibleJson = expandIntervalSelect(json);
    WorldgenRegistries.DENSITY_FUNCTION.register(id, () => WorldgenRegistries.DENSITY_FUNCTION.parse(compatibleJson));
  }
  return withoutKnownRouterWarning(() => NoiseGeneratorSettings.fromJson(expandIntervalSelect(MINECRAFT_26_2_WORLDGEN.settings)));
}

export function generateModern26World(options: ModernGenerateOptions): VoxelWorld {
  if (options.size < 16 || options.size % 16 !== 0) throw new RangeError("World size must be a multiple of 16");
  const report = (stage: string, progress: number) => options.onProgress?.(stage, Math.max(0, Math.min(1, progress)));
  const biomeParameters = createMinecraft26OverworldBiomeParameters();
  const chunksAcross = options.size / 16;
  const startChunkX = options.startChunkX ?? -Math.floor(chunksAcross / 2);
  const startChunkZ = options.startChunkZ ?? -Math.floor(chunksAcross / 2);
  const originX = startChunkX * 16;
  const originZ = startChunkZ * 16;
  const oneY = options.size * options.size;
  const blocks = new Uint8Array(oneY * MODERN_26_2.height);
  const heightmap = new Int16Array(oneY);
  heightmap.fill(MODERN_26_2.minY);
  const biomeMap = new Array<string>(oneY).fill("plains");
  const chunks: Array<{ chunk: Chunk; noiseChunk: NoiseChunk }> = [];
  let completed = 0;
  const totalChunks = chunksAcross * chunksAcross;

  report("Wiring Minecraft 26.2 noise router", 0.02);
  for (let localChunkZ = 0; localChunkZ < chunksAcross; localChunkZ += 1) {
    for (let localChunkX = 0; localChunkX < chunksAcross; localChunkX += 1) {
      const chunkX = startChunkX + localChunkX;
      const chunkZ = startChunkZ + localChunkZ;
      const chunk = new Chunk(MODERN_26_2.minY, MODERN_26_2.height, ChunkPos.create(chunkX, chunkZ));
      // deepslate's parsed density holders contain cache wrappers that retain
      // traversal state. Rebuild the settings and mapped router per chunk so
      // output is determined only by seed and absolute coordinates.
      const chunkSettings = ensureRegistries();
      const generator = new NoiseChunkGenerator({ getBiome: () => Identifier.parse("minecraft:plains") }, chunkSettings);
      const randomState = withoutKnownRouterWarning(() => new RandomState(chunkSettings, options.seed));
      generator.fill(randomState, chunk);
      const noiseChunk = (generator as unknown as { getOrCreateNoiseChunk(state: RandomState, target: Chunk): NoiseChunk })
        .getOrCreateNoiseChunk(randomState, chunk);
      applyOreVeins(chunk, randomState);
      buildFullSurface(chunk, noiseChunk, randomState, chunkSettings, biomeParameters);
      chunks.push({ chunk, noiseChunk });
      completed += 1;
      report("Generating density, caves, and surfaces", 0.04 + (completed / totalChunks) * 0.78);
    }
  }

  report("Packing voxel world", 0.84);
  const biomeSettings = ensureRegistries();
  const biomeRandomState = withoutKnownRouterWarning(() => new RandomState(biomeSettings, options.seed));
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const { chunk } = chunks[chunkIndex];
    const chunkOriginX = ChunkPos.minBlockX(chunk.pos);
    const chunkOriginZ = ChunkPos.minBlockZ(chunk.pos);
    for (let z = 0; z < 16; z += 1) {
      const worldZ = chunkOriginZ + z;
      const localZ = worldZ - originZ;
      for (let x = 0; x < 16; x += 1) {
        const worldX = chunkOriginX + x;
        const localX = worldX - originX;
        const column = localZ * options.size + localX;
        let topSolid = MODERN_26_2.minY;
        for (let y = MODERN_26_2.minY; y <= MODERN_26_2.maxY; y += 1) {
          const state = chunk.getBlockState(BlockPos.create(worldX, y, worldZ));
          const block = blockIdFromMinecraftName(state.getName().toString());
          blocks[(y - MODERN_26_2.minY) * oneY + column] = block;
          if (block !== Block.Air && block !== Block.Water && block !== Block.Lava) topSolid = y;
        }
        heightmap[column] = topSolid;
        biomeMap[column] = sampleMinecraft26SurfaceBiome(
          biomeParameters,
          biomeRandomState.sampler,
          worldX,
          topSolid,
          worldZ,
        );
      }
    }
    report("Packing voxel world", 0.84 + ((chunkIndex + 1) / chunks.length) * 0.15);
  }
  report("Complete", 1);

  return {
    blocks,
    heightmap,
    biomeMap,
    width: options.size,
    height: MODERN_26_2.height,
    length: options.size,
    minY: MODERN_26_2.minY,
    maxY: MODERN_26_2.maxY,
    seaLevel: MODERN_26_2.seaLevel,
    seed: options.seed.toString(),
    version: MODERN_26_2.version,
    originX,
    originZ,
  };
}

function buildFullSurface(
  chunk: Chunk,
  noiseChunk: NoiseChunk,
  randomState: RandomState,
  settings: ReturnType<typeof NoiseGeneratorSettings.fromJson>,
  biomeParameters: ReturnType<typeof createMinecraft26OverworldBiomeParameters>,
): void {
  const system = randomState.surfaceSystem;
  const getBiome = (pos: BlockPos): string => sampleMinecraft26SurfaceBiome(
    biomeParameters,
    randomState.sampler,
    pos[0],
    pos[1],
    pos[2],
  );
  const context = new SurfaceContext(system, chunk, noiseChunk, settings.noise, getBiome);
  const surfaceAccess = system as unknown as {
    rule: (value: SurfaceContext) => (x: number, y: number, z: number) => BlockState | undefined;
    getRandom: (name: string) => unknown;
    random: {
      fromHashOf: (name: string) => {
        forkPositional: () => { at: (x: number, y: number, z: number) => { nextFloat: () => number } };
      };
    };
  };
  const ruleFactory = surfaceAccess.rule;
  const rule = ruleFactory(context);
  const minX = ChunkPos.minBlockX(chunk.pos);
  const minZ = ChunkPos.minBlockZ(chunk.pos);
  const originalGetRandom = surfaceAccess.getRandom;
  const positionalRules = new Map<string, { nextFloat: () => number }>();

  // deepslate 0.26 evaluates vertical-gradient surface randomness from a
  // shared sequential stream. Mojang uses randomFactory.at(x, y, z), so the
  // sequential implementation changes blocks when chunk traversal order or
  // worker tiling changes. Route those rule samples through absolute block
  // coordinates to match the official readable 26.2 implementation.
  surfaceAccess.getRandom = (name: string) => {
    let random = positionalRules.get(name);
    if (!random) {
      const factory = surfaceAccess.random.fromHashOf(name).forkPositional();
      random = {
        nextFloat: () => factory.at(context.blockX, context.blockY, context.blockZ).nextFloat(),
      };
      positionalRules.set(name, random);
    }
    return random;
  };

  try {
    for (let offsetX = 0; offsetX < 16; offsetX += 1) {
      const x = minX + offsetX;
      for (let offsetZ = 0; offsetZ < 16; offsetZ += 1) {
        const z = minZ + offsetZ;
        context.updateXZ(x, z);
        let stoneDepthAbove = 0;
        let waterHeight = Number.MIN_SAFE_INTEGER;
        let stoneFloor = Number.MAX_SAFE_INTEGER;
        for (let y = chunk.maxY - 1; y >= chunk.minY; y -= 1) {
          const pos = BlockPos.create(x, y, z);
          const state = chunk.getBlockState(pos);
          if (state.equals(BlockState.AIR)) {
            stoneDepthAbove = 0;
            waterHeight = Number.MIN_SAFE_INTEGER;
            continue;
          }
          if (state.isFluid()) {
            if (waterHeight === Number.MIN_SAFE_INTEGER) waterHeight = y + 1;
            continue;
          }
          if (stoneFloor >= y) {
            stoneFloor = Number.MIN_SAFE_INTEGER;
            for (let belowY = y - 1; belowY >= chunk.minY; belowY -= 1) {
              const below = chunk.getBlockState(BlockPos.create(x, belowY, z));
              if (below.equals(BlockState.AIR) || below.isFluid()) {
                stoneFloor = belowY + 1;
                break;
              }
            }
          }
          stoneDepthAbove += 1;
          const stoneDepthBelow = y - stoneFloor + 1;
          if (!state.equals(settings.defaultBlock)) continue;
          context.updateY(stoneDepthAbove, stoneDepthBelow, waterHeight, y);
          const replacement = rule(x, y, z);
          if (replacement) chunk.setBlockState(pos, replacement);
        }
      }
    }
  } finally {
    surfaceAccess.getRandom = originalGetRandom;
  }
}

function applyOreVeins(chunk: Chunk, randomState: RandomState): void {
  const { veinToggle, veinRidged, veinGap } = randomState.router;
  const minX = ChunkPos.minBlockX(chunk.pos);
  const minZ = ChunkPos.minBlockZ(chunk.pos);
  for (let y = -60; y <= 50; y += 1) {
    for (let z = minZ; z < minZ + 16; z += 1) {
      for (let x = minX; x < minX + 16; x += 1) {
        const pos = BlockPos.create(x, y, z);
        if (!chunk.getBlockState(pos).equals(BlockState.STONE)) continue;
        const context = DensityFunction.context(x, y, z);
        const toggle = veinToggle.compute(context);
        const copper = toggle > 0;
        const minY = copper ? 0 : -60;
        const maxY = copper ? 50 : -8;
        const edge = Math.min(maxY - y, y - minY);
        if (edge < 0) continue;
        const edgeRoundoff = clampedMap(edge, 0, 20, -0.2, 0);
        const richnessSignal = Math.abs(toggle);
        if (richnessSignal + edgeRoundoff < 0.4000000059604645) continue;
        const random = randomState.oreRandom.at(x, y, z);
        if (random.nextFloat() > 0.7 || veinRidged.compute(context) >= 0) continue;
        const richness = clampedMap(richnessSignal, 0.4000000059604645, 0.6000000238418579, 0.10000000149011612, 0.30000001192092896);
        let blockName: string;
        if (random.nextFloat() < richness && veinGap.compute(context) > -0.30000001192092896) {
          const raw = random.nextFloat() < 0.02;
          blockName = copper
            ? raw ? "minecraft:raw_copper_block" : "minecraft:copper_ore"
            : raw ? "minecraft:raw_iron_block" : "minecraft:deepslate_iron_ore";
        } else {
          blockName = copper ? "minecraft:granite" : "minecraft:tuff";
        }
        chunk.setBlockState(pos, new BlockState(blockName));
      }
    }
  }
}

export function worldChecksum(blocks: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const block of blocks) {
    hash ^= block;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function withoutKnownRouterWarning<T>(action: () => T): T {
  const previousWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).startsWith("Creating a max function between two non-overlapping inputs")) return;
    previousWarn(...args);
  };
  try {
    return action();
  } finally {
    console.warn = previousWarn;
  }
}

/** Converts Java 26.2's interval_select node into equivalent range_choice nodes. */
function expandIntervalSelect(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expandIntervalSelect);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  if (source.type === "minecraft:interval_select") {
    const input = expandIntervalSelect(source.input);
    const functions = Array.isArray(source.functions) ? source.functions.map(expandIntervalSelect) : [];
    const thresholds = Array.isArray(source.thresholds) ? source.thresholds.map(Number) : [];
    if (functions.length !== thresholds.length + 1 || functions.length === 0) return 0;
    let result: unknown = functions[functions.length - 1];
    for (let index = thresholds.length - 1; index >= 0; index -= 1) {
      result = {
        type: "minecraft:range_choice",
        input,
        min_inclusive: index === 0 ? -1_000_000 : thresholds[index - 1],
        max_exclusive: thresholds[index],
        when_in_range: functions[index],
        when_out_of_range: result,
      };
    }
    return result;
  }
  return Object.fromEntries(Object.entries(source).map(([key, child]) => [key, expandIntervalSelect(child)]));
}
