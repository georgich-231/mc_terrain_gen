export const enum Block {
  Air = 0,
  Stone = 1,
  Grass = 2,
  Dirt = 3,
  Water = 4,
  Lava = 5,
  Sand = 6,
  Gravel = 7,
  Deepslate = 8,
  Bedrock = 9,
  Sandstone = 10,
  RedSand = 11,
  RedSandstone = 12,
  Snow = 13,
  PowderSnow = 14,
  Ice = 15,
  PackedIce = 16,
  Calcite = 17,
  Clay = 18,
  Mud = 19,
  Mycelium = 20,
  Podzol = 21,
  CoarseDirt = 22,
  Terracotta = 23,
  Granite = 24,
  Tuff = 25,
  CopperOre = 26,
  RawCopper = 27,
  IronOre = 28,
  RawIron = 29,
  Cinnabar = 30,
  Sulfur = 31,
}

export const BLOCK_NAMES: Partial<Record<Block, string>> = {
  [Block.Air]: "Air",
  [Block.Stone]: "Stone",
  [Block.Grass]: "Grass block",
  [Block.Dirt]: "Dirt",
  [Block.Water]: "Water",
  [Block.Lava]: "Lava",
  [Block.Sand]: "Sand",
  [Block.Gravel]: "Gravel",
  [Block.Deepslate]: "Deepslate",
  [Block.Bedrock]: "Bedrock",
  [Block.Sandstone]: "Sandstone",
  [Block.RedSand]: "Red sand",
  [Block.RedSandstone]: "Red sandstone",
  [Block.Snow]: "Snow",
  [Block.PowderSnow]: "Powder snow",
  [Block.Ice]: "Ice",
  [Block.PackedIce]: "Packed ice",
  [Block.Calcite]: "Calcite",
  [Block.Clay]: "Clay",
  [Block.Mud]: "Mud",
  [Block.Mycelium]: "Mycelium",
  [Block.Podzol]: "Podzol",
  [Block.CoarseDirt]: "Coarse dirt",
  [Block.Terracotta]: "Terracotta",
  [Block.Granite]: "Granite",
  [Block.Tuff]: "Tuff",
  [Block.CopperOre]: "Copper ore",
  [Block.RawCopper]: "Raw copper block",
  [Block.IronOre]: "Deepslate iron ore",
  [Block.RawIron]: "Raw iron block",
  [Block.Cinnabar]: "Cinnabar",
  [Block.Sulfur]: "Sulfur",
};

export function blockIdFromMinecraftName(name: string): Block {
  const id = name.replace(/^minecraft:/, "");
  if (id === "air" || id === "cave_air" || id === "void_air") return Block.Air;
  if (id === "water") return Block.Water;
  if (id === "lava") return Block.Lava;
  if (id === "grass_block") return Block.Grass;
  if (id === "dirt") return Block.Dirt;
  if (id === "coarse_dirt") return Block.CoarseDirt;
  if (id === "podzol") return Block.Podzol;
  if (id === "mycelium") return Block.Mycelium;
  if (id === "sand") return Block.Sand;
  if (id === "red_sand") return Block.RedSand;
  if (id === "sandstone") return Block.Sandstone;
  if (id === "red_sandstone") return Block.RedSandstone;
  if (id === "gravel") return Block.Gravel;
  if (id === "deepslate") return Block.Deepslate;
  if (id === "bedrock") return Block.Bedrock;
  if (id === "snow_block") return Block.Snow;
  if (id === "powder_snow") return Block.PowderSnow;
  if (id === "ice") return Block.Ice;
  if (id === "packed_ice") return Block.PackedIce;
  if (id === "calcite") return Block.Calcite;
  if (id === "clay") return Block.Clay;
  if (id === "mud") return Block.Mud;
  if (id === "granite") return Block.Granite;
  if (id === "tuff") return Block.Tuff;
  if (id === "copper_ore") return Block.CopperOre;
  if (id === "raw_copper_block") return Block.RawCopper;
  if (id === "deepslate_iron_ore" || id === "iron_ore") return Block.IronOre;
  if (id === "raw_iron_block") return Block.RawIron;
  if (id === "cinnabar") return Block.Cinnabar;
  if (id === "sulfur") return Block.Sulfur;
  if (id.includes("terracotta")) return Block.Terracotta;
  return Block.Stone;
}
