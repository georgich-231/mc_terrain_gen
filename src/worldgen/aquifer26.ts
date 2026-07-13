import {
  BlockState,
  DensityFunction,
  type NoiseChunk,
  type NoiseGeneratorSettings,
  type PositionalRandom,
  type RandomState,
} from "deepslate";

type DensityContext = ReturnType<typeof DensityFunction.context>;
type ParsedNoiseSettings = ReturnType<typeof NoiseGeneratorSettings.fromJson>;

interface NoiseChunkAccess {
  readonly minX: number;
  readonly minZ: number;
  getPreliminarySurfaceLevel(blockX: number, blockZ: number): number;
  aquifer: Minecraft26Aquifer;
  materialRule: (context: DensityContext) => BlockState | undefined;
}

interface FluidPicker {
  (x: number, y: number, z: number): FluidStatus;
}

class FluidStatus {
  constructor(
    readonly level: number,
    readonly type: BlockState,
  ) {}

  at(y: number): BlockState {
    return y < this.level ? this.type : BlockState.AIR;
  }

  equals(other: FluidStatus): boolean {
    return this.level === other.level && this.type.equals(other.type);
  }
}

const SURFACE_SAMPLE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-2, -1],
  [-1, -1],
  [0, -1],
  [1, -1],
  [-3, 0],
  [-2, 0],
  [-1, 0],
  [1, 0],
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const WAY_BELOW_MIN_Y = -32_512;

/**
 * Minecraft Java 26.2's noise-aquifer algorithm, implemented against the
 * public density/router abstractions exposed by deepslate.
 */
class Minecraft26Aquifer {
  private readonly minGridX: number;
  private readonly minGridY: number;
  private readonly minGridZ: number;
  private readonly gridSizeX: number;
  private readonly gridSizeZ: number;
  private readonly statuses: Array<FluidStatus | undefined>;
  private readonly locations: Array<readonly [number, number, number] | undefined>;
  private readonly skipSamplingAboveY: number;

  constructor(
    private readonly noiseChunk: NoiseChunkAccess,
    chunkMinX: number,
    chunkMinZ: number,
    private readonly randomState: RandomState,
    private readonly positionalRandom: PositionalRandom,
    minY: number,
    height: number,
    private readonly globalFluid: FluidPicker,
  ) {
    const chunkMaxX = chunkMinX + 15;
    const chunkMaxZ = chunkMinZ + 15;
    this.minGridX = gridX(chunkMinX - 5);
    const maxGridX = gridX(chunkMaxX - 5) + 1;
    this.gridSizeX = maxGridX - this.minGridX + 1;
    this.minGridY = gridY(minY + 1) - 1;
    const maxGridY = gridY(minY + height + 1) + 1;
    const gridSizeY = maxGridY - this.minGridY + 1;
    this.minGridZ = gridZ(chunkMinZ - 5);
    const maxGridZ = gridZ(chunkMaxZ - 5) + 1;
    this.gridSizeZ = maxGridZ - this.minGridZ + 1;
    const gridSize = this.gridSizeX * gridSizeY * this.gridSizeZ;
    this.statuses = new Array(gridSize);
    this.locations = new Array(gridSize);

    const maxSurface = this.maxPreliminarySurfaceLevel(
      fromGridX(this.minGridX, 0),
      fromGridZ(this.minGridZ, 0),
      fromGridX(maxGridX, 9),
      fromGridZ(maxGridZ, 9),
    ) + 8;
    const gridAboveSurface = gridY(maxSurface + 12) + 1;
    this.skipSamplingAboveY = fromGridY(gridAboveSurface, 11) - 1;
  }

