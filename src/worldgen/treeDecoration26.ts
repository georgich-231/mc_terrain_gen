import { XoroshiroRandom } from "deepslate";
import { Block, blockIdFromMinecraftName } from "./blocks";
import {
  getMinecraft26ConfiguredFeature,
  getMinecraft26FeaturesPerStep,
  getMinecraft26PlacedFeature,
  minecraft26BiomeHasFeature,
  type Minecraft26Json,
  type Minecraft26JsonObject,
} from "./features26";
import type { VoxelWorld } from "./types";

type Pos = [x: number, y: number, z: number];
type BiomeSampler = (x: number, y: number, z: number) => string;
interface FoliageAttachment {
  pos: Pos;
  radiusOffset: number;
  doubleTrunk: boolean;
}

interface FancyFoliageCoordinate {
  attachment: FoliageAttachment;
  branchBase: number;
}

interface DecorationRandom {
  nextInt(max?: number): number;
  nextLong(): bigint;
  nextBoolean(): boolean;
  nextFloat(): number;
  nextDouble(): number;
}

/**
 * Feature decoration uses WorldgenRandom around XoroshiroRandomSource. Its
 * bounded integers deliberately use BitRandomSource's legacy algorithm, not
 * XoroshiroRandomSource.nextInt. Keeping that wrapper is required for exact
 * counts, selectors, tree heights, foliage holes, and decorator choices.
 */
class Minecraft26WorldgenRandom implements DecorationRandom {
  private source: XoroshiroRandom;

  constructor(seed: bigint) {
    this.source = XoroshiroRandom.create(BigInt.asIntN(64, seed));
  }

  nextInt(max?: number): number {
    if (max === undefined) return this.nextSignedBits(32);
    if (!Number.isInteger(max) || max <= 0) throw new RangeError("Bound must be positive");
    if ((max & (max - 1)) === 0) {
      return Number(BigInt(max) * BigInt(this.nextBits(31)) >> 31n);
    }
    for (;;) {
      const bits = this.nextBits(31);
      const value = bits % max;
      if ((bits - value + (max - 1) | 0) >= 0) return value;
    }
  }

  nextLong(): bigint {
    const high = BigInt(this.nextSignedBits(32));
    const low = BigInt(this.nextSignedBits(32));
    return BigInt.asIntN(64, (high << 32n) + low);
  }

  nextBoolean(): boolean {
    return this.nextBits(1) !== 0;
  }

  nextFloat(): number {
    return this.nextBits(24) / 16_777_216;
  }

  nextDouble(): number {
    return (this.nextBits(26) * 134_217_728 + this.nextBits(27)) / 9_007_199_254_740_992;
  }

  private nextBits(bits: number): number {
    const value = BigInt.asUintN(64, this.source.nextLong());
    return Number(value >> BigInt(64 - bits));
  }

  private nextSignedBits(bits: number): number {
    const value = this.nextBits(bits);
    const sign = 2 ** (bits - 1);
    return value >= sign ? value - 2 ** bits : value;
  }
}

export interface Minecraft26DecorationStats {
  attemptedFeatures: number;
  placedTrees: number;
  placedLogs: number;
  placedLeaves: number;
  skippedUnsupportedTrees: number;
}

interface DecorationContext {
  world: VoxelWorld;
  sampleBiome: BiomeSampler;
  topFeature: string;
  stats: Minecraft26DecorationStats;
}

const TREE_STEP = 9;
const REPLACEABLE = new Set<Block>([
  Block.Air,
  Block.Water,
  Block.OakLeaves,
  Block.SpruceLeaves,
  Block.BirchLeaves,
  Block.JungleLeaves,
  Block.AcaciaLeaves,
  Block.DarkOakLeaves,
  Block.MangroveLeaves,
  Block.CherryLeaves,
  Block.PaleOakLeaves,
  Block.AzaleaLeaves,
  Block.FloweringAzaleaLeaves,
  Block.Vine,
]);
const SOIL = new Set<Block>([
  Block.Grass,
  Block.Dirt,
  Block.CoarseDirt,
  Block.Podzol,
  Block.Mycelium,
  Block.Mud,
  Block.Moss,
  Block.RootedDirt,
]);

/**
 * Applies the 26.2 vegetation-step placed features that can resolve to a tree.
 * Positions, biome filters, selector choices, and feature seeds follow the
 * official data. Tree placers cover the common single-trunk families as well
 * as acacia, cherry, and the 2x2 dark/pale oak family.
 */
export function decorateMinecraft26Trees(
  world: VoxelWorld,
  sampleBiome: BiomeSampler,
  onProgress?: (progress: number) => void,
): Minecraft26DecorationStats {
  const stats: Minecraft26DecorationStats = {
    attemptedFeatures: 0,
    placedTrees: 0,
    placedLogs: 0,
    placedLeaves: 0,
    skippedUnsupportedTrees: 0,
  };
  const featureStep = getMinecraft26FeaturesPerStep()[TREE_STEP] ?? [];
  const treeFeatures = featureStep.filter(({ id }) => placedFeatureContainsTree(id));
  const startChunkX = Math.floor(world.originX / 16);
  const startChunkZ = Math.floor(world.originZ / 16);
  const chunksX = Math.ceil(world.width / 16);
  const chunksZ = Math.ceil(world.length / 16);
  const total = Math.max(1, chunksX * chunksZ * treeFeatures.length);
  let complete = 0;

  for (let localChunkZ = 0; localChunkZ < chunksZ; localChunkZ += 1) {
    for (let localChunkX = 0; localChunkX < chunksX; localChunkX += 1) {
      const blockX = (startChunkX + localChunkX) * 16;
      const blockZ = (startChunkZ + localChunkZ) * 16;
      const decorationSeed = minecraft26DecorationSeed(BigInt(world.seed), blockX, blockZ);
      for (const feature of treeFeatures) {
        const random = new Minecraft26WorldgenRandom(BigInt.asIntN(
          64,
          decorationSeed + BigInt(feature.index) + BigInt(10_000 * TREE_STEP),
        ));
        stats.attemptedFeatures += 1;
        placePlacedFeature(
          feature.id,
          [blockX, 0, blockZ],
          random,
          { world, sampleBiome, topFeature: feature.id, stats },
        );
        complete += 1;
        if ((complete & 31) === 0) onProgress?.(complete / total);
      }
    }
  }
  onProgress?.(1);
  return stats;
}

export function minecraft26DecorationSeed(seed: bigint, blockX: number, blockZ: number): bigint {
  const random = new Minecraft26WorldgenRandom(BigInt.asIntN(64, seed));
  const xScale = BigInt.asIntN(64, random.nextLong()) | 1n;
  const zScale = BigInt.asIntN(64, random.nextLong()) | 1n;
  return BigInt.asIntN(
    64,
    BigInt.asIntN(64, BigInt(blockX) * xScale)
      + BigInt.asIntN(64, BigInt(blockZ) * zScale)
      ^ BigInt.asIntN(64, seed),
  );
}

function placePlacedFeature(
  reference: Minecraft26Json,
  origin: Pos,
  random: DecorationRandom,
  context: DecorationContext,
): boolean {
  const placed = typeof reference === "string" ? getMinecraft26PlacedFeature(reference) : asObject(reference);
  if (!placed) return false;
  const modifiers = asArray(placed.placement);
  let placedAny = false;
  const process = (index: number, pos: Pos): void => {
    if (index >= modifiers.length) {
      if (placeConfiguredFeature(placed.feature, pos, random, context)) placedAny = true;
      return;
    }
    applyPlacementModifier(asObject(modifiers[index]), pos, random, context, (next) => process(index + 1, next));
  };
  process(0, origin);
  return placedAny;
}

