const FULL = param(-1, 1);
const TEMPERATURES = ranges([[-1, -0.45], [-0.45, -0.15], [-0.15, 0.2], [0.2, 0.55], [0.55, 1]]);
const HUMIDITIES = ranges([[-1, -0.35], [-0.35, -0.1], [-0.1, 0.1], [0.1, 0.3], [0.3, 1]]);
const EROSIONS = ranges([[-1, -0.78], [-0.78, -0.375], [-0.375, -0.2225], [-0.2225, 0.05], [0.05, 0.45], [0.45, 0.55], [0.55, 1]]);
const FROZEN = TEMPERATURES[0];
const UNFROZEN = span(TEMPERATURES[1], TEMPERATURES[4]);
const MUSHROOM_FIELDS_CONTINENTALNESS = param(-1.2, -1.05);
const DEEP_OCEAN_CONTINENTALNESS = param(-1.05, -0.455);
const OCEAN_CONTINENTALNESS = param(-0.455, -0.19);
const COAST_CONTINENTALNESS = param(-0.19, -0.11);
const INLAND_CONTINENTALNESS = param(-0.11, 0.55);
const NEAR_INLAND_CONTINENTALNESS = param(-0.11, 0.03);
const MID_INLAND_CONTINENTALNESS = param(0.03, 0.3);
const FAR_INLAND_CONTINENTALNESS = param(0.3, 1);

const OCEANS = [
  ["deep_frozen_ocean", "deep_cold_ocean", "deep_ocean", "deep_lukewarm_ocean", "warm_ocean"],
  ["frozen_ocean", "cold_ocean", "ocean", "lukewarm_ocean", "warm_ocean"],
];
const MIDDLE_BIOMES = [
  ["snowy_plains", "snowy_plains", "snowy_plains", "snowy_taiga", "taiga"],
  ["plains", "plains", "forest", "taiga", "old_growth_spruce_taiga"],
  ["flower_forest", "plains", "forest", "birch_forest", "dark_forest"],
  ["savanna", "savanna", "forest", "jungle", "jungle"],
  ["desert", "desert", "desert", "desert", "desert"],
];
const MIDDLE_BIOMES_VARIANT = [
  ["ice_spikes", null, "snowy_taiga", null, null],
  [null, null, null, null, "old_growth_pine_taiga"],
  ["sunflower_plains", null, null, "old_growth_birch_forest", null],
  [null, null, "plains", "sparse_jungle", "bamboo_jungle"],
  [null, null, null, null, null],
];
const PLATEAU_BIOMES = [
  ["snowy_plains", "snowy_plains", "snowy_plains", "snowy_taiga", "snowy_taiga"],
  ["meadow", "meadow", "forest", "taiga", "old_growth_spruce_taiga"],
  ["meadow", "meadow", "meadow", "meadow", "pale_garden"],
  ["savanna_plateau", "savanna_plateau", "forest", "forest", "jungle"],
  ["badlands", "badlands", "badlands", "wooded_badlands", "wooded_badlands"],
];
const PLATEAU_BIOMES_VARIANT = [
  ["ice_spikes", null, null, null, null],
  ["cherry_grove", null, "meadow", "meadow", "old_growth_pine_taiga"],
  ["cherry_grove", "cherry_grove", "forest", "birch_forest", null],
  [null, null, null, null, null],
  ["eroded_badlands", "eroded_badlands", null, null, null],
];
const SHATTERED_BIOMES = [
  ["windswept_gravelly_hills", "windswept_gravelly_hills", "windswept_hills", "windswept_forest", "windswept_forest"],
  ["windswept_gravelly_hills", "windswept_gravelly_hills", "windswept_hills", "windswept_forest", "windswept_forest"],
  ["windswept_hills", "windswept_hills", "windswept_hills", "windswept_forest", "windswept_forest"],
  [null, null, null, null, null],
  [null, null, null, null, null],
];
const WEIRDNESS_SLICES = [
  ["mid", -1, -0.93333334],
  ["high", -0.93333334, -0.7666667],
  ["peaks", -0.7666667, -0.56666666],
  ["high", -0.56666666, -0.4],
  ["mid", -0.4, -0.26666668],
  ["low", -0.26666668, -0.05],
  ["valleys", -0.05, 0.05],
  ["low", 0.05, 0.26666668],
  ["mid", 0.26666668, 0.4],
  ["high", 0.4, 0.56666666],
  ["peaks", 0.56666666, 0.7666667],
  ["high", 0.7666667, 0.93333334],
  ["mid", 0.93333334, 1],
];

