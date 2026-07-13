import * as THREE from "three";
import { Block } from "../worldgen/blocks";

export interface TextureAtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface Minecraft26TextureAtlas {
  texture: THREE.CanvasTexture;
  rects: ReadonlyMap<string, TextureAtlasRect>;
  colorMaps: ReadonlyMap<Minecraft26ColorMapName, Uint32Array>;
}

export type Minecraft26ColorMapName = "grass" | "foliage" | "dry_foliage";

interface FaceTextures {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
}

const BLOCK_TEXTURES: Partial<Record<Block, FaceTextures>> = {
  [Block.Stone]: { all: "stone" },
  [Block.Grass]: { top: "grass_block_top", bottom: "dirt", side: "grass_block_side" },
  [Block.Dirt]: { all: "dirt" },
  [Block.Water]: { all: "water_still" },
  [Block.Lava]: { all: "lava_still" },
  [Block.Sand]: { all: "sand" },
  [Block.Gravel]: { all: "gravel" },
  [Block.Deepslate]: { all: "deepslate" },
  [Block.Bedrock]: { all: "bedrock" },
  [Block.Sandstone]: { top: "sandstone_top", bottom: "sandstone_bottom", side: "sandstone" },
  [Block.RedSand]: { all: "red_sand" },
  [Block.RedSandstone]: { top: "red_sandstone_top", bottom: "red_sandstone_bottom", side: "red_sandstone" },
  [Block.Snow]: { all: "snow" },
  [Block.PowderSnow]: { all: "powder_snow" },
  [Block.Ice]: { all: "ice" },
  [Block.PackedIce]: { all: "packed_ice" },
  [Block.Calcite]: { all: "calcite" },
  [Block.Clay]: { all: "clay" },
  [Block.Mud]: { all: "mud" },
  [Block.Mycelium]: { top: "mycelium_top", bottom: "dirt", side: "mycelium_side" },
  [Block.Podzol]: { top: "podzol_top", bottom: "dirt", side: "podzol_side" },
  [Block.CoarseDirt]: { all: "coarse_dirt" },
  [Block.Terracotta]: { all: "terracotta" },
  [Block.Granite]: { all: "granite" },
  [Block.Tuff]: { all: "tuff" },
  [Block.CopperOre]: { all: "copper_ore" },
  [Block.RawCopper]: { all: "raw_copper_block" },
  [Block.IronOre]: { all: "deepslate_iron_ore" },
  [Block.RawIron]: { all: "raw_iron_block" },
  [Block.Cinnabar]: { all: "cinnabar" },
  [Block.Sulfur]: { all: "sulfur" },
  [Block.OakLog]: { top: "oak_log_top", bottom: "oak_log_top", side: "oak_log" },
  [Block.OakLeaves]: { all: "oak_leaves" },
  [Block.SpruceLog]: { top: "spruce_log_top", bottom: "spruce_log_top", side: "spruce_log" },
  [Block.SpruceLeaves]: { all: "spruce_leaves" },
  [Block.BirchLog]: { top: "birch_log_top", bottom: "birch_log_top", side: "birch_log" },
  [Block.BirchLeaves]: { all: "birch_leaves" },
  [Block.JungleLog]: { top: "jungle_log_top", bottom: "jungle_log_top", side: "jungle_log" },
  [Block.JungleLeaves]: { all: "jungle_leaves" },
  [Block.AcaciaLog]: { top: "acacia_log_top", bottom: "acacia_log_top", side: "acacia_log" },
  [Block.AcaciaLeaves]: { all: "acacia_leaves" },
  [Block.DarkOakLog]: { top: "dark_oak_log_top", bottom: "dark_oak_log_top", side: "dark_oak_log" },
  [Block.DarkOakLeaves]: { all: "dark_oak_leaves" },
  [Block.MangroveLog]: { top: "mangrove_log_top", bottom: "mangrove_log_top", side: "mangrove_log" },
  [Block.MangroveLeaves]: { all: "mangrove_leaves" },
  [Block.CherryLog]: { top: "cherry_log_top", bottom: "cherry_log_top", side: "cherry_log" },
  [Block.CherryLeaves]: { all: "cherry_leaves" },
  [Block.PaleOakLog]: { top: "pale_oak_log_top", bottom: "pale_oak_log_top", side: "pale_oak_log" },
  [Block.PaleOakLeaves]: { all: "pale_oak_leaves" },
  [Block.AzaleaLeaves]: { all: "azalea_leaves" },
  [Block.FloweringAzaleaLeaves]: { all: "flowering_azalea_leaves" },
  [Block.MangroveRoots]: { all: "mangrove_roots_top" },
  [Block.MuddyMangroveRoots]: { all: "muddy_mangrove_roots_top" },
  [Block.Moss]: { all: "moss_block" },
  [Block.RootedDirt]: { all: "rooted_dirt" },
  [Block.Vine]: { all: "vine" },
  [Block.Bamboo]: { all: "bamboo_stalk" },
  [Block.BeeNest]: { top: "bee_nest_top", bottom: "bee_nest_bottom", side: "bee_nest_side" },
};