  compute(context: DensityContext, density: number): BlockState | undefined {
    if (density > 0) return undefined;

    const { x, y, z } = context;
    const global = this.globalFluid(x, y, z);
    if (y > this.skipSamplingAboveY) return global.at(y);
    if (global.at(y).is(BlockState.LAVA)) return BlockState.LAVA;

    const anchorX = gridX(x - 5);
    const anchorY = gridY(y + 1);
    const anchorZ = gridZ(z - 5);
    const closestDistances = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    const closestIndices = [0, 0, 0, 0];

    for (let offsetX = 0; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetZ = 0; offsetZ <= 1; offsetZ += 1) {
          const currentX = anchorX + offsetX;
          const currentY = anchorY + offsetY;
          const currentZ = anchorZ + offsetZ;
          const index = this.getIndex(currentX, currentY, currentZ);
          const [locationX, locationY, locationZ] = this.getLocation(index, currentX, currentY, currentZ);
          const dx = locationX - x;
          const dy = locationY - y;
          const dz = locationZ - z;
          const distance = dx * dx + dy * dy + dz * dz;

          if (closestDistances[0] >= distance) {
            closestDistances[3] = closestDistances[2];
            closestDistances[2] = closestDistances[1];
            closestDistances[1] = closestDistances[0];
            closestDistances[0] = distance;
            closestIndices[3] = closestIndices[2];
            closestIndices[2] = closestIndices[1];
            closestIndices[1] = closestIndices[0];
            closestIndices[0] = index;
          } else if (closestDistances[1] >= distance) {
            closestDistances[3] = closestDistances[2];
            closestDistances[2] = closestDistances[1];
            closestDistances[1] = distance;
            closestIndices[3] = closestIndices[2];
            closestIndices[2] = closestIndices[1];
            closestIndices[1] = index;
          } else if (closestDistances[2] >= distance) {
            closestDistances[3] = closestDistances[2];
            closestDistances[2] = distance;
            closestIndices[3] = closestIndices[2];
            closestIndices[2] = index;
          } else if (closestDistances[3] >= distance) {
            closestDistances[3] = distance;
            closestIndices[3] = index;
          }
        }
      }
    }

    const first = this.getStatus(closestIndices[0]);
    const similarity12 = similarity(closestDistances[0], closestDistances[1]);
    const fluid = first.at(y);
    if (similarity12 <= 0) return fluid;

    if (fluid.is(BlockState.WATER) && this.globalFluid(x, y - 1, z).at(y - 1).is(BlockState.LAVA)) {
      return fluid;
    }

    let barrierNoise: number | undefined;
    const pressure = (left: FluidStatus, right: FluidStatus): number => {
      if ((left.at(y).is(BlockState.LAVA) && right.at(y).is(BlockState.WATER))
        || (left.at(y).is(BlockState.WATER) && right.at(y).is(BlockState.LAVA))) {
        return 2;
      }
      const levelDifference = Math.abs(left.level - right.level);
      if (levelDifference === 0) return 0;
      const averageLevel = (left.level + right.level) * 0.5;
      const relativeY = y + 0.5 - averageLevel;
      const distanceFromEdge = levelDifference * 0.5 - Math.abs(relativeY);
      let gradient: number;
      if (relativeY > 0) gradient = distanceFromEdge > 0 ? distanceFromEdge / 1.5 : distanceFromEdge / 2.5;
      else gradient = distanceFromEdge + 3 > 0 ? (distanceFromEdge + 3) / 3 : (distanceFromEdge + 3) / 10;
      if (gradient < -2 || gradient > 2) return 2 * gradient;
      barrierNoise ??= this.randomState.router.barrier.compute(context);
      return 2 * (barrierNoise + gradient);
    };

    const second = this.getStatus(closestIndices[1]);
    if (density + similarity12 * pressure(first, second) > 0) return undefined;

    const third = this.getStatus(closestIndices[2]);
    const similarity13 = similarity(closestDistances[0], closestDistances[2]);
    if (similarity13 > 0 && density + similarity12 * similarity13 * pressure(first, third) > 0) return undefined;

    const similarity23 = similarity(closestDistances[1], closestDistances[2]);
    if (similarity23 > 0 && density + similarity12 * similarity23 * pressure(second, third) > 0) return undefined;

    return fluid;
  }

  private getLocation(index: number, x: number, y: number, z: number): readonly [number, number, number] {
    let location = this.locations[index];
    if (!location) {
      const random = this.positionalRandom.at(x, y, z);
      location = [fromGridX(x, random.nextInt(10)), fromGridY(y, random.nextInt(9)), fromGridZ(z, random.nextInt(10))];
      this.locations[index] = location;
    }
    return location;
  }

  private getStatus(index: number): FluidStatus {
    let status = this.statuses[index];
    if (!status) {
      const location = this.locations[index];
      if (!location) throw new Error(`Missing aquifer location at cache index ${index}`);
      status = this.computeFluid(...location);
      this.statuses[index] = status;
    }
    return status;
  }

  private computeFluid(x: number, y: number, z: number): FluidStatus {
    const global = this.globalFluid(x, y, z);
    let lowestSurface = Number.MAX_SAFE_INTEGER;
    const cellTop = y + 12;
    const cellBottom = y - 12;
    let centerBelowGlobalFluid = false;

    for (const [offsetX, offsetZ] of SURFACE_SAMPLE_OFFSETS) {
      const sampleX = x + offsetX * 16;
      const sampleZ = z + offsetZ * 16;
      const preliminarySurface = this.preliminarySurfaceLevel(sampleX, sampleZ);
      const adjustedSurface = preliminarySurface + 8;
      const center = offsetX === 0 && offsetZ === 0;
      if (center && cellBottom > adjustedSurface) return global;

      const cellReachesSurface = cellTop > adjustedSurface;
      if (cellReachesSurface || center) {
        const atSurface = this.globalFluid(sampleX, adjustedSurface, sampleZ);
        if (!atSurface.at(adjustedSurface).is(BlockState.AIR)) {
          if (center) centerBelowGlobalFluid = true;
          if (cellReachesSurface) return atSurface;
        }
      }
      lowestSurface = Math.min(lowestSurface, preliminarySurface);
    }

    const level = this.computeSurfaceLevel(x, y, z, global, lowestSurface, centerBelowGlobalFluid);
    return new FluidStatus(level, this.computeFluidType(x, y, z, global, level));
  }

  private computeSurfaceLevel(
    x: number,
    y: number,
    z: number,
    global: FluidStatus,
    lowestSurface: number,
    centerBelowGlobalFluid: boolean,
  ): number {
    const context = DensityFunction.context(x, y, z);
    let partiallyFlooded: number;
    let fullyFlooded: number;
    const deepDark = this.randomState.router.erosion.compute(context) < Math.fround(-0.225)
      && this.randomState.router.depth.compute(context) > Math.fround(0.9);
    if (deepDark) {
      partiallyFlooded = -1;
      fullyFlooded = -1;
    } else {
      const distanceBelowSurface = lowestSurface + 8 - y;
      const floodednessFactor = centerBelowGlobalFluid ? clampedMap(distanceBelowSurface, 0, 64, 1, 0) : 0;
      const floodedness = clamp(this.randomState.router.fluidLevelFloodedness.compute(context), -1, 1);
      fullyFlooded = floodedness - map(floodednessFactor, 1, 0, -0.3, 0.8);
      partiallyFlooded = floodedness - map(floodednessFactor, 1, 0, -0.8, 0.4);
    }

    if (fullyFlooded > 0) return global.level;
    if (partiallyFlooded <= 0) return WAY_BELOW_MIN_Y;

    const cellX = Math.floor(x / 16);
    const cellY = Math.floor(y / 40);
    const cellZ = Math.floor(z / 16);
    const centerY = cellY * 40 + 20;
    const spread = this.randomState.router.fluidLevelSpread.compute(DensityFunction.context(cellX, cellY, cellZ)) * 10;
    const randomizedLevel = centerY + Math.floor(spread / 3) * 3;
    return Math.min(lowestSurface, randomizedLevel);
  }

  private computeFluidType(x: number, y: number, z: number, global: FluidStatus, surfaceLevel: number): BlockState {
    if (surfaceLevel <= -10 && surfaceLevel !== WAY_BELOW_MIN_Y && !global.type.is(BlockState.LAVA)) {
      const cellX = Math.floor(x / 64);
      const cellY = Math.floor(y / 40);
      const cellZ = Math.floor(z / 64);
      const lava = this.randomState.router.lava.compute(DensityFunction.context(cellX, cellY, cellZ));
      if (Math.abs(lava) > 0.3) return BlockState.LAVA;
    }
    return global.type;
  }

  private preliminarySurfaceLevel(blockX: number, blockZ: number): number {
    return this.noiseChunk.getPreliminarySurfaceLevel(blockX, blockZ);
  }

  private maxPreliminarySurfaceLevel(minX: number, minZ: number, maxX: number, maxZ: number): number {
    let max = Number.MIN_SAFE_INTEGER;
    for (let z = minZ; z <= maxZ; z += 4) {
      for (let x = minX; x <= maxX; x += 4) max = Math.max(max, this.preliminarySurfaceLevel(x, z));
    }
    return max;
  }

  private getIndex(x: number, y: number, z: number): number {
    const localX = x - this.minGridX;
    const localY = y - this.minGridY;
    const localZ = z - this.minGridZ;
    const index = (localY * this.gridSizeZ + localZ) * this.gridSizeX + localX;
    if (index < 0 || index >= this.statuses.length) throw new RangeError(`Aquifer cache index ${index} is outside 0..${this.statuses.length - 1}`);
    return index;
  }
}

