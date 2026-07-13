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
  OakLog = 32,
  OakLeaves = 33,
  SpruceLog = 34,
  SpruceLeaves = 35,
  BirchLog = 36,
  BirchLeaves = 37,
  JungleLog = 38,
  JungleLeaves = 39,
  AcaciaLog = 40,
  AcaciaLeaves = 41,
  DarkOakLog = 42,
  DarkOakLeaves = 43,
  MangroveLog = 44,
  MangroveLeaves = 45,
  CherryLog = 46,
  CherryLeaves = 47,
  PaleOakLog = 48,
  PaleOakLeaves = 49,
  AzaleaLeaves = 50,
  FloweringAzaleaLeaves = 51,
  MangroveRoots = 52,
  MuddyMangroveRoots = 53,
  Moss = 54,
  RootedDirt = 55,
  Vine = 56,
  Bamboo = 57,
  BeeNest = 58,
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
  [Block.OakLog]: "Oak log",
  [Block.OakLeaves]: "Oak leaves",
  [Block.SpruceLog]: "Spruce log",
  [Block.SpruceLeaves]: "Spruce leaves",
  [Block.BirchLog]: "Birch log",
  [Block.BirchLeaves]: "Birch leaves",
  [Block.JungleLog]: "Jungle log",
  [Block.JungleLeaves]: "Jungle leaves",
  [Block.AcaciaLog]: "Acacia log",
  [Block.AcaciaLeaves]: "Acacia leaves",
  [Block.DarkOakLog]: "Dark oak log",
  [Block.DarkOakLeaves]: "Dark oak leaves",
  [Block.MangroveLog]: "Mangrove log",
  [Block.MangroveLeaves]: "Mangrove leaves",
  [Block.CherryLog]: "Cherry log",
  [Block.CherryLeaves]: "Cherry leaves",
  [Block.PaleOakLog]: "Pale oak log",
  [Block.PaleOakLeaves]: "Pale oak leaves",
  [Block.AzaleaLeaves]: "Azalea leaves",
  [Block.FloweringAzaleaLeaves]: "Flowering azalea leaves",
  [Block.MangroveRoots]: "Mangrove roots",
  [Block.MuddyMangroveRoots]: "Muddy mangrove roots",
  [Block.Moss]: "Moss block",
  [Block.RootedDirt]: "Rooted dirt",
  [Block.Vine]: "Vine",
  [Block.Bamboo]: "Bamboo",
  [Block.BeeNest]: "Bee nest",
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
  if (id === "oak_log" || id === "oak_wood") return Block.OakLog;
  if (id === "oak_leaves") return Block.OakLeaves;
  if (id === "spruce_log" || id === "spruce_wood") return Block.SpruceLog;
  if (id === "spruce_leaves") return Block.SpruceLeaves;
  if (id === "birch_log" || id === "birch_wood") return Block.BirchLog;
  if (id === "birch_leaves") return Block.BirchLeaves;
  if (id === "jungle_log" || id === "jungle_wood") return Block.JungleLog;
  if (id === "jungle_leaves") return Block.JungleLeaves;
  if (id === "acacia_log" || id === "acacia_wood") return Block.AcaciaLog;
  if (id === "acacia_leaves") return Block.AcaciaLeaves;
  if (id === "dark_oak_log" || id === "dark_oak_wood") return Block.DarkOakLog;
  if (id === "dark_oak_leaves") return Block.DarkOakLeaves;
  if (id === "mangrove_log" || id === "mangrove_wood") return Block.MangroveLog;
  if (id === "mangrove_leaves") return Block.MangroveLeaves;
  if (id === "cherry_log" || id === "cherry_wood") return Block.CherryLog;
  if (id === "cherry_leaves") return Block.CherryLeaves;
  if (id === "pale_oak_log" || id === "pale_oak_wood") return Block.PaleOakLog;
  if (id === "pale_oak_leaves") return Block.PaleOakLeaves;
  if (id === "azalea_leaves") return Block.AzaleaLeaves;
  if (id === "flowering_azalea_leaves") return Block.FloweringAzaleaLeaves;
  if (id === "mangrove_roots") return Block.MangroveRoots;
  if (id === "muddy_mangrove_roots") return Block.MuddyMangroveRoots;
  if (id === "moss_block" || id === "moss_carpet" || id === "pale_moss_carpet") return Block.Moss;
  if (id === "rooted_dirt") return Block.RootedDirt;
  if (id === "vine") return Block.Vine;
  if (id === "bamboo") return Block.Bamboo;
  if (id === "bee_nest") return Block.BeeNest;
  if (id.includes("terracotta")) return Block.Terracotta;
  return Block.Stone;
}
