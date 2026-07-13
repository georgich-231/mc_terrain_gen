import type { VoxelWorld } from "./types";

export function stitchWorldTiles(
  tiles: readonly VoxelWorld[],
  size: number,
  originX: number,
  originZ: number,
): VoxelWorld {
  if (tiles.length === 0) throw new RangeError("At least one generated tile is required");
  const reference = tiles[0];
  const oneY = size * size;
  const blocks = new Uint8Array(oneY * reference.height);
  const heightmap = new Int16Array(oneY);
  const biomeMap = new Array<string>(oneY);

  for (const tile of tiles) {
    if (tile.height !== reference.height || tile.minY !== reference.minY || tile.maxY !== reference.maxY) {
      throw new RangeError("Generated tiles must use the same vertical range");
    }
    const offsetX = tile.originX - originX;
    const offsetZ = tile.originZ - originZ;
    if (offsetX < 0 || offsetZ < 0 || offsetX + tile.width > size || offsetZ + tile.length > size) {
      throw new RangeError("Generated tile falls outside the requested world window");
    }
    const tileOneY = tile.width * tile.length;
    for (let yIndex = 0; yIndex < reference.height; yIndex += 1) {
      for (let z = 0; z < tile.length; z += 1) {
        const sourceStart = yIndex * tileOneY + z * tile.width;
        const destinationStart = yIndex * oneY + (offsetZ + z) * size + offsetX;
        blocks.set(tile.blocks.subarray(sourceStart, sourceStart + tile.width), destinationStart);
      }
    }
    for (let z = 0; z < tile.length; z += 1) {
      const sourceStart = z * tile.width;
      const destinationStart = (offsetZ + z) * size + offsetX;
      heightmap.set(tile.heightmap.subarray(sourceStart, sourceStart + tile.width), destinationStart);
      for (let x = 0; x < tile.width; x += 1) {
        biomeMap[destinationStart + x] = tile.biomeMap[sourceStart + x];
      }
    }
  }

  return {
    blocks,
    heightmap,
    biomeMap,
    width: size,
    height: reference.height,
    length: size,
    minY: reference.minY,
    maxY: reference.maxY,
    seaLevel: reference.seaLevel,
    seed: reference.seed,
    version: reference.version,
    originX,
    originZ,
  };
}