export function installMinecraft26Aquifer(
  noiseChunk: NoiseChunk,
  randomState: RandomState,
  settings: ParsedNoiseSettings,
): void {
  const access = noiseChunk as unknown as NoiseChunkAccess;
  const preliminarySurfaceCache = new Map<string, number>();
  access.getPreliminarySurfaceLevel = (blockX, blockZ) => {
    const key = `${blockX},${blockZ}`;
    let level = preliminarySurfaceCache.get(key);
    if (level === undefined) {
      level = Math.floor(randomState.router.preliminarySurfaceLevel.compute(DensityFunction.context(blockX, 0, blockZ)));
      preliminarySurfaceCache.set(key, level);
    }
    return level;
  };
  const lava = new FluidStatus(-54, BlockState.LAVA);
  const defaultFluid = new FluidStatus(settings.seaLevel, settings.defaultFluid);
  const globalFluid: FluidPicker = (_x, y) => y < Math.min(-54, settings.seaLevel) ? lava : defaultFluid;
  const minY = settings.noise.minY;
  const aquifer = new Minecraft26Aquifer(
    access,
    access.minX,
    access.minZ,
    randomState,
    randomState.aquiferRandom,
    minY,
    settings.noise.height,
    globalFluid,
  );
  access.aquifer = aquifer;
  access.materialRule = (context) => aquifer.compute(context, randomState.router.finalDensity.compute(context));
}

function gridX(blockX: number): number {
  return Math.floor(blockX / 16);
}

function gridY(blockY: number): number {
  return Math.floor(blockY / 12);
}

function gridZ(blockZ: number): number {
  return Math.floor(blockZ / 16);
}

function fromGridX(grid: number, offset: number): number {
  return grid * 16 + offset;
}

function fromGridY(grid: number, offset: number): number {
  return grid * 12 + offset;
}

function fromGridZ(grid: number, offset: number): number {
  return grid * 16 + offset;
}

function similarity(closest: number, next: number): number {
  return 1 - (next - closest) / 25;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function map(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}

function clampedMap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return map(clamp(value, fromMin, fromMax), fromMin, fromMax, toMin, toMax);
}