function applyPlacementModifier(
  modifier: Minecraft26JsonObject | undefined,
  pos: Pos,
  random: DecorationRandom,
  context: DecorationContext,
  next: (pos: Pos) => void,
): void {
  if (!modifier) return;
  switch (modifier.type) {
    case "minecraft:count": {
      const count = sampleInt(modifier.count, random);
      for (let index = 0; index < count; index += 1) next(pos);
      return;
    }
    case "minecraft:rarity_filter":
      if (random.nextFloat() < 1 / asNumber(modifier.chance, 1)) next(pos);
      return;
    case "minecraft:in_square":
      next([pos[0] + random.nextInt(16), pos[1], pos[2] + random.nextInt(16)]);
      return;
    case "minecraft:surface_water_depth_filter": {
      const oceanFloor = getOceanFloor(context.world, pos[0], pos[2]);
      const surface = getWorldSurface(context.world, pos[0], pos[2]);
      if (surface - oceanFloor <= asNumber(modifier.max_water_depth, 0)) next(pos);
      return;
    }
    case "minecraft:heightmap": {
      const type = asString(modifier.heightmap);
      const height = type.startsWith("OCEAN_FLOOR")
        ? getOceanFloor(context.world, pos[0], pos[2]) + 1
        : getWorldSurface(context.world, pos[0], pos[2]) + 1;
      next([pos[0], height, pos[2]]);
      return;
    }
    case "minecraft:block_predicate_filter":
      if (testBlockPredicate(asObject(modifier.predicate), pos, context.world)) next(pos);
      return;
    case "minecraft:biome": {
      const biome = context.sampleBiome(pos[0], pos[1], pos[2]);
      if (minecraft26BiomeHasFeature(biome, context.topFeature)) next(pos);
      return;
    }
    default:
      // Tree-related inner placed features primarily use survival filters. An
      // unknown modifier is restrictive: skipping it avoids invalid placement.
      return;
  }
}

function placeConfiguredFeature(
  reference: Minecraft26Json,
  origin: Pos,
  random: DecorationRandom,
  context: DecorationContext,
): boolean {
  const configured = typeof reference === "string" ? getMinecraft26ConfiguredFeature(reference) : asObject(reference);
  if (!configured) return false;
  const config = asObject(configured.config) ?? {};
  switch (configured.type) {
    case "minecraft:tree":
      return placeTree(config, origin, random, context);
    case "minecraft:random_selector": {
      for (const rawEntry of asArray(config.features)) {
        const entry = asObject(rawEntry);
        if (entry && random.nextFloat() < asNumber(entry.chance)) {
          return placePlacedFeature(entry.feature, origin, random, context);
        }
      }
      return placePlacedFeature(config.default, origin, random, context);
    }
    case "minecraft:simple_random_selector": {
      const features = asArray(config.features);
      return features.length > 0 && placePlacedFeature(features[random.nextInt(features.length)], origin, random, context);
    }
    case "minecraft:random_boolean_selector":
      return placePlacedFeature(random.nextInt(2) === 0 ? config.feature_true : config.feature_false, origin, random, context);
    default:
      return false;
  }
}

function placeTree(config: Minecraft26JsonObject, origin: Pos, random: DecorationRandom, context: DecorationContext): boolean {
  const trunk = asObject(config.trunk_placer);
  const foliage = asObject(config.foliage_placer);
  if (!trunk || !foliage) return false;
  const supportedTrunks = new Set([
    "minecraft:straight_trunk_placer",
    "minecraft:forking_trunk_placer",
    "minecraft:cherry_trunk_placer",
    "minecraft:dark_oak_trunk_placer",
    "minecraft:bending_trunk_placer",
    "minecraft:giant_trunk_placer",
    "minecraft:mega_jungle_trunk_placer",
    "minecraft:fancy_trunk_placer",
    "minecraft:upwards_branching_trunk_placer",
  ]);
  if (!supportedTrunks.has(asString(trunk.type))) {
    context.stats.skippedUnsupportedTrees += 1;
    return false;
  }
  const supportedFoliage = new Set([
    "minecraft:blob_foliage_placer",
    "minecraft:bush_foliage_placer",
    "minecraft:pine_foliage_placer",
    "minecraft:spruce_foliage_placer",
    "minecraft:acacia_foliage_placer",
    "minecraft:cherry_foliage_placer",
    "minecraft:dark_oak_foliage_placer",
    "minecraft:random_spread_foliage_placer",
    "minecraft:jungle_foliage_placer",
    "minecraft:mega_pine_foliage_placer",
    "minecraft:fancy_foliage_placer",
  ]);
  if (!supportedFoliage.has(asString(foliage.type))) {
    context.stats.skippedUnsupportedTrees += 1;
    return false;
  }

  const treeHeight = asNumber(trunk.base_height)
    + random.nextInt(asNumber(trunk.height_rand_a) + 1)
    + random.nextInt(asNumber(trunk.height_rand_b) + 1);
  const foliageHeight = getFoliageHeight(foliage, treeHeight, random);
  const trunkHeight = treeHeight - foliageHeight;
  const foliageRadius = getFoliageRadius(foliage, trunkHeight, random);
  if (![treeHeight, foliageHeight, foliageRadius].every(Number.isFinite)) {
    throw new Error(`Invalid ${String(foliage.type)} dimensions: ${treeHeight}/${foliageHeight}/${foliageRadius}`);
  }
  const rootPlacer = asObject(config.root_placer);
  const trunkOrigin: Pos = rootPlacer
    ? [origin[0], origin[1] + sampleInt(rootPlacer.trunk_offset_y, random), origin[2]]
    : origin;
  const minTreeY = Math.min(origin[1], trunkOrigin[1]);
  const maxTreeY = Math.max(origin[1], trunkOrigin[1]) + treeHeight + 1;
  if (minTreeY < context.world.minY + 1 || maxTreeY > context.world.maxY + 1) return false;
  const freeHeight = getMaxFreeTreeHeight(context.world, trunkOrigin, treeHeight, asObject(config.minimum_size));
  const minClipped = asObject(config.minimum_size)?.min_clipped_height;
  if (freeHeight < treeHeight && (typeof minClipped !== "number" || freeHeight < minClipped)) return false;
  if (!SOIL.has(getBlock(context.world, origin[0], origin[1] - 1, origin[2]))) return false;

  const log = sampleStateProvider(config.trunk_provider, random);
  const foliageProvider = config.foliage_provider;
  const leaf = foliage.type === "minecraft:random_spread_foliage_placer"
    ? firstStateProviderBlock(foliageProvider)
    : sampleStateProvider(foliageProvider, random);
  if (log === undefined || leaf === undefined) return false;
  const logs: Pos[] = [];
  const leaves: Pos[] = [];
  const belowTrunk = sampleBelowTrunkProvider(config.below_trunk_provider, random) ?? Block.Dirt;
  if (rootPlacer && !placeMangroveRoots(rootPlacer, origin, trunkOrigin, random, context.world)) return false;
  const attachments = placeTrunk(trunk, trunkOrigin, freeHeight, log, belowTrunk, random, context.world, logs);
  context.stats.placedLogs += logs.length;
  for (const attachment of attachments) {
    if (!attachment.pos.every(Number.isFinite) || !Number.isFinite(attachment.radiusOffset)) {
      throw new Error(`Invalid ${String(trunk.type)} foliage attachment: ${JSON.stringify(attachment)}`);
    }
    createFoliage(
      foliage,
      attachment,
      foliageHeight,
      foliageRadius,
      leaf,
      foliageProvider,
      random,
      context.world,
      leaves,
    );
  }
  context.stats.placedLeaves += leaves.length;
  if (logs.length === 0 && leaves.length === 0) return false;
  applyTreeDecorators(asArray(config.decorators), logs, leaves, random, context.world);
  refreshHeightmap(context.world, logs, leaves);
  context.stats.placedTrees += 1;
  return true;
}

function getFoliageHeight(foliage: Minecraft26JsonObject, treeHeight: number, random: DecorationRandom): number {
  switch (foliage.type) {
    case "minecraft:spruce_foliage_placer":
      return Math.max(4, treeHeight - sampleInt(foliage.trunk_height, random));
    case "minecraft:pine_foliage_placer":
      return sampleInt(foliage.height, random);
    case "minecraft:acacia_foliage_placer":
      return 0;
    case "minecraft:cherry_foliage_placer":
      return sampleInt(foliage.height, random);
    case "minecraft:dark_oak_foliage_placer":
      return 4;
    case "minecraft:random_spread_foliage_placer":
      return sampleInt(foliage.foliage_height, random);
    case "minecraft:mega_pine_foliage_placer":
      return sampleInt(foliage.crown_height, random);
    default:
      return asNumber(foliage.height);
  }
}

