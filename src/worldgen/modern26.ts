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
import { installMinecraft26Aquifer } from "./aquifer26";
import { installMinecraft26PositionalRandoms } from "./random26";
import { createMinecraft26SurfaceRule } from "./surface26";
import { extendMinecraft26ErodedBadlands, extendMinecraft26FrozenOcean } from "./surfaceExtensions26";
import type { VoxelWorld } from "./types";

// Generated from the official 26.2 server JAR by the user's local extraction tool.
// @ts-expect-error generated JavaScript asset intentionally has no declaration file
import { MINECRAFT_26_2_WORLDGEN } from "../generated/minecraft26WorldgenData.js";
import {
  createMinecraft26OverworldBiomeParameters,
  obfuscateMinecraft26BiomeSeed,
  sampleMinecraft26SurfaceBiome,
} from "./minecraft26BiomeSource.js";

export const MODERN_26_2 = Object.freeze({
  version: "26.2" as const,
  minY: -64,
  height: 384,
  maxY: 319,
  seaLevel: 63,
  cellWidth: 4,
  cellHeight: 8,
});

// interval_select is immutable generated JSON. Converting it once at module
// load avoids rebuilding the same large object graph for every chunk while
// still reparsing fresh stateful density/cache wrappers below.
const COMPATIBLE_DENSITY_FUNCTIONS = MINECRAFT_26_2_WORLDGEN.densityFunctions.map(
  ([resourceId, json]: [string, unknown]) => [resourceId, expandIntervalSelect(json)] as const,
);
const COMPATIBLE_SETTINGS = expandIntervalSelect(MINECRAFT_26_2_WORLDGEN.settings);

export interface ModernGenerateOptions {
  seed: bigint;
  size: number;
  startChunkX?: number;
  startChunkZ?: number;
  onProgress?: (stage: string, progress: number) => void;
}

export function createModern26BiomeSampler(seed: bigint): (x: number, y: number, z: number) => string {
  const parameters = createMinecraft26OverworldBiomeParameters();
  const settings = ensureRegistries();
  const randomState = withoutKnownRouterWarning(() => new RandomState(settings, seed));
  installMinecraft26PositionalRandoms(randomState);
  const zoomSeed = obfuscateMinecraft26BiomeSeed(seed);
  return (x, y, z) => sampleMinecraft26SurfaceBiome(parameters, randomState.sampler, zoomSeed, x, y, z);
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
  for (const [resourceId, compatibleJson] of COMPATIBLE_DENSITY_FUNCTIONS) {
    const id = Identifier.parse(resourceId);
    WorldgenRegistries.DENSITY_FUNCTION.register(id, () => WorldgenRegistries.DENSITY_FUNCTION.parse(compatibleJson));
  }
  return withoutKnownRouterWarning(() => NoiseGeneratorSettings.fromJson(COMPATIBLE_SETTINGS));
}

export function generateModern26World(options: ModernGenerateOptions): VoxelWorld {
  if (options.size < 16 || options.size % 16 !== 0) throw new RangeError("World size must be a multiple of 16");
  const report = (stage: string, progress: number) => options.onProgress?.(stage, Math.max(0, Math.min(1, progress)));
  const biomeParameters = createMinecraft26OverworldBiomeParameters();
  const biomeZoomSeed = obfuscateMinecraft26BiomeSeed(options.seed);
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
      installMinecraft26PositionalRandoms(randomState);
      const noiseChunk = (generator as unknown as { getOrCreateNoiseChunk(state: RandomState, target: Chunk): NoiseChunk })
        .getOrCreateNoiseChunk(randomState, chunk);
      installMinecraft26Aquifer(noiseChunk, randomState, chunkSettings);
      generator.fill(randomState, chunk);
      applyOreVeins(chunk, randomState);
      buildFullSurface(chunk, noiseChunk, randomState, chunkSettings, biomeParameters, biomeZoomSeed);
      packChunk(
        chunk,
        blocks,
        heightmap,
        biomeMap,
        options.size,
        oneY,
        originX,
        originZ,
        biomeParameters,
        randomState,
        biomeZoomSeed,
      );
      completed += 1;
      report("Generating and packing exact chunks", 0.04 + (completed / totalChunks) * 0.95);
    }
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

const PACKED_BLOCK_IDS = new Map<string, Block>();

