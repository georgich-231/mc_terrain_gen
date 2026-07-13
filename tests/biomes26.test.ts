import { describe, expect, it } from "vitest";
import {
  MINECRAFT_26_2_BIOME_REGISTRY,
  getMinecraft26Biome,
  getMinecraft26SpawnCost,
  getMinecraft26SpawnEntries,
} from "../src/worldgen/biomes26";
import { listMinecraft26OverworldBiomes } from "../src/worldgen/minecraft26BiomeSource.js";
import { Block } from "../src/worldgen/blocks";
import type { VoxelWorld } from "../src/worldgen/types";
import {
  createMinecraft26BiomeColorCache,
  minecraft26TextureTint,
  minecraft26TextureTintRgb,
} from "../src/render/minecraft26BiomeColors";
import type { Minecraft26TextureAtlas } from "../src/render/minecraft26Textures";

describe("Minecraft Java 26.2 biome registry", () => {
  it("contains every official biome and every Overworld climate target", () => {
    expect(MINECRAFT_26_2_BIOME_REGISTRY.version).toBe("26.2");
    expect(MINECRAFT_26_2_BIOME_REGISTRY.dataPackVersion).toBe("107.1");
    expect(MINECRAFT_26_2_BIOME_REGISTRY.sourceSha1).toBe("823e2250d24b3ddac457a60c92a6a941943fcd6a");
    expect(Object.keys(MINECRAFT_26_2_BIOME_REGISTRY.biomes)).toHaveLength(66);

    const overworld = listMinecraft26OverworldBiomes();
    expect(overworld).toHaveLength(55);
    expect(overworld).toEqual(expect.arrayContaining([
      "deep_dark",
      "dripstone_caves",
      "lush_caves",
      "sulfur_caves",
      "frozen_ocean",
      "eroded_badlands",
    ]));
  });

  it("preserves generation stages, weighted spawn groups, and spawn costs", () => {
    const sulfur = getMinecraft26Biome("sulfur_caves");
    expect(sulfur.carvers).toEqual([
      "minecraft:cave",
      "minecraft:cave_extra_underground",
      "minecraft:canyon",
    ]);
    expect(sulfur.features[7]).toEqual(["minecraft:sulfur_spike_cluster", "minecraft:sulfur_spike"]);
    expect(getMinecraft26SpawnEntries("sulfur_caves", "monster")[0]).toEqual({
      type: "minecraft:sulfur_cube",
      weight: 100,
      minCount: 2,
      maxCount: 4,
    });
    expect(getMinecraft26SpawnCost("soul_sand_valley", "ghast")).toEqual({
      charge: 0.7,
      energy_budget: 0.15,
    });
  });

  it("caches the exact default 5x5 grass, foliage, and water blend", () => {
    const width = 4;
    const biomes = [
      "plains", "swamp", "dark_forest", "savanna",
      "forest", "mangrove_swamp", "birch_forest", "desert",
      "meadow", "jungle", "pale_garden", "badlands",
      "river", "cherry_grove", "taiga", "snowy_plains",
    ];
    const world = {
      blocks: new Uint8Array(width * width),
      heightmap: new Int16Array(width * width),
      biomeMap: biomes,
      width,
      length: width,
      height: 1,
      minY: 0,
      maxY: 0,
      seaLevel: 0,
      seed: "1",
      version: "26.2",
      originX: -7,
      originZ: 11,
    } satisfies VoxelWorld;
    const colorMap = new Uint32Array(65_536);
    for (let index = 0; index < colorMap.length; index += 1) colorMap[index] = index * 2_654_435 & 0xffffff;
    const atlas = {
      texture: undefined,
      rects: new Map(),
      colorMaps: new Map([
        ["grass", colorMap],
        ["foliage", colorMap],
        ["dry_foliage", colorMap],
      ]),
    } as unknown as Minecraft26TextureAtlas;
    const cache = createMinecraft26BiomeColorCache(world, atlas);
    for (let z = 0; z < width; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const column = z * width + x;
        for (const block of [Block.Grass, Block.Water, Block.OakLeaves]) {
          const expected = minecraft26TextureTint(world, atlas, block, 3, x, z).getHex();
          expect(minecraft26TextureTintRgb(cache, block, 3, column)).toBe(expected);
        }
      }
    }
  });
});