function getFoliageRadius(foliage: Minecraft26JsonObject, trunkHeight: number, random: DecorationRandom): number {
  const radius = sampleInt(foliage.radius, random);
  return foliage.type === "minecraft:pine_foliage_placer"
    ? radius + random.nextInt(Math.max(trunkHeight + 1, 1))
    : radius;
}

function placeTrunk(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  log: Block,
  belowTrunk: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  if (trunk.type === "minecraft:dark_oak_trunk_placer") {
    return placeDarkOakTrunk(origin, height, log, belowTrunk, random, world, logs);
  }

  if (trunk.type === "minecraft:bending_trunk_placer") {
    return placeBendingTrunk(trunk, origin, height, log, belowTrunk, random, world, logs);
  }

  if (trunk.type === "minecraft:giant_trunk_placer" || trunk.type === "minecraft:mega_jungle_trunk_placer") {
    return placeGiantTrunk(trunk, origin, height, log, belowTrunk, random, world, logs);
  }

  if (trunk.type === "minecraft:fancy_trunk_placer") {
    return placeFancyTrunk(origin, height, log, belowTrunk, random, world, logs);
  }

  if (trunk.type === "minecraft:upwards_branching_trunk_placer") {
    return placeUpwardsBranchingTrunk(trunk, origin, height, log, random, world, logs);
  }

  setBlock(world, origin[0], origin[1] - 1, origin[2], belowTrunk);
  if (trunk.type === "minecraft:straight_trunk_placer") {
    for (let y = 0; y < height; y += 1) placeTreeLog(world, [origin[0], origin[1] + y, origin[2]], log, logs);
    return [{ pos: [origin[0], origin[1] + height, origin[2]], radiusOffset: 0, doubleTrunk: false }];
  }

  if (trunk.type === "minecraft:cherry_trunk_placer") {
    return placeCherryTrunk(trunk, origin, height, log, random, world, logs);
  }

  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const directionIndex = random.nextInt(4);
  const direction = directions[directionIndex];
  const bendStart = height - random.nextInt(4) - 1;
  let bendLength = 3 - random.nextInt(3);
  let x = origin[0];
  let z = origin[2];
  let firstAttachmentY: number | undefined;
  for (let level = 0; level < height; level += 1) {
    const y = origin[1] + level;
    if (level >= bendStart && bendLength > 0) {
      x += direction[0];
      z += direction[1];
      bendLength -= 1;
    }
    if (placeTreeLog(world, [x, y, z], log, logs)) firstAttachmentY = y + 1;
  }
  const attachments: FoliageAttachment[] = [];
  if (firstAttachmentY !== undefined) {
    attachments.push({ pos: [x, firstAttachmentY, z], radiusOffset: 1, doubleTrunk: false });
  }

  x = origin[0];
  z = origin[2];
  const secondDirectionIndex = random.nextInt(4);
  if (secondDirectionIndex !== directionIndex) {
    const secondDirection = directions[secondDirectionIndex];
    const branchStart = bendStart - random.nextInt(2) - 1;
    let branchLength = 1 + random.nextInt(3);
    let secondAttachmentY: number | undefined;
    for (let level = branchStart; level < height && branchLength > 0; level += 1, branchLength -= 1) {
      if (level < 1) continue;
      const y = origin[1] + level;
      x += secondDirection[0];
      z += secondDirection[1];
      if (placeTreeLog(world, [x, y, z], log, logs)) secondAttachmentY = y + 1;
    }
    if (secondAttachmentY !== undefined) {
      attachments.push({ pos: [x, secondAttachmentY, z], radiusOffset: 0, doubleTrunk: false });
    }
  }
  return attachments;
}

function placeDarkOakTrunk(
  origin: Pos,
  height: number,
  log: Block,
  belowTrunk: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    setBlock(world, origin[0] + dx, origin[1] - 1, origin[2] + dz, belowTrunk);
  }

  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const direction = directions[random.nextInt(4)];
  const bendStart = height - random.nextInt(4);
  let bendLength = 2 - random.nextInt(3);
  let x = origin[0];
  let z = origin[2];
  const topY = origin[1] + height - 1;
  for (let level = 0; level < height; level += 1) {
    if (level >= bendStart && bendLength > 0) {
      x += direction[0];
      z += direction[1];
      bendLength -= 1;
    }
    const y = origin[1] + level;
    if (!isFree(world, x, y, z)) continue;
    placeTreeLog(world, [x, y, z], log, logs);
    placeTreeLog(world, [x + 1, y, z], log, logs);
    placeTreeLog(world, [x, y, z + 1], log, logs);
    placeTreeLog(world, [x + 1, y, z + 1], log, logs);
  }

  const attachments: FoliageAttachment[] = [{
    pos: [x, topY, z],
    radiusOffset: 0,
    doubleTrunk: true,
  }];
  for (let dx = -1; dx <= 2; dx += 1) {
    for (let dz = -1; dz <= 2; dz += 1) {
      if (dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1) continue;
      if (random.nextInt(3) > 0) continue;
      const branchLength = random.nextInt(3) + 2;
      for (let index = 0; index < branchLength; index += 1) {
        placeTreeLog(
          world,
          [origin[0] + dx, topY - index - 1, origin[2] + dz],
          log,
          logs,
        );
      }
      attachments.push({
        pos: [origin[0] + dx, topY, origin[2] + dz],
        radiusOffset: 0,
        doubleTrunk: false,
      });
    }
  }
  return attachments;
}

function placeBendingTrunk(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  log: Block,
  belowTrunk: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const direction = directions[random.nextInt(4)];
  const topLevel = height - 1;
  let current: Pos = [origin[0], origin[1], origin[2]];
  setBlock(world, origin[0], origin[1] - 1, origin[2], belowTrunk);
  const attachments: FoliageAttachment[] = [];
  for (let level = 0; level <= topLevel; level += 1) {
    if (level + 1 >= topLevel + random.nextInt(2)) {
      current = [current[0] + direction[0], current[1], current[2] + direction[1]];
    }
    placeTreeLog(world, current, log, logs);
    if (level >= asNumber(trunk.min_height_for_leaves, 1)) {
      attachments.push({ pos: [...current], radiusOffset: 0, doubleTrunk: false });
    }
    current = [current[0], current[1] + 1, current[2]];
  }
  const bendLength = sampleInt(trunk.bend_length, random);
  for (let step = 0; step <= bendLength; step += 1) {
    placeTreeLog(world, current, log, logs);
    attachments.push({ pos: [...current], radiusOffset: 0, doubleTrunk: false });
    current = [current[0] + direction[0], current[1], current[2] + direction[1]];
  }
  return attachments;
}

function placeUpwardsBranchingTrunk(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  log: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const attachments: FoliageAttachment[] = [];
  for (let level = 0; level < height; level += 1) {
    const y = origin[1] + level;
    if (placeTreeLog(world, [origin[0], y, origin[2]], log, logs)
      && level < height - 1
      && random.nextFloat() < asNumber(trunk.place_branch_per_log_probability)) {
      const direction = directions[random.nextInt(4)];
      const firstLength = sampleInt(trunk.extra_branch_length, random);
      const startOffset = Math.max(0, firstLength - sampleInt(trunk.extra_branch_length, random) - 1);
      let steps = sampleInt(trunk.extra_branch_steps, random);
      let branchX = origin[0];
      let branchZ = origin[2];
      let lastY = y + startOffset;
      for (let branchLevel = startOffset; branchLevel < height && steps > 0; branchLevel += 1, steps -= 1) {
        if (branchLevel < 1) continue;
        const branchY = y + branchLevel;
        branchX += direction[0];
        branchZ += direction[1];
        lastY = branchY;
        if (placeTreeLog(world, [branchX, branchY, branchZ], log, logs)) lastY += 1;
        attachments.push({ pos: [branchX, branchY, branchZ], radiusOffset: 0, doubleTrunk: false });
      }
      if (lastY - y > 1) {
        attachments.push({ pos: [branchX, lastY, branchZ], radiusOffset: 0, doubleTrunk: false });
        attachments.push({ pos: [branchX, lastY - 2, branchZ], radiusOffset: 0, doubleTrunk: false });
      }
    }
    if (level === height - 1) {
      attachments.push({ pos: [origin[0], y + 1, origin[2]], radiusOffset: 0, doubleTrunk: false });
    }
  }
  return attachments;
}