const TEXTURE_NAMES = [...new Set([
  ...Object.values(BLOCK_TEXTURES).flatMap((faces) => Object.values(faces)),
  "grass_block_side_overlay",
])].sort();
const COLOR_MAP_NAMES: readonly Minecraft26ColorMapName[] = ["grass", "foliage", "dry_foliage"];
const TILE_SIZE = 16;
const COLUMNS = 8;

export function textureNameForFace(block: Block, faceIndex: number): string | undefined {
  const faces = BLOCK_TEXTURES[block];
  if (!faces) return undefined;
  if (faceIndex === 3) return faces.top ?? faces.all ?? faces.side;
  if (faceIndex === 2) return faces.bottom ?? faces.all ?? faces.side;
  return faces.side ?? faces.all ?? faces.top;
}

export async function loadMinecraft26TextureAtlas(): Promise<Minecraft26TextureAtlas | undefined> {
  try {
    const [images, colorMapImages] = await Promise.all([
      Promise.all(TEXTURE_NAMES.map(loadBlockTexture)),
      Promise.all(COLOR_MAP_NAMES.map(loadColorMapTexture)),
    ]);
    const rows = Math.ceil(TEXTURE_NAMES.length / COLUMNS);
    const canvas = document.createElement("canvas");
    canvas.width = COLUMNS * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    const drawing = canvas.getContext("2d", { alpha: true });
    if (!drawing) return undefined;
    drawing.imageSmoothingEnabled = false;

    const rects = new Map<string, TextureAtlasRect>();
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      drawing.drawImage(image, 0, 0, sourceSize, sourceSize, column * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      rects.set(TEXTURE_NAMES[index], {
        u0: column / COLUMNS,
        v0: 1 - (row + 1) / rows,
        u1: (column + 1) / COLUMNS,
        v1: 1 - row / rows,
      });
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const colorMaps = new Map<Minecraft26ColorMapName, Uint32Array>();
    for (let index = 0; index < COLOR_MAP_NAMES.length; index += 1) {
      colorMaps.set(COLOR_MAP_NAMES[index], readColorMap(colorMapImages[index]));
    }
    return { texture, rects, colorMaps };
  } catch (error) {
    console.warn("Minecraft 26.2 local textures are unavailable; using voxel colors instead.", error);
    return undefined;
  }
}

export function sampleMinecraft26ColorMap(
  atlas: Minecraft26TextureAtlas,
  name: Minecraft26ColorMapName,
  temperature: number,
  downfall: number,
): number {
  const pixels = atlas.colorMaps.get(name);
  if (!pixels) return name === "grass" ? 0xff00ff : 0x48b518;
  const clampedTemperature = Math.max(0, Math.min(1, temperature));
  const clampedDownfall = Math.max(0, Math.min(1, downfall)) * clampedTemperature;
  const x = Math.trunc((1 - clampedTemperature) * 255);
  const y = Math.trunc((1 - clampedDownfall) * 255);
  return pixels[(y << 8) | x];
}

function loadBlockTexture(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Missing Minecraft 26.2 block texture: ${name}`));
    image.src = `/minecraft26/assets/minecraft/textures/block/${name}.png`;
  });
}

function loadColorMapTexture(name: Minecraft26ColorMapName): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Missing Minecraft 26.2 color map: ${name}`));
    image.src = `/minecraft26/assets/minecraft/textures/colormap/${name}.png`;
  });
}

function readColorMap(image: HTMLImageElement): Uint32Array {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d", { willReadFrequently: true });
  if (!drawing) throw new Error("Canvas 2D is unavailable for Minecraft biome colormaps");
  drawing.drawImage(image, 0, 0, 256, 256);
  const rgba = drawing.getImageData(0, 0, 256, 256).data;
  const colors = new Uint32Array(65_536);
  for (let index = 0; index < colors.length; index += 1) {
    const offset = index * 4;
    colors[index] = rgba[offset] << 16 | rgba[offset + 1] << 8 | rgba[offset + 2];
  }
  return colors;
}
