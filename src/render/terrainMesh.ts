import * as THREE from "three";
import { Block } from "../worldgen/blocks";
import type { VoxelWorld } from "../worldgen/types";
import { textureNameForFace, type Minecraft26TextureAtlas, type TextureAtlasRect } from "./minecraft26Textures";
import { getMinecraft26BiomeColorCache, minecraft26TextureTintRgb } from "./minecraft26BiomeColors";

interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  capacity: number;
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
  [Block.OakLog]: new THREE.Color("#705536"),
  [Block.OakLeaves]: new THREE.Color("#4f7d38"),
  [Block.SpruceLog]: new THREE.Color("#4d3525"),
  [Block.SpruceLeaves]: new THREE.Color("#355d43"),
  [Block.BirchLog]: new THREE.Color("#d4d0b5"),
  [Block.BirchLeaves]: new THREE.Color("#669447"),
  [Block.JungleLog]: new THREE.Color("#70523a"),
  [Block.JungleLeaves]: new THREE.Color("#3f813e"),
  [Block.AcaciaLog]: new THREE.Color("#6c6253"),
  [Block.AcaciaLeaves]: new THREE.Color("#638b35"),
  [Block.DarkOakLog]: new THREE.Color("#382b20"),
  [Block.DarkOakLeaves]: new THREE.Color("#315c2f"),
  [Block.MangroveLog]: new THREE.Color("#5b3430"),
  [Block.MangroveLeaves]: new THREE.Color("#4d7d39"),
  [Block.CherryLog]: new THREE.Color("#382b31"),
  [Block.CherryLeaves]: new THREE.Color("#e7a6bc"),
  [Block.PaleOakLog]: new THREE.Color("#aaa89a"),
  [Block.PaleOakLeaves]: new THREE.Color("#65705b"),
  [Block.AzaleaLeaves]: new THREE.Color("#4e843e"),
  [Block.FloweringAzaleaLeaves]: new THREE.Color("#8a8b4c"),
  [Block.MangroveRoots]: new THREE.Color("#5a4736"),
  [Block.MuddyMangroveRoots]: new THREE.Color("#4a3a31"),
  [Block.Moss]: new THREE.Color("#5b7f32"),
  [Block.RootedDirt]: new THREE.Color("#71513a"),
  [Block.Vine]: new THREE.Color("#3f712f"),
  [Block.Bamboo]: new THREE.Color("#5e9b35"),
  [Block.BeeNest]: new THREE.Color("#b98632"),
};

const LIQUIDS = new Set<number>([Block.Water, Block.Lava]);

function createBuffers(initialCapacity = 4_096): MeshBuffers {
  const capacity = Math.max(1, initialCapacity);
  return {
    positions: new Float32Array(capacity * 12),
    normals: new Float32Array(capacity * 12),
    colors: new Float32Array(capacity * 12),
    uvs: new Float32Array(capacity * 8),
    indices: new Uint32Array(capacity * 6),
    capacity,
    quads: 0,
  };
}

function ensureQuadCapacity(target: MeshBuffers): void {
  if (target.quads < target.capacity) return;
  const capacity = target.capacity * 2;
  target.positions = growTypedArray(target.positions, capacity * 12);
  target.normals = growTypedArray(target.normals, capacity * 12);
  target.colors = growTypedArray(target.colors, capacity * 12);
  target.uvs = growTypedArray(target.uvs, capacity * 8);
  target.indices = growTypedArray(target.indices, capacity * 6);
  target.capacity = capacity;
}

