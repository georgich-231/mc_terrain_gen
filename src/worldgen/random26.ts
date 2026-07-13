import {
  type PositionalRandom,
  type Random,
  type RandomState,
  XoroshiroRandom,
} from "deepslate";

const MASK_64 = (1n << 64n) - 1n;

/** Positional Xoroshiro factory with Java long-overflow coordinate hashing. */
export class Minecraft26PositionalRandom implements PositionalRandom {
  private readonly seedLo: bigint;
  private readonly seedHi: bigint;

  constructor(private readonly source: PositionalRandom) {
    const [seedLo, seedHi] = source.seedKey();
    this.seedLo = BigInt.asUintN(64, seedLo);
    this.seedHi = BigInt.asUintN(64, seedHi);
  }

  at(x: number, y: number, z: number): Random {
    const positionalSeed = minecraft26PositionSeed(x, y, z);
    return new XoroshiroRandom([
      BigInt.asUintN(64, positionalSeed) ^ this.seedLo,
      this.seedHi,
    ]);
  }

  fromHashOf(name: string): Random {
    return this.source.fromHashOf(name);
  }

  seedKey(): [bigint, bigint] {
    return [this.seedLo, this.seedHi];
  }
}

export function installMinecraft26PositionalRandoms(randomState: RandomState): void {
  const access = randomState as unknown as {
    random: PositionalRandom;
    aquiferRandom: PositionalRandom;
    oreRandom: PositionalRandom;
    surfaceSystem: {
      random: PositionalRandom;
      getSurfaceDepth: (x: number, z: number) => number;
    };
  };
  access.random = fixPositionalRandom(access.random);
  access.aquiferRandom = fixPositionalRandom(access.aquiferRandom);
  access.oreRandom = fixPositionalRandom(access.oreRandom);
  access.surfaceSystem.random = fixPositionalRandom(access.surfaceSystem.random);

  // Java casts the noisy surface depth to an int. deepslate 0.26 leaves it as
  // a fraction, which changes stone-depth rules at the next integer boundary.
  const getSurfaceDepth = access.surfaceSystem.getSurfaceDepth.bind(access.surfaceSystem);
  access.surfaceSystem.getSurfaceDepth = (x, z) => Math.trunc(getSurfaceDepth(x, z));
}

export function positionalRandomFromHash(source: PositionalRandom, name: string): PositionalRandom {
  return fixPositionalRandom(source.fromHashOf(name).forkPositional());
}

export function fixPositionalRandom(source: PositionalRandom): PositionalRandom {
  return source instanceof Minecraft26PositionalRandom ? source : new Minecraft26PositionalRandom(source);
}

export function minecraft26PositionSeed(x: number, y: number, z: number): bigint {
  let seed = BigInt.asIntN(
    64,
    BigInt(Math.imul(Math.trunc(x), 3_129_871))
      ^ BigInt.asIntN(64, BigInt(Math.trunc(z)) * 116_129_781n)
      ^ BigInt.asIntN(64, BigInt(Math.trunc(y))),
  );
  seed = BigInt.asIntN(64, BigInt.asIntN(64, seed * seed) * 42_317_861n + seed * 11n);
  return BigInt.asIntN(64, seed) >> 16n & MASK_64;
}