let cachedParameters = null;
let cachedBiomeNames = null;
let cachedBiomeEncounterOrder = null;

export function createMinecraft26OverworldBiomeParameters() {
  if (cachedParameters) return cachedParameters;
  const entries = [];
  const biomeNames = new Set();
  const builder = new Minecraft26OverworldBiomeBuilder((point, biome) => {
    entries.push([point, biome]);
    biomeNames.add(biome);
  });
  builder.addBiomes();
  cachedParameters = new Minecraft26ClimateParameters(entries);
  cachedBiomeEncounterOrder = Object.freeze([...biomeNames]);
  cachedBiomeNames = Object.freeze([...biomeNames].sort());
  return cachedParameters;
}

export function listMinecraft26OverworldBiomes() {
  createMinecraft26OverworldBiomeParameters();
  return cachedBiomeNames;
}

/** Registry holders in the exact encounter order used by OverworldBiomeBuilder. */
export function listMinecraft26OverworldBiomesInGenerationOrder() {
  createMinecraft26OverworldBiomeParameters();
  return cachedBiomeEncounterOrder;
}

export function sampleMinecraft26NoiseBiome(parameters, sampler, quartX, quartY, quartZ) {
  const sampled = sampler.sample(quartX, quartY, quartZ);
  return parameters.find(new TargetPoint(
    quantizeCoord(Math.fround(sampled.temperature)),
    quantizeCoord(Math.fround(sampled.humidity)),
    quantizeCoord(Math.fround(sampled.continentalness)),
    quantizeCoord(Math.fround(sampled.erosion)),
    quantizeCoord(Math.fround(sampled.depth)),
    quantizeCoord(Math.fround(sampled.weirdness)),
  ));
}

export function sampleMinecraft26SurfaceBiome(parameters, sampler, zoomSeed, x, minecraftY, z) {
  const absoluteX = Math.trunc(x) - 2;
  const absoluteY = Math.trunc(minecraftY) - 2;
  const absoluteZ = Math.trunc(z) - 2;
  const parentX = absoluteX >> 2;
  const parentY = absoluteY >> 2;
  const parentZ = absoluteZ >> 2;
  const fractionX = (absoluteX & 3) / 4;
  const fractionY = (absoluteY & 3) / 4;
  const fractionZ = (absoluteZ & 3) / 4;
  let closestCorner = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let corner = 0; corner < 8; corner += 1) {
    const lowX = (corner & 4) === 0;
    const lowY = (corner & 2) === 0;
    const lowZ = (corner & 1) === 0;
    const quartX = lowX ? parentX : parentX + 1;
    const quartY = lowY ? parentY : parentY + 1;
    const quartZ = lowZ ? parentZ : parentZ + 1;
    const distance = fiddledDistance(
      zoomSeed,
      quartX,
      quartY,
      quartZ,
      lowX ? fractionX : fractionX - 1,
      lowY ? fractionY : fractionY - 1,
      lowZ ? fractionZ : fractionZ - 1,
    );
    if (distance < closestDistance) {
      closestCorner = corner;
      closestDistance = distance;
    }
  }
  return sampleMinecraft26NoiseBiome(
    parameters,
    sampler,
    (closestCorner & 4) === 0 ? parentX : parentX + 1,
    (closestCorner & 2) === 0 ? parentY : parentY + 1,
    (closestCorner & 1) === 0 ? parentZ : parentZ + 1,
  );
}