function placeMangroveRoots(
  rootPlacer: Minecraft26JsonObject,
  origin: Pos,
  trunkOrigin: Pos,
  random: DecorationRandom,
  world: VoxelWorld,
): boolean {
  if (rootPlacer.type !== "minecraft:mangrove_root_placer") return false;
  for (let y = origin[1]; y < trunkOrigin[1]; y += 1) {
    if (!canPlaceMangroveRoot(world, origin[0], y, origin[2])) return false;
  }
  const placement = asObject(rootPlacer.mangrove_root_placement) ?? {};
  const roots: Pos[] = [[trunkOrigin[0], trunkOrigin[1] - 1, trunkOrigin[2]]];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  for (const direction of directions) {
    const start: Pos = [trunkOrigin[0] + direction[0], trunkOrigin[1], trunkOrigin[2] + direction[1]];
    const simulated: Pos[] = [];
    if (!simulateMangroveRoots(world, random, start, direction, trunkOrigin, simulated, 0, placement)) return false;
    roots.push(...simulated, start);
  }
  const above = asObject(rootPlacer.above_root_placement);
  for (const pos of roots) {
    if (!canPlaceMangroveRoot(world, ...pos)) continue;
    const current = getBlock(world, ...pos);
    if (current === Block.Mud || current === Block.MuddyMangroveRoots) {
      setBlock(world, ...pos, Block.MuddyMangroveRoots);
      continue;
    }
    setBlock(world, ...pos, Block.MangroveRoots);
    if (above && random.nextFloat() < asNumber(above.above_root_placement_chance)) {
      const abovePos: Pos = [pos[0], pos[1] + 1, pos[2]];
      if (getBlock(world, ...abovePos) === Block.Air) setBlock(world, ...abovePos, Block.Moss);
    }
  }
  return true;
}

function simulateMangroveRoots(
  world: VoxelWorld,
  random: DecorationRandom,
  pos: Pos,
  direction: readonly [number, number],
  trunkOrigin: Pos,
  positions: Pos[],
  depth: number,
  placement: Minecraft26JsonObject,
): boolean {
  const maxLength = asNumber(placement.max_root_length, 15);
  if (depth === maxLength || positions.length > maxLength) return false;
  for (const candidate of potentialMangroveRootPositions(pos, direction, trunkOrigin, random, placement)) {
    if (!canPlaceMangroveRoot(world, ...candidate)) continue;
    positions.push(candidate);
    if (!simulateMangroveRoots(world, random, candidate, direction, trunkOrigin, positions, depth + 1, placement)) {
      return false;
    }
  }
  return true;
}

function potentialMangroveRootPositions(
  pos: Pos,
  direction: readonly [number, number],
  trunkOrigin: Pos,
  random: DecorationRandom,
  placement: Minecraft26JsonObject,
): Pos[] {
  const below: Pos = [pos[0], pos[1] - 1, pos[2]];
  const outward: Pos = [pos[0] + direction[0], pos[1], pos[2] + direction[1]];
  const distance = manhattan(pos, trunkOrigin);
  const maxWidth = asNumber(placement.max_root_width, 8);
  const skewChance = asNumber(placement.random_skew_chance, 0.2);
  if (distance > maxWidth - 3 && distance <= maxWidth) {
    return random.nextFloat() < skewChance
      ? [below, [outward[0], outward[1] - 1, outward[2]]]
      : [below];
  }
  if (distance > maxWidth) return [below];
  if (random.nextFloat() < skewChance) return [below];
  return random.nextBoolean() ? [outward] : [below];
}

function canPlaceMangroveRoot(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const block = getBlock(world, x, y, z);
  return REPLACEABLE.has(block)
    || block === Block.Mud
    || block === Block.MuddyMangroveRoots
    || block === Block.MangroveRoots
    || block === Block.Moss
    || block === Block.Snow;
}

function placeGiantTrunk(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  log: Block,
  belowTrunk: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    setBlock(world, origin[0] + dx, origin[1] - 1, origin[2] + dz, belowTrunk);
  }
  for (let level = 0; level < height; level += 1) {
    placeTreeLog(world, [origin[0], origin[1] + level, origin[2]], log, logs);
    if (level >= height - 1) continue;
    placeTreeLog(world, [origin[0] + 1, origin[1] + level, origin[2]], log, logs);
    placeTreeLog(world, [origin[0] + 1, origin[1] + level, origin[2] + 1], log, logs);
    placeTreeLog(world, [origin[0], origin[1] + level, origin[2] + 1], log, logs);
  }
  const attachments: FoliageAttachment[] = [{
    pos: [origin[0], origin[1] + height, origin[2]],
    radiusOffset: 0,
    doubleTrunk: true,
  }];
  if (trunk.type !== "minecraft:mega_jungle_trunk_placer") return attachments;

  let branchY = height - 2 - random.nextInt(4);
  while (branchY > Math.trunc(height / 2)) {
    const angle = Math.fround(random.nextFloat() * Math.fround(6.2831855));
    let branchX = 0;
    let branchZ = 0;
    for (let step = 0; step < 5; step += 1) {
      const cos = Math.fround(Math.cos(angle));
      const sin = Math.fround(Math.sin(angle));
      branchX = Math.trunc(Math.fround(1.5 + Math.fround(cos * step)));
      branchZ = Math.trunc(Math.fround(1.5 + Math.fround(sin * step)));
      placeTreeLog(
        world,
        [origin[0] + branchX, origin[1] + branchY - 3 + Math.trunc(step / 2), origin[2] + branchZ],
        log,
        logs,
      );
    }
    attachments.push({
      pos: [origin[0] + branchX, origin[1] + branchY, origin[2] + branchZ],
      radiusOffset: -2,
      doubleTrunk: false,
    });
    branchY -= 2 + random.nextInt(4);
  }
  return attachments;
}

function placeFancyTrunk(
  origin: Pos,
  height: number,
  log: Block,
  belowTrunk: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  const totalHeight = height + 2;
  const trunkHeight = Math.floor(totalHeight * 0.618);
  setBlock(world, origin[0], origin[1] - 1, origin[2], belowTrunk);
  const trunkTopY = origin[1] + trunkHeight;
  let layer = totalHeight - 5;
  const coordinates: FancyFoliageCoordinate[] = [{
    attachment: { pos: [origin[0], origin[1] + layer, origin[2]], radiusOffset: 0, doubleTrunk: false },
    branchBase: trunkTopY,
  }];
  while (layer >= 0) {
    const shape = fancyTreeShape(totalHeight, layer);
    if (shape >= 0) {
      const radialDistance = shape * (random.nextFloat() + 0.328);
      const doubledAngle = Math.fround(random.nextFloat() * 2);
      const angle = doubledAngle * Math.PI;
      const candidate: Pos = [
        origin[0] + Math.floor(radialDistance * Math.sin(angle) + 0.5),
        origin[1] + layer - 1,
        origin[2] + Math.floor(radialDistance * Math.cos(angle) + 0.5),
      ];
      const crownTop: Pos = [candidate[0], candidate[1] + 5, candidate[2]];
      if (makeFancyLimb(world, candidate, crownTop)) {
        const dx = origin[0] - candidate[0];
        const dz = origin[2] - candidate[2];
        const slopedBase = candidate[1] - Math.sqrt(dx * dx + dz * dz) * 0.381;
        const branchBase = slopedBase > trunkTopY ? trunkTopY : Math.trunc(slopedBase);
        const branchOrigin: Pos = [origin[0], branchBase, origin[2]];
        if (makeFancyLimb(world, branchOrigin, candidate)) {
          coordinates.push({
            attachment: { pos: candidate, radiusOffset: 0, doubleTrunk: false },
            branchBase,
          });
        }
      }
    }
    layer -= 1;
  }

  makeFancyLimb(world, origin, [origin[0], origin[1] + trunkHeight, origin[2]], log, logs);
  for (const coordinate of coordinates) {
    const branchOrigin: Pos = [origin[0], coordinate.branchBase, origin[2]];
    if (!samePos(branchOrigin, coordinate.attachment.pos)
      && trimFancyBranch(totalHeight, coordinate.branchBase - origin[1])) {
      makeFancyLimb(world, branchOrigin, coordinate.attachment.pos, log, logs);
    }
  }
  return coordinates
    .filter((coordinate) => trimFancyBranch(totalHeight, coordinate.branchBase - origin[1]))
    .map((coordinate) => coordinate.attachment);
}

