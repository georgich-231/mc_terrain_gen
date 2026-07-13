import {
  BlockPos,
  BlockState,
  Identifier,
  type Chunk,
  type NoiseGeneratorSettings,
  type RandomState,
} from "deepslate";
import { minecraft26TemperatureAt } from "./surface26";

const PACKED_ICE = new BlockState("minecraft:packed_ice");
const SNOW_BLOCK = new BlockState("minecraft:snow_block");

export function extendMinecraft26ErodedBadlands(
  chunk: Chunk,
  randomState: RandomState,
  settings: NoiseGeneratorSettings,
  x: number,
  z: number,
  startingHeight: number,
): number | undefined {
  const surface = randomState.getOrCreateNoise(Identifier.parse("minecraft:badlands_surface"));
  const pillar = randomState.getOrCreateNoise(Identifier.parse("minecraft:badlands_pillar"));
  const roof = randomState.getOrCreateNoise(Identifier.parse("minecraft:badlands_pillar_roof"));
  const buffer = Math.min(Math.abs(surface.sample(x, 0, z) * 8.25), pillar.sample(x * 0.2, 0, z * 0.2) * 15);
  if (buffer <= 0) return undefined;
  const pillarFloor = Math.abs(roof.sample(x * 0.75, 0, z * 0.75) * 1.5);
  const startY = Math.floor(64 + Math.min(buffer * buffer * 2.5, Math.ceil(pillarFloor * 50) + 24));
  if (startingHeight > startY) return undefined;

  for (let y = startY; y >= chunk.minY; y -= 1) {
    const state = chunk.getBlockState(BlockPos.create(x, y, z));
    if (state.equals(settings.defaultBlock)) break;
    if (state.equals(BlockState.WATER)) return undefined;
  }
  let highestPlaced: number | undefined;
  for (let y = startY; y >= chunk.minY; y -= 1) {
    const pos = BlockPos.create(x, y, z);
    if (!chunk.getBlockState(pos).equals(BlockState.AIR)) break;
    chunk.setBlockState(pos, settings.defaultBlock);
    highestPlaced ??= y;
  }
  return highestPlaced;
}

export function extendMinecraft26FrozenOcean(
  chunk: Chunk,
  randomState: RandomState,
  x: number,
  z: number,
  startingHeight: number,
  minSurfaceLevel: number,
  biome: string,
  seaLevel: number,
): void {
  const surface = randomState.getOrCreateNoise(Identifier.parse("minecraft:iceberg_surface"));
  const pillar = randomState.getOrCreateNoise(Identifier.parse("minecraft:iceberg_pillar"));
  const roof = randomState.getOrCreateNoise(Identifier.parse("minecraft:iceberg_pillar_roof"));
  const iceberg = Math.min(Math.abs(surface.sample(x, 0, z) * 8.25), pillar.sample(x * 1.28, 0, z * 1.28) * 15);
  if (iceberg <= 1.8) return;

  const icebergRoof = Math.abs(roof.sample(x * 1.17, 0, z * 1.17) * 1.5);
  let top = Math.min(iceberg * iceberg * 1.2, Math.ceil(icebergRoof * 40) + 14);
  if (minecraft26TemperatureAt(biome, x, seaLevel, z) > Math.fround(0.1)) top -= 2;

  let bottom: number;
  if (top > 2) {
    bottom = seaLevel - top - 7;
    top += seaLevel;
  } else {
    top = 0;
    bottom = 0;
  }

  const random = randomState.random.at(x, 0, z);
  const maxSnowDepth = 2 + random.nextInt(4);
  const minSnowHeight = seaLevel + 18 + random.nextInt(10);
  let snowDepth = 0;
  for (let y = Math.max(startingHeight, Math.trunc(top) + 1); y >= minSurfaceLevel; y -= 1) {
    const pos = BlockPos.create(x, y, z);
    const state = chunk.getBlockState(pos);
    const replaceAir = state.equals(BlockState.AIR) && y < Math.trunc(top) && random.nextDouble() > 0.01;
    const replaceWater = state.equals(BlockState.WATER)
      && y > Math.trunc(bottom)
      && y < seaLevel
      && bottom !== 0
      && random.nextDouble() > 0.15;
    if (!replaceAir && !replaceWater) continue;
    if (snowDepth <= maxSnowDepth && y > minSnowHeight) {
      chunk.setBlockState(pos, SNOW_BLOCK);
      snowDepth += 1;
    } else {
      chunk.setBlockState(pos, PACKED_ICE);
    }
  }
}
