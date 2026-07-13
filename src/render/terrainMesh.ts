import * as THREE from "three";
import { Block } from "../worldgen/blocks";
import type { VoxelWorld } from "../worldgen/types";

interface MeshBuffers {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  quads: number;
}

export interface TerrainMeshResult {
  group: THREE.Group;
  faceCount: number;
}

export type TerrainViewMode = "surface" | "full";

const FACE_DATA = [
  { direction: [-1, 0, 0], shade: 0.72, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { direction: [1, 0, 0], shade: 0.86, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { direction: [0, -1, 0], shade: 0.55, corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { direction: [0, 1, 0], shade: 1, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { direction: [0, 0, -1], shade: 0.78, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { direction: [0, 0, 1], shade: 0.92, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
] as const;

const COLORS: Partial<Record<Block, THREE.Color>> = {
  [Block.Stone]: new THREE.Color("#858681"),
  [Block.Grass]: new THREE.Color("#668f43"),
  [Block.Dirt]: new THREE.Color("#78583d"),
  [Block.Water]: new THREE.Color("#2769b6"),
  [Block.Lava]: new THREE.Color("#ed6b1f"),
  [Block.Sand]: new THREE.Color("#d9c985"),
  [Block.Gravel]: new THREE.Color("#8b8884"),
  [Block.Deepslate]: new THREE.Color("#4f5354"),
  [Block.Bedrock]: new THREE.Color("#313437"),
  [Block.Sandstone]: new THREE.Color("#cdbb77"),
  [Block.RedSand]: new THREE.Color("#bd642e"),
  [Block.RedSandstone]: new THREE.Color("#a9572b"),
  [Block.Snow]: new THREE.Color("#eef5f7"),
  [Block.PowderSnow]: new THREE.Color("#dcebef"),
  [Block.Ice]: new THREE.Color("#89bfe8"),
  [Block.PackedIce]: new THREE.Color("#5d9fd9"),
  [Block.Calcite]: new THREE.Color("#d9d5c9"),
  [Block.Clay]: new THREE.Color("#9ca9b5"),
  [Block.Mud]: new THREE.Color("#3b332e"),
  [Block.Mycelium]: new THREE.Color("#725a6d"),
  [Block.Podzol]: new THREE.Color("#5d3e24"),
  [Block.CoarseDirt]: new THREE.Color("#6a4b34"),
  [Block.Terracotta]: new THREE.Color("#9b5b43"),
  [Block.Granite]: new THREE.Color("#9b6756"),
  [Block.Tuff]: new THREE.Color("#606a62"),
  [Block.CopperOre]: new THREE.Color("#b36f50"),
  [Block.RawCopper]: new THREE.Color("#d57b43"),
  [Block.IronOre]: new THREE.Color("#9b836f"),
  [Block.RawIron]: new THREE.Color("#b99a7a"),
  [Block.Cinnabar]: new THREE.Color("#a62525"),
  [Block.Sulfur]: new THREE.Color("#d5c63e"),
};

const LIQUIDS = new Set<number>([Block.Water, Block.Lava]);

function createBuffers(): MeshBuffers {
  return { positions: [], normals: [], colors: [], indices: [], quads: 0 };
}

function addQuad(
  target: MeshBuffers,
  corners: readonly (readonly number[])[],
  normal: readonly number[],
  color: THREE.Color,
  shade: number,
  x: number,
  y: number,
  z: number,
): void {
  const vertex = target.positions.length / 3;
  for (const corner of corners) {
    target.positions.push(x + corner[0], y + corner[1], z + corner[2]);
    target.normals.push(normal[0], normal[1], normal[2]);
    target.colors.push(color.r * shade, color.g * shade, color.b * shade);
  }
  target.indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
  target.quads += 1;
}

function geometryFrom(buffers: MeshBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(buffers.colors, 3));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function groupFrom(world: VoxelWorld, opaque: MeshBuffers, liquid: MeshBuffers): TerrainMeshResult {
  const group = new THREE.Group();
  const offsetX = -world.width / 2;
  const offsetZ = -world.length / 2;
  if (opaque.quads) {
    const mesh = new THREE.Mesh(geometryFrom(opaque), new THREE.MeshBasicMaterial({ vertexColors: true }));
    mesh.position.set(offsetX, 0, offsetZ);
    group.add(mesh);
  }
  if (liquid.quads) {
    const mesh = new THREE.Mesh(
      geometryFrom(liquid),
      new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }),
    );
    mesh.position.set(offsetX, 0, offsetZ);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return { group, faceCount: opaque.quads + liquid.quads };
}

export function buildTerrainMesh(
  world: VoxelWorld,
  maximumY = world.maxY,
  mode: TerrainViewMode = "surface",
): TerrainMeshResult {
  const opaque = createBuffers();
  const liquid = createBuffers();
  const oneY = world.width * world.length;
  const cutoff = Math.max(world.minY, Math.min(world.maxY, Math.trunc(maximumY)));
  const pack = (x: number, y: number, z: number): number => x + z * world.width + (y - world.minY) * oneY;
  const sample = (x: number, y: number, z: number): Block => {
    if (x < 0 || x >= world.width || y < world.minY || y > cutoff || z < 0 || z >= world.length) return Block.Air;
    return world.blocks[pack(x, y, z)] as Block;
  };

  if (mode === "surface") {
    const topY = new Int16Array(oneY);
    const topBlock = new Uint8Array(oneY);
    topY.fill(world.minY - 1);

    for (let z = 0; z < world.length; z += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const column = z * world.width + x;
        const searchTop = Math.min(cutoff, Math.max(world.heightmap[column], world.seaLevel));
        for (let y = searchTop; y >= world.minY; y -= 1) {
          const block = sample(x, y, z);
          if (block === Block.Air) continue;
          topY[column] = y;
          topBlock[column] = block;
          break;
        }
      }
    }

    const sideFaces = [0, 1, 4, 5] as const;
    for (let z = 0; z < world.length; z += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const column = z * world.width + x;
        const y = topY[column];
        if (y < world.minY) continue;
        const block = topBlock[column] as Block;
        const buffers = LIQUIDS.has(block) ? liquid : opaque;
        addQuad(buffers, FACE_DATA[3].corners, FACE_DATA[3].direction, COLORS[block] ?? COLORS[Block.Stone]!, 1, x, y - world.minY, z);

        for (const faceIndex of sideFaces) {
          const face = FACE_DATA[faceIndex];
          const neighborX = x + face.direction[0];
          const neighborZ = z + face.direction[2];
          if (neighborX < 0 || neighborX >= world.width || neighborZ < 0 || neighborZ >= world.length) continue;
          const neighborTop = topY[neighborZ * world.width + neighborX];
          for (let sideY = y; sideY > neighborTop; sideY -= 1) {
            const sideBlock = sample(x, sideY, z);
            if (sideBlock === Block.Air) continue;
            const sideBuffers = LIQUIDS.has(sideBlock) ? liquid : opaque;
            addQuad(
              sideBuffers,
              face.corners,
              face.direction,
              COLORS[sideBlock] ?? COLORS[Block.Stone]!,
              face.shade,
              x,
              sideY - world.minY,
              z,
            );
          }
        }
      }
    }
    return groupFrom(world, opaque, liquid);
  }

  for (let y = world.minY; y <= cutoff; y += 1) {
    const displayY = y - world.minY;
    for (let z = 0; z < world.length; z += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const block = sample(x, y, z);
        if (block === Block.Air) continue;
        const isLiquid = LIQUIDS.has(block);
        const buffers = isLiquid ? liquid : opaque;
        const color = COLORS[block] ?? COLORS[Block.Stone]!;
        for (const face of FACE_DATA) {
          const neighborX = x + face.direction[0];
          const neighborY = y + face.direction[1];
          const neighborZ = z + face.direction[2];
          // The preview is a cropped window into an infinite world. Do not
          // draw artificial vertical walls or a bottom cap at crop borders.
          if (neighborX < 0 || neighborX >= world.width || neighborZ < 0 || neighborZ >= world.length || neighborY < world.minY) continue;
          const neighbor = sample(neighborX, neighborY, neighborZ);
          if (neighbor !== Block.Air && (isLiquid || !LIQUIDS.has(neighbor))) continue;
          addQuad(buffers, face.corners, face.direction, color, face.shade, x, displayY, z);
        }
      }
    }
  }
  return groupFrom(world, opaque, liquid);
}

export function disposeTerrain(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
}