function makeFancyLimb(
  world: VoxelWorld,
  start: Pos,
  end: Pos,
  log?: Block,
  logs?: Pos[],
): boolean {
  if (samePos(start, end) && log === undefined) return true;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const stepX = Math.fround(dx / steps);
  const stepY = Math.fround(dy / steps);
  const stepZ = Math.fround(dz / steps);
  for (let index = 0; index <= steps; index += 1) {
    const pos: Pos = [
      start[0] + Math.floor(Math.fround(0.5 + Math.fround(index * stepX))),
      start[1] + Math.floor(Math.fround(0.5 + Math.fround(index * stepY))),
      start[2] + Math.floor(Math.fround(0.5 + Math.fround(index * stepZ))),
    ];
    if (log === undefined) {
      if (!isFree(world, ...pos)) return false;
    } else {
      placeTreeLog(world, pos, log, logs ?? []);
    }
  }
  return true;
}

function fancyTreeShape(height: number, layer: number): number {
  if (layer < Math.fround(height * Math.fround(0.3))) return -1;
  const half = Math.fround(height / 2);
  const delta = Math.fround(half - layer);
  let radius: number;
  if (delta === 0) radius = half;
  else if (Math.abs(delta) >= half) return 0;
  else radius = Math.fround(Math.sqrt(Math.fround(Math.fround(half * half) - Math.fround(delta * delta))));
  return Math.fround(radius * Math.fround(0.5));
}

function trimFancyBranch(height: number, branchHeight: number): boolean {
  return branchHeight >= height * 0.2;
}

function samePos(a: Pos, b: Pos): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function placeTreeLog(world: VoxelWorld, pos: Pos, log: Block, logs: Pos[]): boolean {
  if (!isReplaceable(world, ...pos)) return false;
  setBlock(world, ...pos, log);
  logs.push(pos);
  return true;
}

function placeCherryTrunk(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  log: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment[] {
  const startProvider = asObject(trunk.branch_start_offset_from_top);
  const firstStart = Math.max(0, height - 1 + sampleInt(startProvider, random));
  const secondProvider: Minecraft26JsonObject = {
    type: "minecraft:uniform",
    min_inclusive: startProvider?.min_inclusive ?? 0,
    max_inclusive: asNumber(startProvider?.max_inclusive) - 1,
  };
  let secondStart = Math.max(0, height - 1 + sampleInt(secondProvider, random));
  if (secondStart >= firstStart) secondStart += 1;
  const branchCount = sampleInt(trunk.branch_count, random);
  const hasTop = branchCount === 3;
  const hasSecondBranch = branchCount >= 2;
  const verticalHeight = hasTop ? height : hasSecondBranch ? Math.max(firstStart, secondStart) + 1 : firstStart + 1;
  for (let y = 0; y < verticalHeight; y += 1) {
    placeTreeLog(world, [origin[0], origin[1] + y, origin[2]], log, logs);
  }

  const attachments: FoliageAttachment[] = [];
  if (hasTop) attachments.push({ pos: [origin[0], origin[1] + verticalHeight, origin[2]], radiusOffset: 0, doubleTrunk: false });
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const directionIndex = random.nextInt(4);
  attachments.push(generateCherryBranch(
    trunk,
    origin,
    height,
    firstStart,
    firstStart < verticalHeight - 1,
    directions[directionIndex],
    log,
    random,
    world,
    logs,
  ));
  if (hasSecondBranch) {
    attachments.push(generateCherryBranch(
      trunk,
      origin,
      height,
      secondStart,
      secondStart < verticalHeight - 1,
      directions[(directionIndex + 2) & 3],
      log,
      random,
      world,
      logs,
    ));
  }
  return attachments;
}

function generateCherryBranch(
  trunk: Minecraft26JsonObject,
  origin: Pos,
  height: number,
  startLevel: number,
  startsInsideTrunk: boolean,
  direction: readonly [number, number],
  log: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  logs: Pos[],
): FoliageAttachment {
  let current: Pos = [origin[0], origin[1] + startLevel, origin[2]];
  const endLevel = height - 1 + sampleInt(trunk.branch_end_offset_from_top, random);
  const useExtraHorizontal = startsInsideTrunk || endLevel < startLevel;
  const horizontalLength = sampleInt(trunk.branch_horizontal_length, random) + (useExtraHorizontal ? 1 : 0);
  const target: Pos = [
    origin[0] + direction[0] * horizontalLength,
    origin[1] + endLevel,
    origin[2] + direction[1] * horizontalLength,
  ];
  const initialHorizontal = useExtraHorizontal ? 2 : 1;
  for (let index = 0; index < initialHorizontal; index += 1) {
    current = [current[0] + direction[0], current[1], current[2] + direction[1]];
    placeTreeLog(world, current, log, logs);
  }
  while (manhattan(current, target) !== 0) {
    const distance = manhattan(current, target);
    const verticalChance = Math.abs(target[1] - current[1]) / distance;
    if (random.nextFloat() < verticalChance) {
      current = [current[0], current[1] + Math.sign(target[1] - current[1]), current[2]];
    } else {
      current = [current[0] + direction[0], current[1], current[2] + direction[1]];
    }
    placeTreeLog(world, current, log, logs);
  }
  return { pos: [target[0], target[1] + 1, target[2]], radiusOffset: 0, doubleTrunk: false };
}

function createCherryFoliage(
  foliage: Minecraft26JsonObject,
  attachment: FoliageAttachment,
  foliageHeight: number,
  foliageRadius: number,
  leaf: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  leaves: Pos[],
  offset: number,
): void {
  const center: Pos = [attachment.pos[0], attachment.pos[1] + offset, attachment.pos[2]];
  const radius = foliageRadius + attachment.radiusOffset - 1;
  placeLeavesRow(center, radius - 2, foliageHeight - 3, leaf, random, world, leaves, "minecraft:cherry_foliage_placer", attachment.doubleTrunk, foliage);
  placeLeavesRow(center, radius - 1, foliageHeight - 4, leaf, random, world, leaves, "minecraft:cherry_foliage_placer", attachment.doubleTrunk, foliage);
  for (let y = foliageHeight - 5; y >= 0; y -= 1) {
    placeLeavesRow(center, radius, y, leaf, random, world, leaves, "minecraft:cherry_foliage_placer", attachment.doubleTrunk, foliage);
  }
  placeLeavesRowWithHanging(center, radius, -1, leaf, random, world, leaves, attachment.doubleTrunk, foliage);
  placeLeavesRowWithHanging(center, radius - 1, -2, leaf, random, world, leaves, attachment.doubleTrunk, foliage);
}

function placeLeavesRowWithHanging(
  center: Pos,
  radius: number,
  yOffset: number,
  leaf: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  leaves: Pos[],
  doubleTrunk: boolean,
  foliage: Minecraft26JsonObject,
): void {
  placeLeavesRow(center, radius, yOffset, leaf, random, world, leaves, "minecraft:cherry_foliage_placer", doubleTrunk, foliage);
  const extension = doubleTrunk ? 1 : 0;
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const centerBelow: Pos = [center[0], center[1] - 1, center[2]];
  for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
    const direction = directions[directionIndex];
    const clockwise = directions[(directionIndex + 1) & 3];
    const edge = (clockwise[0] > 0 || clockwise[1] > 0) ? radius + extension : radius;
    let position: Pos = [
      center[0] + clockwise[0] * edge + direction[0] * -radius,
      center[1] + yOffset - 1,
      center[2] + clockwise[1] * edge + direction[1] * -radius,
    ];
    for (let index = -radius; index < radius + extension; index += 1) {
      const above: Pos = [position[0], position[1] + 1, position[2]];
      if (getBlock(world, ...above) === leaf && tryPlaceLeafExtension(
        position,
        centerBelow,
        asNumber(foliage.hanging_leaves_chance),
        leaf,
        random,
        world,
        leaves,
      )) {
        const lower: Pos = [position[0], position[1] - 1, position[2]];
        tryPlaceLeafExtension(
          lower,
          centerBelow,
          asNumber(foliage.hanging_leaves_extension_chance),
          leaf,
          random,
          world,
          leaves,
        );
      }
      position = [position[0] + direction[0], position[1], position[2] + direction[1]];
    }
  }
}