function growTypedArray<T extends Float32Array | Uint32Array>(values: T, length: number): T {
  const grown = new (values.constructor as { new(length: number): T })(length);
  grown.set(values);
  return grown;
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
  textureRect?: TextureAtlasRect,
): void {
  ensureQuadCapacity(target);
  const vertex = target.quads * 4;
  let positionOffset = target.quads * 12;
  let uvOffset = target.quads * 8;
  for (const corner of corners) {
    target.positions[positionOffset] = x + corner[0];
    target.positions[positionOffset + 1] = y + corner[1];
    target.positions[positionOffset + 2] = z + corner[2];
    target.normals[positionOffset] = normal[0];
    target.normals[positionOffset + 1] = normal[1];
    target.normals[positionOffset + 2] = normal[2];
    target.colors[positionOffset] = color.r * shade;
    target.colors[positionOffset + 1] = color.g * shade;
    target.colors[positionOffset + 2] = color.b * shade;
    positionOffset += 3;
  }
  if (textureRect) {
    target.uvs[uvOffset] = textureRect.u0;
    target.uvs[uvOffset + 1] = textureRect.v0;
    target.uvs[uvOffset + 2] = textureRect.u1;
    target.uvs[uvOffset + 3] = textureRect.v0;
    target.uvs[uvOffset + 4] = textureRect.u1;
    target.uvs[uvOffset + 5] = textureRect.v1;
    target.uvs[uvOffset + 6] = textureRect.u0;
    target.uvs[uvOffset + 7] = textureRect.v1;
  } else {
    target.uvs.fill(0, uvOffset, uvOffset + 8);
  }
  const indexOffset = target.quads * 6;
  target.indices[indexOffset] = vertex;
  target.indices[indexOffset + 1] = vertex + 1;
  target.indices[indexOffset + 2] = vertex + 2;
  target.indices[indexOffset + 3] = vertex;
  target.indices[indexOffset + 4] = vertex + 2;
  target.indices[indexOffset + 5] = vertex + 3;
  target.quads += 1;
}

