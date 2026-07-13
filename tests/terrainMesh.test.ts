import { describe, expect, it } from "vitest";
import { buildTerrainMesh, disposeTerrain } from "../src/render/terrainMesh";
import { Block } from "../src/worldgen/blocks";
import type { VoxelWorld } from "../src/worldgen/types";

describe("terrain mesh buffers", () => {
  it("builds and disposes typed surface and full-voxel geometry", () => {
    const world = createTinyWorld();
    const surface = buildTerrainMesh(world, world.maxY, "surface");
    const full = buildTerrainMesh(world, world.maxY, "full");
    expect(surface.faceCount).toBe(4);
    expect(full.faceCount).toBe(8);
    expect(surface.group.children).toHaveLength(1);
    expect(full.group.children).toHaveLength(1);
    disposeTerrain(surface.group);
    disposeTerrain(full.group);
  });
});

function createTinyWorld(): VoxelWorld {
  const width = 2;
  const minY = 0;
  const maxY = 1;
  const oneY = width * width;
  const blocks = new Uint8Array(oneY * 2);
  blocks.fill(Block.Grass, oneY, oneY * 2);
  return {
    blocks,
    heightmap: new Int16Array(oneY).fill(1),
    biomeMap: new Array(oneY).fill("plains"),
    width,
    length: width,
    height: 2,
    minY,
    maxY,
    seaLevel: 1,
    seed: "1",
    version: "26.2",
    originX: 0,
    originZ: 0,
  };
}
