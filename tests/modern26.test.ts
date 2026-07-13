import { describe, expect, it } from "vitest";
import { Block } from "../src/worldgen/blocks";
import { generateModern26World, MODERN_26_2, worldChecksum } from "../src/worldgen/modern26";
import { parseModernSeed } from "../src/worldgen/seed";
import { stitchWorldTiles } from "../src/worldgen/stitch";

describe("Minecraft Java 26.2 seed semantics", () => {
  it("supports the full signed 64-bit seed range and Java text hashes", () => {
    expect(parseModernSeed("18446744073709551615")).toBe(-1n);
    expect(parseModernSeed("Notch")).toBe(75456088n);
  });
});

describe("Minecraft Java 26.2 Overworld router", () => {
  it("uses the official modern vertical range", () => {
    expect(MODERN_26_2).toMatchObject({ minY: -64, maxY: 319, height: 384, seaLevel: 63 });
  });

  it("is deterministic and generates modern density terrain", () => {
    const first = generateModern26World({ seed: 12345n, size: 16 });
    const second = generateModern26World({ seed: 12345n, size: 16 });
    expect(worldChecksum(first.blocks)).toBe(worldChecksum(second.blocks));
    expect(first.blocks).toEqual(second.blocks);

    const counts = new Uint32Array(256);
    for (const block of first.blocks) counts[block] += 1;
    expect(counts[Block.Stone] + counts[Block.Deepslate]).toBeGreaterThan(0);
    expect(counts[Block.Bedrock]).toBeGreaterThan(0);
    expect(counts[Block.Air]).toBeGreaterThan(0);
    expect(first.heightmap.some((height) => height > first.minY)).toBe(true);
  }, 30_000);

  it("matches the official 26.2 clean chunk fixture block-for-block", () => {
    const world = generateModern26World({ seed: 12345n, size: 16, startChunkX: 0, startChunkZ: 0 });
    expect(worldChecksum(world.blocks)).toBe("c729a0b1");

    const counts = new Uint32Array(256);
    for (const block of world.blocks) counts[block] += 1;
    expect({
      air: counts[Block.Air],
      stone: counts[Block.Stone],
      deepslate: counts[Block.Deepslate],
      bedrock: counts[Block.Bedrock],
      water: counts[Block.Water],
      gravel: counts[Block.Gravel],
      tuff: counts[Block.Tuff],
      ironOre: counts[Block.IronOre],
    }).toEqual({
      air: 65890,
      stone: 9253,
      deepslate: 15937,
      bedrock: 778,
      water: 6101,
      gravel: 256,
      tuff: 75,
      ironOre: 14,
    });
  }, 30_000);

  it("keeps absolute chunk output identical when parallel tiles are stitched", () => {
    const seed = 87126n;
    const whole = generateModern26World({ seed, size: 32 });
    const tiles = [
      generateModern26World({ seed, size: 16, startChunkX: -1, startChunkZ: -1 }),
      generateModern26World({ seed, size: 16, startChunkX: 0, startChunkZ: -1 }),
      generateModern26World({ seed, size: 16, startChunkX: -1, startChunkZ: 0 }),
      generateModern26World({ seed, size: 16, startChunkX: 0, startChunkZ: 0 }),
    ];
    const stitched = stitchWorldTiles(tiles, 32, -16, -16);

    expect(stitched.originX).toBe(whole.originX);
    expect(stitched.originZ).toBe(whole.originZ);
    expect(stitched.heightmap).toEqual(whole.heightmap);
    expect(stitched.biomeMap).toEqual(whole.biomeMap);
    expect(stitched.blocks).toEqual(whole.blocks);
  }, 60_000);
});