function geometryFrom(buffers: MeshBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions.subarray(0, buffers.quads * 12), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals.subarray(0, buffers.quads * 12), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors.subarray(0, buffers.quads * 12), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs.subarray(0, buffers.quads * 8), 2));
  geometry.setIndex(new THREE.BufferAttribute(buffers.indices.subarray(0, buffers.quads * 6), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function groupFrom(
  world: VoxelWorld,
  opaque: MeshBuffers,
  liquid: MeshBuffers,
  overlay: MeshBuffers,
  atlas?: Minecraft26TextureAtlas,
): TerrainMeshResult {
  const group = new THREE.Group();
  const offsetX = -world.width / 2;
  const offsetZ = -world.length / 2;
  if (opaque.quads) {
    const mesh = new THREE.Mesh(geometryFrom(opaque), new THREE.MeshLambertMaterial({
      vertexColors: true,
      ...(atlas ? { map: atlas.texture } : {}),
      alphaTest: 0.45,
    }));
    mesh.position.set(offsetX, 0, offsetZ);
    group.add(mesh);
  }
  if (liquid.quads) {
    const mesh = new THREE.Mesh(
      geometryFrom(liquid),
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        ...(atlas ? { map: atlas.texture } : {}),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    mesh.position.set(offsetX, 0, offsetZ);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  if (overlay.quads) {
    const mesh = new THREE.Mesh(
      geometryFrom(overlay),
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        ...(atlas ? { map: atlas.texture } : {}),
        alphaTest: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    mesh.position.set(offsetX, 0, offsetZ);
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return { group, faceCount: opaque.quads + liquid.quads + overlay.quads };
}

export function buildTerrainMesh(
  world: VoxelWorld,
  maximumY = world.maxY,
  mode: TerrainViewMode = "surface",
  atlas?: Minecraft26TextureAtlas,
): TerrainMeshResult {
  const oneY = world.width * world.length;
  const opaque = createBuffers(mode === "surface" ? oneY * 2 : Math.max(oneY, 16_384));
  const liquid = createBuffers(Math.max(1_024, Math.trunc(oneY / 4)));
  const overlay = createBuffers(Math.max(1_024, Math.trunc(oneY / 4)));
  const cutoff = Math.max(world.minY, Math.min(world.maxY, Math.trunc(maximumY)));
  const biomeColors = atlas ? getMinecraft26BiomeColorCache(world, atlas) : undefined;
  const dynamicColor = new THREE.Color();
  const textureRects = atlas
    ? Array.from({ length: (Block.BeeNest + 1) * FACE_DATA.length }, (_, index) => {
      const block = Math.floor(index / FACE_DATA.length) as Block;
      const faceIndex = index % FACE_DATA.length;
      const textureName = textureNameForFace(block, faceIndex);
      return textureName ? atlas.rects.get(textureName) : undefined;
    })
    : undefined;
  const pack = (x: number, y: number, z: number): number => x + z * world.width + (y - world.minY) * oneY;
  const sample = (x: number, y: number, z: number): Block => {
    if (x < 0 || x >= world.width || y < world.minY || y > cutoff || z < 0 || z >= world.length) return Block.Air;
    return world.blocks[pack(x, y, z)] as Block;
  };
  const faceAppearance = (block: Block, faceIndex: number, x: number, z: number) => {
    const textureRect = textureRects?.[block * FACE_DATA.length + faceIndex];
    const color = textureRect && biomeColors
      ? dynamicColor.setHex(minecraft26TextureTintRgb(biomeColors, block, faceIndex, z * world.width + x))
      : COLORS[block] ?? COLORS[Block.Stone]!;
    return { color, textureRect };
  };
  const addGrassSideOverlay = (block: Block, faceIndex: number, x: number, y: number, z: number, shade: number): void => {
    if (block !== Block.Grass || faceIndex < 0 || faceIndex === 2 || faceIndex === 3 || !atlas) return;
    const textureRect = atlas.rects.get("grass_block_side_overlay");
    if (!textureRect) return;
    addQuad(
      overlay,
      FACE_DATA[faceIndex].corners,
      FACE_DATA[faceIndex].direction,
      dynamicColor.setHex(biomeColors?.grass[z * world.width + x] ?? 0xffffff),
      shade,
      x,
      y,
      z,
      textureRect,
    );
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
        const top = faceAppearance(block, 3, x, z);
        addQuad(buffers, FACE_DATA[3].corners, FACE_DATA[3].direction, top.color, 1, x, y - world.minY, z, top.textureRect);

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
            const appearance = faceAppearance(sideBlock, faceIndex, x, z);
            addQuad(
              sideBuffers,
              face.corners,
              face.direction,
              appearance.color,
              face.shade,
              x,
              sideY - world.minY,
              z,
              appearance.textureRect,
            );
            addGrassSideOverlay(sideBlock, faceIndex, x, sideY - world.minY, z, face.shade);
          }
        }
      }
    }
    return groupFrom(world, opaque, liquid, overlay, atlas);
  }

  for (let y = world.minY; y <= cutoff; y += 1) {
    const displayY = y - world.minY;
    for (let z = 0; z < world.length; z += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const block = sample(x, y, z);
        if (block === Block.Air) continue;
        const isLiquid = LIQUIDS.has(block);
        const buffers = isLiquid ? liquid : opaque;
        for (let faceIndex = 0; faceIndex < FACE_DATA.length; faceIndex += 1) {
          const face = FACE_DATA[faceIndex];
          const neighborX = x + face.direction[0];
          const neighborY = y + face.direction[1];
          const neighborZ = z + face.direction[2];
          // The preview is a cropped window into an infinite world. Do not
          // draw artificial vertical walls or a bottom cap at crop borders.
          if (neighborX < 0 || neighborX >= world.width || neighborZ < 0 || neighborZ >= world.length || neighborY < world.minY) continue;
          const neighbor = sample(neighborX, neighborY, neighborZ);
          if (neighbor !== Block.Air && (isLiquid || !LIQUIDS.has(neighbor))) continue;
          const appearance = faceAppearance(block, faceIndex, x, z);
          addQuad(buffers, face.corners, face.direction, appearance.color, face.shade, x, displayY, z, appearance.textureRect);
          addGrassSideOverlay(block, faceIndex, x, displayY, z, face.shade);
        }
      }
    }
  }
  return groupFrom(world, opaque, liquid, overlay, atlas);
}

export function disposeTerrain(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
}