export function obfuscateMinecraft26BiomeSeed(seed) {
  const bytes = new Uint8Array(64);
  let unsigned = BigInt.asUintN(64, seed);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(unsigned & 255n);
    unsigned >>= 8n;
  }
  bytes[8] = 0x80;
  bytes[63] = 64;
  const words = new Uint32Array(64);
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4;
    words[index] = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }
  for (let index = 16; index < 64; index += 1) {
    const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
    const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
    words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = SHA256_INITIAL;
  for (let index = 0; index < 64; index += 1) {
    const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);
    const temp1 = (h + s1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
    const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (s0 + majority) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }
  const first = (a + SHA256_INITIAL[0]) >>> 0;
  const second = (b + SHA256_INITIAL[1]) >>> 0;
  const digest = [first >>> 24, first >>> 16, first >>> 8, first, second >>> 24, second >>> 16, second >>> 8, second];
  let result = 0n;
  for (let index = 0; index < 8; index += 1) result |= BigInt(digest[index] & 255) << BigInt(index * 8);
  return BigInt.asIntN(64, result);
}

class Minecraft26OverworldBiomeBuilder {
  constructor(add) {
    this.add = add;
  }

  addBiomes() {
    this.addOffCoastBiomes();
    for (const [slice, min, max] of WEIRDNESS_SLICES) {
      this[`add${capitalize(slice)}`](param(min, max));
    }
    this.addUndergroundBiomes();
  }

  addUndergroundBiomes() {
    this.addUnderground(FULL, FULL, param(0.8, 1), FULL, FULL, "dripstone_caves");
    this.addUnderground(FULL, param(0.7, 1), FULL, FULL, FULL, "lush_caves");
    this.addUnderground(
      FULL,
      FULL,
      span(COAST_CONTINENTALNESS, INLAND_CONTINENTALNESS),
      span(EROSIONS[5], EROSIONS[6]),
      param(-1.1, -0.85),
      "sulfur_caves",
    );
    this.add(parameters(FULL, FULL, FULL, span(EROSIONS[0], EROSIONS[1]), point(1.1), FULL, 0), "deep_dark");
  }

  addUnderground(temperature, humidity, continentalness, erosion, weirdness, biome) {
    this.add(parameters(temperature, humidity, continentalness, erosion, param(0.2, 0.9), weirdness, 0), biome);
  }

  addOffCoastBiomes() {
    this.addSurface(FULL, FULL, MUSHROOM_FIELDS_CONTINENTALNESS, FULL, FULL, "mushroom_fields");
    for (let temperature = 0; temperature < TEMPERATURES.length; temperature += 1) {
      this.addSurface(TEMPERATURES[temperature], FULL, DEEP_OCEAN_CONTINENTALNESS, FULL, FULL, OCEANS[0][temperature]);
      this.addSurface(TEMPERATURES[temperature], FULL, OCEAN_CONTINENTALNESS, FULL, FULL, OCEANS[1][temperature]);
    }
  }

