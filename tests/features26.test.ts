import { describe, expect, it } from "vitest";
import { Block } from "../src/worldgen/blocks";
import { getMinecraft26FeaturesPerStep } from "../src/worldgen/features26";
import { createModern26BiomeSampler, generateModern26World } from "../src/worldgen/modern26";
import { decorateMinecraft26Trees, minecraft26DecorationSeed } from "../src/worldgen/treeDecoration26";
import type { VoxelWorld } from "../src/worldgen/types";

describe("Minecraft Java 26.2 biome decoration", () => {
  it("reconstructs the official staged placed-feature order", () => {
    const steps = getMinecraft26FeaturesPerStep();
    expect(steps).toHaveLength(11);
    expect(steps[9].map(({ id }) => id)).toEqual(expect.arrayContaining([
      "minecraft:trees_plains",
      "minecraft:trees_birch",
      "minecraft:trees_cherry",
      "minecraft:dark_forest_vegetation",
      "minecraft:pale_garden_vegetation",
    ]));
    expect(new Set(steps[9].map(({ index }) => index)).size).toBe(steps[9].length);
  });

  it("uses Java long overflow for chunk decoration seeds", () => {
    expect(minecraft26DecorationSeed(12345n, 0, 0)).toBe(12345n);
    // Cross-checked against WorldgenRandom(XoroshiroRandomSource) in the
    // official 26.2 server runtime.
    expect(minecraft26DecorationSeed(12345n, 832, 832)).toBe(-5008371761826763463n);
  });

  it("places deterministic trees through biome data and placed-feature modifiers", () => {
    const create = () => {
      const world = generateModern26World({ seed: 12345n, size: 16, startChunkX: 0, startChunkZ: 0 });
      const stats = decorateMinecraft26Trees(world, createModern26BiomeSampler(12345n));
      return { world, stats };
    };
    const first = create();
    const second = create();
    expect(first.world.blocks).toEqual(second.world.blocks);
    expect(first.stats).toEqual(second.stats);
    expect(first.stats.attemptedFeatures).toBeGreaterThan(0);
    expect(first.world.blocks.some((block) => block >= Block.OakLog && block <= Block.BeeNest)).toBe(
      first.stats.placedTrees > 0,
    );
  }, 30_000);

  it("places the official branched acacia and cherry tree families", () => {
    const savanna = createFlatBiomeWorld("savanna");
    const cherry = createFlatBiomeWorld("cherry_grove");
    decorateMinecraft26Trees(savanna, () => "savanna");
    decorateMinecraft26Trees(cherry, () => "cherry_grove");
    expect(savanna.blocks.some((block) => block === Block.AcaciaLog)).toBe(true);
    expect(savanna.blocks.some((block) => block === Block.AcaciaLeaves)).toBe(true);
    expect(cherry.blocks.some((block) => block === Block.CherryLog)).toBe(true);
    expect(cherry.blocks.some((block) => block === Block.CherryLeaves)).toBe(true);
  });

  it("supports every special surface tree family without dropping selections", () => {
    const cases: Array<[string, Block, Block]> = [
      ["dark_forest", Block.DarkOakLog, Block.DarkOakLeaves],
      ["pale_garden", Block.PaleOakLog, Block.PaleOakLeaves],
      ["flower_forest", Block.OakLog, Block.OakLeaves],
      ["jungle", Block.JungleLog, Block.JungleLeaves],
      ["old_growth_pine_taiga", Block.SpruceLog, Block.SpruceLeaves],
      ["mangrove_swamp", Block.MangroveLog, Block.MangroveLeaves],
    ];
    for (const [biome, log, leaf] of cases) {
      const world = createFlatBiomeWorld(biome);
      const stats = decorateMinecraft26Trees(world, () => biome);
      expect(stats.skippedUnsupportedTrees, biome).toBe(0);
      expect(world.blocks.some((block) => block === log), biome).toBe(true);
      expect(world.blocks.some((block) => block === leaf), biome).toBe(true);
    }
  });
});

function createFlatBiomeWorld(biome: string): VoxelWorld {
  const width = 16;
  const height = 384;
  const minY = -64;
  const oneY = width * width;
  const blocks = new Uint8Array(oneY * height);
  const surfaceY = 64;
  for (let z = 0; z < width; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const column = z * width + x;
      blocks[(surfaceY - 1 - minY) * oneY + column] = Block.Dirt;
      blocks[(surfaceY - minY) * oneY + column] = Block.Grass;
    }
  }
  const heightmap = new Int16Array(oneY);
  heightmap.fill(surfaceY);
  return {
    blocks,
    heightmap,
    biomeMap: new Array(oneY).fill(biome),
    width,
    length: width,
    height,
    minY,
    maxY: 319,
    seaLevel: 63,
    seed: "12345",
    version: "26.2",
    originX: 0,
    originZ: 0,
  };
}
