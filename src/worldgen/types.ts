export interface VoxelWorld {
  blocks: Uint8Array;
  heightmap: Int16Array;
  biomeMap: string[];
  width: number;
  height: number;
  length: number;
  minY: number;
  maxY: number;
  seaLevel: number;
  seed: string;
  version: "26.2";
  originX: number;
  originZ: number;
}