  addPeaks(weirdness) {
    this.forClimate((temperature, humidity, ti, hi) => {
      const middle = this.pickMiddle(ti, hi, weirdness);
      const middleOrBadlands = this.pickMiddleOrBadlands(ti, hi, weirdness);
      const middleOrBadlandsOrSlope = this.pickMiddleOrBadlandsOrSlope(ti, hi, weirdness);
      const plateau = this.pickPlateau(ti, hi, weirdness);
      const shattered = this.pickShattered(ti, hi, weirdness);
      const shatteredOrSavanna = this.maybeWindsweptSavanna(ti, hi, weirdness, shattered);
      const peak = this.pickPeak(ti, hi, weirdness);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[0], weirdness, peak);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), EROSIONS[1], weirdness, middleOrBadlandsOrSlope);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[1], weirdness, peak);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), span(EROSIONS[2], EROSIONS[3]), weirdness, middle);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[2], weirdness, plateau);
      this.addSurface(temperature, humidity, MID_INLAND_CONTINENTALNESS, EROSIONS[3], weirdness, middleOrBadlands);
      this.addSurface(temperature, humidity, FAR_INLAND_CONTINENTALNESS, EROSIONS[3], weirdness, plateau);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[4], weirdness, middle);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, shatteredOrSavanna);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, shattered);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, middle);
    });
  }

  addHigh(weirdness) {
    this.forClimate((temperature, humidity, ti, hi) => {
      const middle = this.pickMiddle(ti, hi, weirdness);
      const middleOrBadlands = this.pickMiddleOrBadlands(ti, hi, weirdness);
      const middleOrBadlandsOrSlope = this.pickMiddleOrBadlandsOrSlope(ti, hi, weirdness);
      const plateau = this.pickPlateau(ti, hi, weirdness);
      const shattered = this.pickShattered(ti, hi, weirdness);
      const middleOrSavanna = this.maybeWindsweptSavanna(ti, hi, weirdness, middle);
      const slope = this.pickSlope(ti, hi, weirdness);
      const peak = this.pickPeak(ti, hi, weirdness);
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, middle);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, EROSIONS[0], weirdness, slope);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[0], weirdness, peak);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, EROSIONS[1], weirdness, middleOrBadlandsOrSlope);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[1], weirdness, slope);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), span(EROSIONS[2], EROSIONS[3]), weirdness, middle);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[2], weirdness, plateau);
      this.addSurface(temperature, humidity, MID_INLAND_CONTINENTALNESS, EROSIONS[3], weirdness, middleOrBadlands);
      this.addSurface(temperature, humidity, FAR_INLAND_CONTINENTALNESS, EROSIONS[3], weirdness, plateau);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[4], weirdness, middle);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, middleOrSavanna);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, shattered);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, middle);
    });
  }

  addMid(weirdness) {
    this.addSurface(FULL, FULL, COAST_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[2]), weirdness, "stony_shore");
    this.addSurface(span(TEMPERATURES[1], TEMPERATURES[2]), FULL, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "swamp");
    this.addSurface(span(TEMPERATURES[3], TEMPERATURES[4]), FULL, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "mangrove_swamp");
    this.forClimate((temperature, humidity, ti, hi) => {
      const middle = this.pickMiddle(ti, hi, weirdness);
      const middleOrBadlands = this.pickMiddleOrBadlands(ti, hi, weirdness);
      const middleOrBadlandsOrSlope = this.pickMiddleOrBadlandsOrSlope(ti, hi, weirdness);
      const shattered = this.pickShattered(ti, hi, weirdness);
      const plateau = this.pickPlateau(ti, hi, weirdness);
      const beach = this.pickBeach(ti);
      const middleOrSavanna = this.maybeWindsweptSavanna(ti, hi, weirdness, middle);
      const shatteredCoast = this.pickShatteredCoast(ti, hi, weirdness);
      const slope = this.pickSlope(ti, hi, weirdness);
      this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[0], weirdness, slope);
      this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, MID_INLAND_CONTINENTALNESS), EROSIONS[1], weirdness, middleOrBadlandsOrSlope);
      this.addSurface(temperature, humidity, FAR_INLAND_CONTINENTALNESS, EROSIONS[1], weirdness, ti === 0 ? slope : plateau);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, EROSIONS[2], weirdness, middle);
      this.addSurface(temperature, humidity, MID_INLAND_CONTINENTALNESS, EROSIONS[2], weirdness, middleOrBadlands);
      this.addSurface(temperature, humidity, FAR_INLAND_CONTINENTALNESS, EROSIONS[2], weirdness, plateau);
      this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, NEAR_INLAND_CONTINENTALNESS), EROSIONS[3], weirdness, middle);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[3], weirdness, middleOrBadlands);
      if (weirdness.max < 0) {
        this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, EROSIONS[4], weirdness, beach);
        this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[4], weirdness, middle);
      } else {
        this.addSurface(temperature, humidity, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[4], weirdness, middle);
      }
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, EROSIONS[5], weirdness, shatteredCoast);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, EROSIONS[5], weirdness, middleOrSavanna);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, shattered);
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, EROSIONS[6], weirdness, weirdness.max < 0 ? beach : middle);
      if (ti === 0) this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, middle);
    });
  }

  addLow(weirdness) {
    this.addSurface(FULL, FULL, COAST_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[2]), weirdness, "stony_shore");
    this.addSurface(span(TEMPERATURES[1], TEMPERATURES[2]), FULL, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "swamp");
    this.addSurface(span(TEMPERATURES[3], TEMPERATURES[4]), FULL, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "mangrove_swamp");
    this.forClimate((temperature, humidity, ti, hi) => {
      const middle = this.pickMiddle(ti, hi, weirdness);
      const middleOrBadlands = this.pickMiddleOrBadlands(ti, hi, weirdness);
      const middleOrBadlandsOrSlope = this.pickMiddleOrBadlandsOrSlope(ti, hi, weirdness);
      const beach = this.pickBeach(ti);
      const middleOrSavanna = this.maybeWindsweptSavanna(ti, hi, weirdness, middle);
      const shatteredCoast = this.pickShatteredCoast(ti, hi, weirdness);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, middleOrBadlands);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), span(EROSIONS[0], EROSIONS[1]), weirdness, middleOrBadlandsOrSlope);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, span(EROSIONS[2], EROSIONS[3]), weirdness, middle);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), span(EROSIONS[2], EROSIONS[3]), weirdness, middleOrBadlands);
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, span(EROSIONS[3], EROSIONS[4]), weirdness, beach);
      this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[4], weirdness, middle);
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, EROSIONS[5], weirdness, shatteredCoast);
      this.addSurface(temperature, humidity, NEAR_INLAND_CONTINENTALNESS, EROSIONS[5], weirdness, middleOrSavanna);
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[5], weirdness, middle);
      this.addSurface(temperature, humidity, COAST_CONTINENTALNESS, EROSIONS[6], weirdness, beach);
      if (ti === 0) this.addSurface(temperature, humidity, span(NEAR_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, middle);
    });
  }

  addValleys(weirdness) {
    const negative = weirdness.max < 0;
    this.addSurface(FROZEN, FULL, COAST_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, negative ? "stony_shore" : "frozen_river");
    this.addSurface(UNFROZEN, FULL, COAST_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, negative ? "stony_shore" : "river");
    this.addSurface(FROZEN, FULL, NEAR_INLAND_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, "frozen_river");
    this.addSurface(UNFROZEN, FULL, NEAR_INLAND_CONTINENTALNESS, span(EROSIONS[0], EROSIONS[1]), weirdness, "river");
    this.addSurface(FROZEN, FULL, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), span(EROSIONS[2], EROSIONS[5]), weirdness, "frozen_river");
    this.addSurface(UNFROZEN, FULL, span(COAST_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), span(EROSIONS[2], EROSIONS[5]), weirdness, "river");
    this.addSurface(FROZEN, FULL, COAST_CONTINENTALNESS, EROSIONS[6], weirdness, "frozen_river");
    this.addSurface(UNFROZEN, FULL, COAST_CONTINENTALNESS, EROSIONS[6], weirdness, "river");
    this.addSurface(span(TEMPERATURES[1], TEMPERATURES[2]), FULL, span(INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "swamp");
    this.addSurface(span(TEMPERATURES[3], TEMPERATURES[4]), FULL, span(INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "mangrove_swamp");
    this.addSurface(FROZEN, FULL, span(INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), EROSIONS[6], weirdness, "frozen_river");
    this.forClimate((temperature, humidity, ti, hi) => {
      this.addSurface(temperature, humidity, span(MID_INLAND_CONTINENTALNESS, FAR_INLAND_CONTINENTALNESS), span(EROSIONS[0], EROSIONS[1]), weirdness, this.pickMiddleOrBadlands(ti, hi, weirdness));
    });
  }

  forClimate(callback) {
    for (let ti = 0; ti < TEMPERATURES.length; ti += 1) {
      for (let hi = 0; hi < HUMIDITIES.length; hi += 1) {
        callback(TEMPERATURES[ti], HUMIDITIES[hi], ti, hi);
      }
    }
  }

  addSurface(temperature, humidity, continentalness, erosion, weirdness, biome) {
    this.add(parameters(temperature, humidity, continentalness, erosion, point(0), weirdness, 0), biome);
    this.add(parameters(temperature, humidity, continentalness, erosion, point(1), weirdness, 0), biome);
  }

  pickMiddle(ti, hi, weirdness) {
    if (weirdness.max < 0) return MIDDLE_BIOMES[ti][hi];
    return MIDDLE_BIOMES_VARIANT[ti][hi] ?? MIDDLE_BIOMES[ti][hi];
  }

  pickMiddleOrBadlands(ti, hi, weirdness) {
    return ti === 4 ? this.pickBadlands(hi, weirdness) : this.pickMiddle(ti, hi, weirdness);
  }

  pickMiddleOrBadlandsOrSlope(ti, hi, weirdness) {
    return ti === 0 ? this.pickSlope(ti, hi, weirdness) : this.pickMiddleOrBadlands(ti, hi, weirdness);
  }

  maybeWindsweptSavanna(ti, hi, weirdness, fallback) {
    return ti > 1 && hi < 4 && weirdness.max >= 0 ? "windswept_savanna" : fallback;
  }

  pickShatteredCoast(ti, hi, weirdness) {
    const biome = weirdness.max >= 0 ? this.pickMiddle(ti, hi, weirdness) : this.pickBeach(ti);
    return this.maybeWindsweptSavanna(ti, hi, weirdness, biome);
  }

  pickBeach(ti) {
    if (ti === 0) return "snowy_beach";
    if (ti === 4) return "desert";
    return "beach";
  }

  pickBadlands(hi, weirdness) {
    if (hi < 2) return weirdness.max < 0 ? "badlands" : "eroded_badlands";
    if (hi < 3) return "badlands";
    return "wooded_badlands";
  }

  pickPlateau(ti, hi, weirdness) {
    const variant = PLATEAU_BIOMES_VARIANT[ti][hi];
    return weirdness.max >= 0 && variant ? variant : PLATEAU_BIOMES[ti][hi];
  }

  pickPeak(ti, hi, weirdness) {
    if (ti <= 2) return weirdness.max < 0 ? "jagged_peaks" : "frozen_peaks";
    if (ti === 3) return "stony_peaks";
    return this.pickBadlands(hi, weirdness);
  }

  pickSlope(ti, hi, weirdness) {
    if (ti >= 3) return this.pickPlateau(ti, hi, weirdness);
    return hi <= 1 ? "snowy_slopes" : "grove";
  }

  pickShattered(ti, hi, weirdness) {
    return SHATTERED_BIOMES[ti][hi] ?? this.pickMiddle(ti, hi, weirdness);
  }
}