function tryPlaceLeafExtension(
  pos: Pos,
  centerBelow: Pos,
  chance: number,
  leaf: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  leaves: Pos[],
): boolean {
  if (manhattan(pos, centerBelow) >= 7 || random.nextFloat() > chance || !isReplaceable(world, ...pos)) return false;
  setBlock(world, ...pos, leaf);
  leaves.push(pos);
  return true;
}

function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function createFoliage(
  foliage: Minecraft26JsonObject,
  attachment: FoliageAttachment,
  foliageHeight: number,
  foliageRadius: number,
  leaf: Block,
  foliageProvider: Minecraft26Json | undefined,
  random: DecorationRandom,
  world: VoxelWorld,
  leaves: Pos[],
): void {
  const offset = sampleInt(foliage.offset, random);
  if (!Number.isFinite(offset)) throw new Error(`Invalid ${String(foliage.type)} offset: ${offset}`);
  if (foliage.type === "minecraft:random_spread_foliage_placer") {
    const center: Pos = [attachment.pos[0], attachment.pos[1] + offset, attachment.pos[2]];
    for (let attempt = 0; attempt < asNumber(foliage.leaf_placement_attempts); attempt += 1) {
      const pos: Pos = [
        center[0] + random.nextInt(foliageRadius) - random.nextInt(foliageRadius),
        center[1] + random.nextInt(foliageHeight) - random.nextInt(foliageHeight),
        center[2] + random.nextInt(foliageRadius) - random.nextInt(foliageRadius),
      ];
      if (!isReplaceable(world, ...pos)) continue;
      const placedLeaf = sampleStateProvider(foliageProvider, random);
      if (placedLeaf === undefined) continue;
      setBlock(world, ...pos, placedLeaf);
      leaves.push(pos);
    }
    return;
  }
  if (foliage.type === "minecraft:cherry_foliage_placer") {
    createCherryFoliage(foliage, attachment, foliageHeight, foliageRadius, leaf, random, world, leaves, offset);
    return;
  }
  if (foliage.type === "minecraft:acacia_foliage_placer") {
    const center: Pos = [attachment.pos[0], attachment.pos[1] + offset, attachment.pos[2]];
    placeLeavesRow(center, foliageRadius + attachment.radiusOffset, -1 - foliageHeight, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
    placeLeavesRow(center, foliageRadius - 1, -foliageHeight, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
    placeLeavesRow(center, foliageRadius + attachment.radiusOffset - 1, 0, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
    return;
  }
  if (foliage.type === "minecraft:dark_oak_foliage_placer") {
    const center: Pos = [attachment.pos[0], attachment.pos[1] + offset, attachment.pos[2]];
    if (attachment.doubleTrunk) {
      placeLeavesRow(center, foliageRadius + 2, -1, leaf, random, world, leaves, foliage.type, true);
      placeLeavesRow(center, foliageRadius + 3, 0, leaf, random, world, leaves, foliage.type, true);
      placeLeavesRow(center, foliageRadius + 2, 1, leaf, random, world, leaves, foliage.type, true);
      if (random.nextBoolean()) {
        placeLeavesRow(center, foliageRadius + 2, 2, leaf, random, world, leaves, foliage.type, true);
      }
    } else {
      placeLeavesRow(center, foliageRadius + 2, -1, leaf, random, world, leaves, foliage.type, false);
      placeLeavesRow(center, foliageRadius + 1, 0, leaf, random, world, leaves, foliage.type, false);
    }
    return;
  }
  if (foliage.type === "minecraft:fancy_foliage_placer") {
    for (let y = offset; y >= offset - foliageHeight; y -= 1) {
      const radius = foliageRadius + (y === offset || y === offset - foliageHeight ? 0 : 1);
      placeLeavesRow(attachment.pos, radius, y, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
    }
    return;
  }
  if (foliage.type === "minecraft:jungle_foliage_placer") {
    const layers = attachment.doubleTrunk ? foliageHeight : 1 + random.nextInt(2);
    for (let y = offset; y >= offset - layers; y -= 1) {
      const radius = foliageRadius + attachment.radiusOffset + 1 - y;
      placeLeavesRow(attachment.pos, radius, y, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
    }
    return;
  }
  if (foliage.type === "minecraft:mega_pine_foliage_placer") {
    let previousRadius = 0;
    const centerY = attachment.pos[1];
    for (let y = centerY - foliageHeight + offset; y <= centerY + offset; y += 1) {
      const relativeY = centerY - y;
      const scaled = Math.fround(Math.fround(relativeY / foliageHeight) * Math.fround(3.5));
      const radius = foliageRadius + attachment.radiusOffset + Math.floor(scaled);
      const rowRadius = relativeY > 0 && radius === previousRadius && (y & 1) === 0 ? radius + 1 : radius;
      placeLeavesRow([attachment.pos[0], y, attachment.pos[2]], rowRadius, 0, leaf, random, world, leaves, foliage.type, attachment.doubleTrunk);
      previousRadius = radius;
    }
    return;
  }
  if (foliage.type === "minecraft:spruce_foliage_placer") {
    let radius = random.nextInt(2);
    let radiusLimit = 1;
    let previousRadius = 0;
    for (let y = offset; y >= -foliageHeight; y -= 1) {
      placeLeavesRow(attachment.pos, radius, y, leaf, random, world, leaves, asString(foliage.type), attachment.doubleTrunk);
      if (radius >= radiusLimit) {
        radius = previousRadius;
        previousRadius = 1;
        radiusLimit = Math.min(radiusLimit + 1, foliageRadius);
      } else {
        radius += 1;
      }
    }
    return;
  }
  if (foliage.type === "minecraft:pine_foliage_placer") {
    let radius = 0;
    for (let y = offset; y >= offset - foliageHeight; y -= 1) {
      placeLeavesRow(attachment.pos, radius, y, leaf, random, world, leaves, asString(foliage.type), attachment.doubleTrunk);
      if (radius >= 1 && y === offset - foliageHeight + 1) radius -= 1;
      else if (radius < foliageRadius) radius += 1;
    }
    return;
  }
  for (let y = offset; y >= offset - foliageHeight; y -= 1) {
    const radius = foliage.type === "minecraft:bush_foliage_placer"
      ? foliageRadius - 1 - y
      : Math.max(foliageRadius - 1 - Math.trunc(y / 2), 0);
    placeLeavesRow(attachment.pos, radius + attachment.radiusOffset, y, leaf, random, world, leaves, asString(foliage.type), attachment.doubleTrunk);
  }
}

function placeLeavesRow(
  center: Pos,
  radius: number,
  yOffset: number,
  leaf: Block,
  random: DecorationRandom,
  world: VoxelWorld,
  leaves: Pos[],
  foliageType: string,
  doubleTrunk = false,
  foliage?: Minecraft26JsonObject,
): void {
  const extension = doubleTrunk ? 1 : 0;
  for (let dx = -radius; dx <= radius + extension; dx += 1) {
    for (let dz = -radius; dz <= radius + extension; dz += 1) {
      const ax = doubleTrunk ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
      const az = doubleTrunk ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
      let skip = false;
      if (foliageType === "minecraft:blob_foliage_placer") {
        skip = ax === radius && az === radius && (random.nextInt(2) === 0 || yOffset === 0);
      } else if (foliageType === "minecraft:bush_foliage_placer") {
        skip = ax === radius && az === radius && random.nextInt(2) === 0;
      } else if (foliageType === "minecraft:acacia_foliage_placer") {
        skip = yOffset === 0
          ? (ax > 1 || az > 1) && ax !== 0 && az !== 0
          : ax === radius && az === radius && radius > 0;
      } else if (foliageType === "minecraft:cherry_foliage_placer") {
        if (yOffset === -1 && (ax === radius || az === radius)
          && random.nextFloat() < asNumber(foliage?.wide_bottom_layer_hole_chance)) {
          skip = true;
        } else {
          const corner = ax === radius && az === radius;
          if (radius > 2) {
            skip = corner || (!corner && ax + az > radius * 2 - 2
              && random.nextFloat() < asNumber(foliage?.corner_hole_chance));
          } else {
            skip = corner && random.nextFloat() < asNumber(foliage?.corner_hole_chance);
          }
        }
      } else if (foliageType === "minecraft:dark_oak_foliage_placer") {
        if (doubleTrunk && yOffset === 0) {
          skip = (dx === -radius || dx >= radius) && (dz === -radius || dz >= radius);
        } else if (!doubleTrunk && yOffset === -1) {
          skip = ax === radius && az === radius;
        } else if (yOffset === 1) {
          skip = ax + az > 2 * radius - 2;
        }
      } else if (foliageType === "minecraft:jungle_foliage_placer"
        || foliageType === "minecraft:mega_pine_foliage_placer") {
        skip = ax + az >= 7 || ax * ax + az * az > radius * radius;
      } else if (foliageType === "minecraft:fancy_foliage_placer") {
        const fx = Math.fround(ax + Math.fround(0.5));
        const fz = Math.fround(az + Math.fround(0.5));
        skip = Math.fround(Math.fround(fx * fx) + Math.fround(fz * fz)) > radius * radius;
      } else {
        skip = ax === radius && az === radius && radius > 0;
      }
      if (skip) continue;
      const pos: Pos = [center[0] + dx, center[1] + yOffset, center[2] + dz];
      if (!isReplaceable(world, ...pos)) continue;
      setBlock(world, ...pos, leaf);
      leaves.push(pos);
    }
  }
}

function applyTreeDecorators(
  decorators: readonly Minecraft26Json[],
  logs: Pos[],
  leaves: Pos[],
  random: DecorationRandom,
  world: VoxelWorld,
): void {
  sortAndDeduplicatePositions(logs);
  sortAndDeduplicatePositions(leaves);
  for (const raw of decorators) {
    const decorator = asObject(raw);
    if (!decorator) continue;
    if (decorator.type === "minecraft:beehive") {
      placeBeeNest(asNumber(decorator.probability), logs, leaves, random, world);
    } else if (decorator.type === "minecraft:trunk_vine") {
      for (const log of logs) {
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          if (random.nextInt(3) > 0 && getBlock(world, log[0] + dx, log[1], log[2] + dz) === Block.Air) {
            setBlock(world, log[0] + dx, log[1], log[2] + dz, Block.Vine);
          }
        }
      }
    } else if (decorator.type === "minecraft:leave_vine") {
      placeLeafVines(asNumber(decorator.probability), leaves, random, world);
    } else if (decorator.type === "minecraft:alter_ground") {
      alterGroundAroundTree(logs, random, world);
    }
  }
}

function placeLeafVines(
  probability: number,
  leaves: readonly Pos[],
  random: DecorationRandom,
  world: VoxelWorld,
): void {
  for (const leaf of leaves) {
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (random.nextFloat() >= probability) continue;
      let pos: Pos = [leaf[0] + dx, leaf[1], leaf[2] + dz];
      if (getBlock(world, ...pos) !== Block.Air) continue;
      setBlock(world, ...pos, Block.Vine);
      for (let remaining = 4; remaining > 0; remaining -= 1) {
        pos = [pos[0], pos[1] - 1, pos[2]];
        if (getBlock(world, ...pos) !== Block.Air) break;
        setBlock(world, ...pos, Block.Vine);
      }
    }
  }
}

function alterGroundAroundTree(logs: readonly Pos[], random: DecorationRandom, world: VoxelWorld): void {
  if (logs.length === 0) return;
  const lowestY = logs[0][1];
  for (const log of logs) {
    if (log[1] !== lowestY) break;
    for (const [dx, dz] of [[-1, -1], [2, -1], [-1, 2], [2, 2]] as const) {
      placeAlterGroundCircle([log[0] + dx, log[1], log[2] + dz], world);
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const packed = random.nextInt(64);
      const dx = packed % 8;
      const dz = Math.trunc(packed / 8);
      if (dx === 0 || dx === 7 || dz === 0 || dz === 7) {
        placeAlterGroundCircle([log[0] - 3 + dx, log[1], log[2] - 3 + dz], world);
      }
    }
  }
}

function placeAlterGroundCircle(center: Pos, world: VoxelWorld): void {
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      for (let dy = 2; dy >= -3; dy -= 1) {
        const pos: Pos = [center[0] + dx, center[1] + dy, center[2] + dz];
        const block = getBlock(world, ...pos);
        if (isPodzolReplaceable(block)) {
          setBlock(world, ...pos, Block.Podzol);
          break;
        }
        if (block !== Block.Air && dy < 0) break;
      }
    }
  }
}

function isPodzolReplaceable(block: Block): boolean {
  return SOIL.has(block) || block === Block.Grass || block === Block.Mycelium;
}

function sortAndDeduplicatePositions(positions: Pos[]): void {
  positions.sort(comparePos);
  let write = 0;
  for (const pos of positions) {
    if (write > 0 && samePos(positions[write - 1], pos)) continue;
    positions[write] = pos;
    write += 1;
  }
  positions.length = write;
}

function placeBeeNest(probability: number, logs: Pos[], leaves: Pos[], random: DecorationRandom, world: VoxelWorld): void {
  if (logs.length === 0 || random.nextFloat() >= probability) return;
  const targetY = leaves.length > 0 ? Math.max(leaves[0][1] - 1, logs[0][1] + 1) : Math.min(logs[0][1] + 1 + random.nextInt(3), logs.at(-1)?.[1] ?? logs[0][1]);
  const candidates: Pos[] = [];
  for (const log of logs) {
    if (log[1] !== targetY) continue;
    // Horizontal enum order with north (the opposite of worldgen south) removed.
    candidates.push([log[0] + 1, log[1], log[2]], [log[0], log[1], log[2] + 1], [log[0] - 1, log[1], log[2]]);
  }
  shuffle(candidates, random);
  const target = candidates.find(([x, y, z]) => getBlock(world, x, y, z) === Block.Air && getBlock(world, x, y, z + 1) === Block.Air);
  if (!target) return;
  setBlock(world, ...target, Block.BeeNest);
  const bees = 2 + random.nextInt(2);
  for (let index = 0; index < bees; index += 1) random.nextInt(599);
}

function testBlockPredicate(predicate: Minecraft26JsonObject | undefined, pos: Pos, world: VoxelWorld): boolean {
  if (!predicate) return false;
  const offset = asArray(predicate.offset).map((value) => asNumber(value));
  const target: Pos = [pos[0] + (offset[0] ?? 0), pos[1] + (offset[1] ?? 0), pos[2] + (offset[2] ?? 0)];
  switch (predicate.type) {
    case "minecraft:would_survive":
      return getBlock(world, ...target) === Block.Air && SOIL.has(getBlock(world, target[0], target[1] - 1, target[2]));
    case "minecraft:matching_blocks": {
      const names = Array.isArray(predicate.blocks) ? predicate.blocks : [predicate.blocks];
      const block = getBlock(world, ...target);
      return names.some((name) => typeof name === "string" && blockIdFromMinecraftName(name) === block);
    }
    case "minecraft:matching_block_tag":
      return predicate.tag === "minecraft:air" ? getBlock(world, ...target) === Block.Air : false;
    case "minecraft:not":
      return !testBlockPredicate(asObject(predicate.predicate), target, world);
    default:
      return false;
  }
}

function placedFeatureContainsTree(id: string, seen = new Set<string>()): boolean {
  const key = `p:${id}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const placed = getMinecraft26PlacedFeature(id);
  return placed ? configuredFeatureContainsTree(placed.feature, seen) : false;
}

function configuredFeatureContainsTree(reference: Minecraft26Json, seen: Set<string>): boolean {
  const configured = typeof reference === "string" ? getMinecraft26ConfiguredFeature(reference) : asObject(reference);
  if (!configured) return false;
  if (configured.type === "minecraft:tree") return true;
  const key = typeof reference === "string" ? `c:${reference}` : undefined;
  if (key && seen.has(key)) return false;
  if (key) seen.add(key);
  const config = asObject(configured.config);
  if (!config) return false;
  if (configured.type === "minecraft:random_selector") {
    return asArray(config.features).some((entry) => {
      const feature = asObject(entry)?.feature;
      return feature !== undefined && placedReferenceContainsTree(feature, new Set(seen));
    }) || placedReferenceContainsTree(config.default, new Set(seen));
  }
  if (configured.type === "minecraft:simple_random_selector") {
    return asArray(config.features).some((feature) => placedReferenceContainsTree(feature, new Set(seen)));
  }
  if (configured.type === "minecraft:random_boolean_selector") {
    return placedReferenceContainsTree(config.feature_true, new Set(seen))
      || placedReferenceContainsTree(config.feature_false, new Set(seen));
  }
  return false;
}

function placedReferenceContainsTree(reference: Minecraft26Json | undefined, seen: Set<string>): boolean {
  if (reference === undefined) return false;
  if (typeof reference === "string") return placedFeatureContainsTree(reference, seen);
  const placed = asObject(reference);
  return placed?.feature !== undefined && configuredFeatureContainsTree(placed.feature, seen);
}

function sampleStateProvider(raw: Minecraft26Json | undefined, random: DecorationRandom): Block | undefined {
  const provider = asObject(raw);
  if (!provider) return undefined;
  if (provider.type === "minecraft:simple_state_provider") return stateToBlock(provider.state);
  if (provider.type === "minecraft:weighted_state_provider") {
    const entries = asArray(provider.entries);
    const total = entries.reduce<number>((sum, entry) => sum + asNumber(asObject(entry)?.weight), 0);
    let selected = random.nextInt(Math.max(total, 1));
    for (const rawEntry of entries) {
      const entry = asObject(rawEntry);
      selected -= asNumber(entry?.weight);
      if (selected < 0) return stateToBlock(entry?.data);
    }
  }
  return undefined;
}

function firstStateProviderBlock(raw: Minecraft26Json | undefined): Block | undefined {
  const provider = asObject(raw);
  if (!provider) return undefined;
  if (provider.type === "minecraft:simple_state_provider") return stateToBlock(provider.state);
  if (provider.type === "minecraft:weighted_state_provider") {
    return stateToBlock(asObject(asArray(provider.entries)[0])?.data);
  }
  return undefined;
}

function sampleBelowTrunkProvider(raw: Minecraft26Json | undefined, random: DecorationRandom): Block | undefined {
  const provider = asObject(raw);
  if (!provider) return undefined;
  if (provider.type !== "minecraft:rule_based_state_provider") return sampleStateProvider(raw, random);
  for (const rawRule of asArray(provider.rules)) {
    const rule = asObject(rawRule);
    const sampled = sampleStateProvider(rule?.then, random);
    if (sampled !== undefined) return sampled;
  }
  return sampleStateProvider(provider.fallback, random);
}

function stateToBlock(raw: Minecraft26Json | undefined): Block | undefined {
  const name = asObject(raw)?.Name;
  return typeof name === "string" ? blockIdFromMinecraftName(name) : undefined;
}

function sampleInt(raw: Minecraft26Json | undefined, random: DecorationRandom): number {
  if (typeof raw === "number") return Math.trunc(raw);
  const provider = asObject(raw);
  if (!provider) return 0;
  if (provider.type === "minecraft:constant") return asNumber(provider.value);
  if (provider.type === "minecraft:uniform" || (provider.min_inclusive !== undefined && provider.max_inclusive !== undefined)) {
    const min = asNumber(provider.min_inclusive);
    return min + random.nextInt(asNumber(provider.max_inclusive) - min + 1);
  }
  if (provider.type === "minecraft:weighted_list") {
    const entries = asArray(provider.distribution);
    const total = entries.reduce<number>((sum, entry) => sum + asNumber(asObject(entry)?.weight), 0);
    let selected = random.nextInt(Math.max(total, 1));
    for (const rawEntry of entries) {
      const entry = asObject(rawEntry);
      selected -= asNumber(entry?.weight);
      if (selected < 0) return sampleInt(entry?.data, random);
    }
  }
  return 0;
}

function getMaxFreeTreeHeight(world: VoxelWorld, origin: Pos, height: number, rawSize: Minecraft26JsonObject | undefined): number {
  const type = asString(rawSize?.type, "minecraft:two_layers_feature_size");
  for (let y = 0; y <= height + 1; y += 1) {
    let radius = 0;
    if (type === "minecraft:two_layers_feature_size") {
      radius = y < asNumber(rawSize?.limit, 1) ? asNumber(rawSize?.lower_size, 0) : asNumber(rawSize?.upper_size, 1);
    } else if (type === "minecraft:three_layers_feature_size") {
      if (y < asNumber(rawSize?.limit, 1)) {
        radius = asNumber(rawSize?.lower_size, 0);
      } else if (y >= height - asNumber(rawSize?.upper_limit, 1)) {
        radius = asNumber(rawSize?.upper_size, 1);
      } else {
        radius = asNumber(rawSize?.middle_size, 1);
      }
    }
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        if (!isFree(world, origin[0] + dx, origin[1] + y, origin[2] + dz)) return y - 2;
      }
    }
  }
  return height;
}

function isFree(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const block = getBlock(world, x, y, z);
  return REPLACEABLE.has(block) || isLog(block);
}

function isReplaceable(world: VoxelWorld, x: number, y: number, z: number): boolean {
  return REPLACEABLE.has(getBlock(world, x, y, z));
}

function isLog(block: Block): boolean {
  return block >= Block.OakLog && block <= Block.PaleOakLog && block % 2 === 0;
}

function getOceanFloor(world: VoxelWorld, x: number, z: number): number {
  const column = localColumn(world, x, z);
  return column === undefined ? world.minY : world.heightmap[column];
}

function getWorldSurface(world: VoxelWorld, x: number, z: number): number {
  if (localColumn(world, x, z) === undefined) return world.minY;
  for (let y = world.maxY; y >= world.minY; y -= 1) if (getBlock(world, x, y, z) !== Block.Air) return y;
  return world.minY;
}

function getBlock(world: VoxelWorld, x: number, y: number, z: number): Block {
  const column = localColumn(world, x, z);
  if (column === undefined || y < world.minY || y > world.maxY) return Block.Air;
  return world.blocks[(y - world.minY) * world.width * world.length + column] as Block;
}

function setBlock(world: VoxelWorld, x: number, y: number, z: number, block: Block): void {
  const column = localColumn(world, x, z);
  if (column === undefined || y < world.minY || y > world.maxY) return;
  world.blocks[(y - world.minY) * world.width * world.length + column] = block;
}

function localColumn(world: VoxelWorld, x: number, z: number): number | undefined {
  const localX = x - world.originX;
  const localZ = z - world.originZ;
  if (localX < 0 || localX >= world.width || localZ < 0 || localZ >= world.length) return undefined;
  return localZ * world.width + localX;
}

function refreshHeightmap(world: VoxelWorld, logs: Pos[], leaves: Pos[]): void {
  const columns = new Set<number>();
  for (const [x, , z] of [...logs, ...leaves]) {
    const column = localColumn(world, x, z);
    if (column !== undefined) columns.add(column);
  }
  for (const column of columns) {
    const x = world.originX + column % world.width;
    const z = world.originZ + Math.floor(column / world.width);
    let top = world.minY;
    for (let y = world.maxY; y >= world.minY; y -= 1) {
      const block = getBlock(world, x, y, z);
      if (block !== Block.Air && block !== Block.Water && block !== Block.Lava) {
        top = y;
        break;
      }
    }
    world.heightmap[column] = top;
  }
}

function shuffle<T>(values: T[], random: DecorationRandom): void {
  for (let index = values.length; index > 1; index -= 1) {
    const swap = random.nextInt(index);
    [values[index - 1], values[swap]] = [values[swap], values[index - 1]];
  }
}

function comparePos(a: Pos, b: Pos): number {
  return a[1] - b[1] || a[0] - b[0] || a[2] - b[2];
}

function asObject(value: Minecraft26Json | undefined): Minecraft26JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function asArray(value: Minecraft26Json | undefined): readonly Minecraft26Json[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: Minecraft26Json | undefined, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function asString(value: Minecraft26Json | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
