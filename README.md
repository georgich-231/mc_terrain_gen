# Modern Terrain Lab — Minecraft Java 26.2

An interactive browser implementation of Minecraft Java Edition 26.2's modern Overworld terrain pipeline. The generator targets the latest stable release reported by Mojang's official version manifest on July 13, 2026.

Implemented systems:

- signed 64-bit Minecraft seed semantics;
- the official 26.2 noise and density-function registries;
- the official `final_density` router with 4×8×4 interpolation;
- the −64 through 319 Overworld build range;
- continentalness, erosion, ridges, depth, jaggedness, and shifted climate noise;
- cheese, spaghetti, entrance, pillar, and noodle caves represented by the density router;
- sea-level water and deep lava filling;
- the 26.2 multi-noise surface-biome parameter table;
- the 26.2 surface-rule tree across every generated column;
- large copper and iron ore veins using the official vein router and positional random stream;
- deterministic parallel tile generation for 4×4 through 16×16 chunk windows;
- a surface-landscape view that draws the broad landmass while retaining every generated underground voxel;
- a full-voxel cave view plus an inspectable vertical slice.

The default preview is 128×384×128 blocks (8×8 chunks), with 192- and 256-block landscape windows available. Surface view changes only what the renderer draws; it does not replace or delete the generated cave terrain.

## Run

```powershell
npm install
npm run dev
```

## Verify

```powershell
npm test
npm run build
```

## Source and licensing boundary

Minecraft 26.2 ships unobfuscated Java class names, which makes the implementation readable, but Minecraft remains proprietary and governed by its EULA. This repository does **not** contain copied Mojang Java classes. It recreates the generation behavior using:

- registry data extracted locally from the user's official 26.2 server JAR;
- independently implemented TypeScript orchestration;
- the MIT-licensed [`deepslate`](https://github.com/misode/deepslate) worldgen primitives;
- a local TypeScript port of the Overworld biome parameter table.

The current browser implementation covers base density terrain, caves encoded in the noise router, surfaces, biomes, fluids at the global sea/lava levels, and large ore veins. Full parity for noise aquifers, configured-feature decoration, carvers, and structures requires running or integrating additional generation stages; those are intentionally not claimed as complete here.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