function packChunk(
  chunk: Chunk,
  blocks: Uint8Array,
  heightmap: Int16Array,
  biomeMap: string[],
  size: number,
  oneY: number,
  originX: number,
  originZ: number,
  biomeParameters: ReturnType<typeof createMinecraft26OverworldBiomeParameters>,
  biomeRandomState: RandomState,
  biomeZoomSeed: bigint,
): void {
  const chunkOriginX = ChunkPos.minBlockX(chunk.pos);
  const chunkOriginZ = ChunkPos.minBlockZ(chunk.pos);
  const offsetX = chunkOriginX - originX;
  const offsetZ = chunkOriginZ - originZ;
  for (let sectionIndex = 0; sectionIndex < chunk.sections.length; sectionIndex += 1) {
    const section = chunk.sections[sectionIndex];
    if (!section) continue;
    const sectionY = MODERN_26_2.minY + sectionIndex * 16;
    for (let localY = 0; localY < 16; localY += 1) {
      const worldY = sectionY + localY;
      const destinationY = (worldY - MODERN_26_2.minY) * oneY;
      for (let z = 0; z < 16; z += 1) {
        const destinationRow = destinationY + (offsetZ + z) * size + offsetX;
        const columnRow = (offsetZ + z) * size + offsetX;
        for (let x = 0; x < 16; x += 1) {
          const state = section.getBlockState(x, localY, z);
          const name = state.getName().toString();
          let block = PACKED_BLOCK_IDS.get(name);
          if (block === undefined) {
            block = blockIdFromMinecraftName(name);
            PACKED_BLOCK_IDS.set(name, block);
          }
          blocks[destinationRow + x] = block;
          if (block !== Block.Air && block !== Block.Water && block !== Block.Lava) {
            heightmap[columnRow + x] = worldY;
          }
        }
      }
    }
  }
  for (let z = 0; z < 16; z += 1) {
    const worldZ = chunkOriginZ + z;
    for (let x = 0; x < 16; x += 1) {
      const worldX = chunkOriginX + x;
      const column = (offsetZ + z) * size + offsetX + x;
      biomeMap[column] = sampleMinecraft26SurfaceBiome(
        biomeParameters,
        biomeRandomState.sampler,
        biomeZoomSeed,
        worldX,
        heightmap[column],
        worldZ,
      );
    }
  }
}

function buildFullSurface(
  chunk: Chunk,
  noiseChunk: NoiseChunk,
  randomState: RandomState,
  settings: ReturnType<typeof NoiseGeneratorSettings.fromJson>,
  biomeParameters: ReturnType<typeof createMinecraft26OverworldBiomeParameters>,
  biomeZoomSeed: bigint,
): void {
  const system = randomState.surfaceSystem;
  const getBiome = (pos: BlockPos): string => sampleMinecraft26SurfaceBiome(
    biomeParameters,
    randomState.sampler,
    biomeZoomSeed,
    pos[0],
    pos[1],
    pos[2],
  );
  const context = new SurfaceContext(system, chunk, noiseChunk, settings.noise, getBiome);
  const worldSurfaceHeights = getWorldSurfaceHeights(chunk);
  const rule = createMinecraft26SurfaceRule(
    MINECRAFT_26_2_WORLDGEN.settings.surface_rule,
    context,
    randomState,
    worldSurfaceHeights,
  );
  const minX = ChunkPos.minBlockX(chunk.pos);
  const minZ = ChunkPos.minBlockZ(chunk.pos);

  for (let offsetX = 0; offsetX < 16; offsetX += 1) {
    const x = minX + offsetX;
    for (let offsetZ = 0; offsetZ < 16; offsetZ += 1) {
      const z = minZ + offsetZ;
      const heightIndex = offsetZ * 16 + offsetX;
      const startingHeight = worldSurfaceHeights[heightIndex] + 2;
      const surfaceBiome = getBiome(BlockPos.create(x, startingHeight, z));
      if (surfaceBiome === "eroded_badlands") {
        const extensionTop = extendMinecraft26ErodedBadlands(chunk, randomState, settings, x, z, startingHeight);
        if (extensionTop !== undefined) worldSurfaceHeights[heightIndex] = Math.max(worldSurfaceHeights[heightIndex], extensionTop);
      }
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
      if (surfaceBiome === "frozen_ocean" || surfaceBiome === "deep_frozen_ocean") {
        extendMinecraft26FrozenOcean(
          chunk,
          randomState,
          x,
          z,
          startingHeight,
          context.minSurfaceLevel(),
          surfaceBiome,
          settings.seaLevel,
        );
      }
    }
  }
}

function getWorldSurfaceHeights(chunk: Chunk): Int16Array {
  const heights = new Int16Array(16 * 16);
  const minX = ChunkPos.minBlockX(chunk.pos);
  const minZ = ChunkPos.minBlockZ(chunk.pos);
  for (let z = 0; z < 16; z += 1) {
    for (let x = 0; x < 16; x += 1) {
      let height = chunk.minY - 1;
      for (let y = chunk.maxY - 1; y >= chunk.minY; y -= 1) {
        if (!chunk.getBlockState(BlockPos.create(minX + x, y, minZ + z)).equals(BlockState.AIR)) {
          height = y;
          break;
        }
      }
      heights[z * 16 + x] = height;
    }
  }
  return heights;
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