function param(min, max = min) {
  return new Param(quantizeCoord(Math.fround(min)), quantizeCoord(Math.fround(max)));
}

function point(value) {
  return param(value);
}

function span(left, right) {
  return new Param(left.min, right.max);
}

function ranges(values) {
  return values.map(([min, max]) => param(min, max));
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function parameters(temperature, humidity, continentalness, erosion, depth, weirdness, offset) {
  return new ParamPoint(temperature, humidity, continentalness, erosion, depth, weirdness, quantizeCoord(Math.fround(offset)));
}

function quantizeCoord(value) {
  return Math.trunc(Math.fround(Math.fround(value) * Math.fround(10000)));
}

function Param(min, max) {
  this.min = min;
  this.max = max;
}

Param.prototype.distance = function distance(value) {
  const above = value - this.max;
  const below = this.min - value;
  return above > 0 ? above : Math.max(below, 0);
};

Param.prototype.span = function spanParam(other) {
  return other === null ? this : new Param(Math.min(this.min, other.min), Math.max(this.max, other.max));
};

class ParamPoint {
  constructor(temperature, humidity, continentalness, erosion, depth, weirdness, offset) {
    this.space = [temperature, humidity, continentalness, erosion, depth, weirdness, new Param(offset, offset)];
  }
}

class TargetPoint {
  constructor(temperature, humidity, continentalness, erosion, depth, weirdness) {
    this.values = [temperature, humidity, continentalness, erosion, depth, weirdness, 0];
  }
}

class Minecraft26ClimateParameters {
  constructor(entries) {
    this.things = entries;
    this.index = new RTree(entries);
  }

  find(target) {
    return this.index.search(target.values);
  }
}

class RTree {
  constructor(entries) {
    this.root = buildTree(entries.map(([point, value]) => new Leaf(point.space, value)));
    this.lastLeaf = null;
  }

  search(target) {
    const leaf = this.root.search(target, this.lastLeaf);
    this.lastLeaf = leaf;
    return leaf.value;
  }
}

class Node {
  constructor(space) {
    this.space = space;
  }

  distance(target) {
    let result = 0;
    for (let index = 0; index < 7; index += 1) {
      const distance = this.space[index].distance(target[index]);
      result += distance * distance;
    }
    return result;
  }
}

class Leaf extends Node {
  constructor(space, value) {
    super(space);
    this.value = value;
  }

  search() {
    return this;
  }
}

class SubTree extends Node {
  constructor(children) {
    super(buildSpace(children));
    this.children = children;
  }

  search(target, candidate) {
    let minDistance = candidate === null ? Number.POSITIVE_INFINITY : candidate.distance(target);
    let closest = candidate;
    for (const child of this.children) {
      const childDistance = child.distance(target);
      if (minDistance <= childDistance) continue;
      const leaf = child.search(target, closest);
      const leafDistance = child === leaf ? childDistance : leaf.distance(target);
      if (minDistance <= leafDistance) continue;
      minDistance = leafDistance;
      closest = leaf;
    }
    return closest;
  }
}

function buildTree(children) {
  if (children.length === 1) return children[0];
  if (children.length <= 6) {
    children.sort((left, right) => totalMagnitude(left.space) - totalMagnitude(right.space));
    return new SubTree(children);
  }

  let minCost = Number.POSITIVE_INFINITY;
  let minDimension = -1;
  let minBuckets = null;
  for (let dimension = 0; dimension < 7; dimension += 1) {
    sortNodes(children, dimension, false);
    const buckets = bucketize(children);
    const cost = buckets.reduce((total, bucket) => total + treeCost(bucket.space), 0);
    if (cost < minCost) {
      minCost = cost;
      minDimension = dimension;
      minBuckets = buckets;
    }
  }
  sortNodes(minBuckets, minDimension, true);
  return new SubTree(minBuckets.map((bucket) => buildTree([...bucket.children])));
}

function sortNodes(nodes, dimension, absolute) {
  nodes.sort((left, right) => {
    for (let offset = 0; offset < 7; offset += 1) {
      const index = (dimension + offset) % 7;
      const leftCenter = Math.trunc((left.space[index].min + left.space[index].max) / 2);
      const rightCenter = Math.trunc((right.space[index].min + right.space[index].max) / 2);
      const leftValue = absolute ? Math.abs(leftCenter) : leftCenter;
      const rightValue = absolute ? Math.abs(rightCenter) : rightCenter;
      if (leftValue !== rightValue) return leftValue - rightValue;
    }
    return 0;
  });
}

function bucketize(nodes) {
  const result = [];
  let children = [];
  const expected = Math.pow(6, Math.floor(Math.log(nodes.length - 0.01) / Math.log(6)));
  for (const node of nodes) {
    children.push(node);
    if (children.length < expected) continue;
    result.push(new SubTree(children));
    children = [];
  }
  if (children.length > 0) result.push(new SubTree(children));
  return result;
}

function buildSpace(children) {
  const bounds = Array.from({ length: 7 }, () => null);
  for (const child of children) {
    for (let dimension = 0; dimension < 7; dimension += 1) {
      bounds[dimension] = child.space[dimension].span(bounds[dimension]);
    }
  }
  return bounds;
}

function totalMagnitude(space) {
  return space.reduce((total, value) => total + Math.abs(Math.trunc((value.min + value.max) / 2)), 0);
}

function treeCost(space) {
  return space.reduce((total, value) => total + Math.abs(value.max - value.min), 0);
}

function fiddledDistance(seed, x, y, z, distanceX, distanceY, distanceZ) {
  let random = BigInt.asIntN(64, seed);
  random = lcgNext(random, BigInt(x));
  random = lcgNext(random, BigInt(y));
  random = lcgNext(random, BigInt(z));
  random = lcgNext(random, BigInt(x));
  random = lcgNext(random, BigInt(y));
  random = lcgNext(random, BigInt(z));
  const fiddleX = fiddle(random);
  random = lcgNext(random, seed);
  const fiddleY = fiddle(random);
  random = lcgNext(random, seed);
  const fiddleZ = fiddle(random);
  return square(distanceZ + fiddleZ) + square(distanceY + fiddleY) + square(distanceX + fiddleX);
}

function lcgNext(seed, salt) {
  return BigInt.asIntN(64, BigInt.asIntN(64, seed * BigInt.asIntN(64, seed * 6364136223846793005n + 1442695040888963407n)) + salt);
}

function fiddle(value) {
  const uniform = Number((BigInt.asIntN(64, value) >> 24n) & 1023n) / 1024;
  return (uniform - 0.5) * 0.9;
}

function square(value) {
  return value * value;
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
