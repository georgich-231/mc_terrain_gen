# Modern Terrain Lab — Minecraft Java 26.2

An interactive browser implementation of Minecraft Java Edition 26.2's modern Overworld terrain pipeline.

Implemented systems:

- signed 64-bit Minecraft seed semantics;
- the official 26.2 noise and density-function registries;
- the official `final_density` router with 4×8×4 interpolation;
- the −64 through 319 Overworld build range;
- continentalness, erosion, ridges, depth, jaggedness, and shifted climate noise;
- cheese, spaghetti, entrance, pillar, and noodle caves represented by the density router;
- the Java 26.2 noise-aquifer fluid-level and pressure algorithm;
- all 66 Java 26.2 biome definitions and the 55-biome Overworld multi-noise parameter table;
- the 26.2 surface-rule tree across every generated column;
- large copper and iron ore veins using the official vein router and positional random stream;
- the official vegetation feature order, placement RNG, biome filters, and all Java 26.2 Overworld tree trunk/foliage families;
- locally extracted official block textures, colormaps, biome grass/foliage/water tinting, and the default 5×5 biome blend;
- deterministic 32×32-block tile generation across as many as eight workers, followed by off-main-thread tree decoration;
- typed growable mesh buffers and cached biome colors for faster first render and slice rebuilds;
- a surface-landscape view that draws the broad landmass while retaining every generated underground voxel;
- a full-voxel cave view plus an inspectable vertical slice.

The default preview is 128×384×128 blocks (8×8 chunks), with 192- and 256-block landscape windows available. Surface view changes only what the renderer draws; it does not replace or delete the generated cave terrain.

## Run

```bash
npm install
npm run dev
```

The official textures are intentionally not committed. To refresh them from a locally downloaded official 26.2 client JAR:

```bash
npm run assets:extract-textures -- /path/to/minecraft-26.2-client.jar
```

## Verify

```bash
npm test
npm run build
```

## Source and licensing boundary

Minecraft 26.2 ships unobfuscated Java class names, which makes the implementation readable, but Minecraft remains proprietary and governed by its EULA. This repository does **not** contain copied Mojang Java classes. It recreates the generation behavior using:

- registry data extracted locally from the user's official 26.2 server JAR;
- independently implemented TypeScript orchestration;
- the MIT-licensed [`deepslate`](https://github.com/misode/deepslate) worldgen primitives;
- a local TypeScript port of the Overworld biome parameter table.

The current browser implementation covers block-for-block base density terrain, aquifers, router caves, surfaces, biomes, large ore veins, and the surface tree families. It does not yet claim complete parity for every non-tree configured feature, explicit carver pass, structure, mob, block entity, or gameplay tick.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
