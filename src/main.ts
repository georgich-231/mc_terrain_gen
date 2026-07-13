import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";
import { buildTerrainMesh, disposeTerrain, type TerrainViewMode } from "./render/terrainMesh";
import { loadMinecraft26TextureAtlas, type Minecraft26TextureAtlas } from "./render/minecraft26Textures";
import { parseModernSeed } from "./worldgen/seed";
import { stitchWorldTiles } from "./worldgen/stitch";
import type { VoxelWorld } from "./worldgen/types";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport")!;
const form = document.querySelector<HTMLFormElement>("#generator-form")!;
const seedInput = document.querySelector<HTMLInputElement>("#seed")!;
const sizeInput = document.querySelector<HTMLSelectElement>("#world-size")!;
const viewModeInput = document.querySelector<HTMLSelectElement>("#view-mode")!;
const viewNote = document.querySelector<HTMLElement>("#view-note")!;
const randomSeedButton = document.querySelector<HTMLButtonElement>("#random-seed")!;
const generateButton = document.querySelector<HTMLButtonElement>("#generate")!;
const statusText = document.querySelector<HTMLElement>("#status")!;
const progressValue = document.querySelector<HTMLElement>("#progress-value")!;
const progressBar = document.querySelector<HTMLElement>("#progress")!;
const generationTime = document.querySelector<HTMLElement>("#generation-time")!;
const faceCount = document.querySelector<HTMLElement>("#face-count")!;
const landArea = document.querySelector<HTMLElement>("#land-area")!;
const surfaceRange = document.querySelector<HTMLElement>("#surface-range")!;
const waterline = document.querySelector<HTMLElement>("#waterline")!;
const slice = document.querySelector<HTMLInputElement>("#slice")!;
const sliceValue = document.querySelector<HTMLOutputElement>("#slice-value")!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0xa6c8dc, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa6c8dc);
scene.fog = new THREE.Fog(0xa6c8dc, 400, 1100);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1400);
camera.position.set(112, 150, 148);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 112, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 22;
controls.maxDistance = 900;

scene.add(new THREE.HemisphereLight(0xd8efff, 0x354328, 2.2));
const sun = new THREE.DirectionalLight(0xfff3d1, 2.6);
sun.position.set(-80, 130, 55);
scene.add(sun);

const grid = new THREE.GridHelper(640, 64, 0x56714d, 0x789072);
grid.visible = false;
grid.material.transparent = true;
grid.material.opacity = 0.11;
scene.add(grid);

interface TileTask {
  id: number;
  size: number;
  startChunkX: number;
  startChunkZ: number;
}

// 32-block tiles expose enough independent work to use all performance cores
// even for the 64-block preview. Worker state is intentionally capped to keep
// memory predictable on laptops.
const TILE_SIZE = 32;
const MAX_WORKERS = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
let activeWorkers: Worker[] = [];
let generationToken = 0;
let currentWorld: VoxelWorld | null = null;
let terrain: THREE.Group | null = null;
let sliceTimer = 0;
let textureAtlas: Minecraft26TextureAtlas | undefined;
const textureAtlasPromise = loadMinecraft26TextureAtlas();

function resize(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width === Math.round(width * renderer.getPixelRatio()) && canvas.height === Math.round(height * renderer.getPixelRatio())) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setProgress(stage: string, value: number): void {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  statusText.textContent = stage;
  progressValue.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function selectedViewMode(): TerrainViewMode {
  return viewModeInput.value === "full" ? "full" : "surface";
}

function updateViewNote(): void {
  viewNote.textContent = selectedViewMode() === "surface"
    ? "Surface view hides underground faces only; every generated cave block remains in the world data."
    : "Full voxel view draws exposed cave and underground geometry and is heavier on large regions.";
}

async function renderWorld(world: VoxelWorld, cutoff: number): Promise<void> {
  const mode = selectedViewMode();
  statusText.textContent = cutoff < world.maxY ? "Rebuilding slice" : mode === "surface" ? "Building landmass mesh" : "Building full voxel mesh";
  const startedAt = performance.now();
  textureAtlas ??= await textureAtlasPromise;
  const result = buildTerrainMesh(world, cutoff, mode, textureAtlas);
  if (terrain) {
    scene.remove(terrain);
    disposeTerrain(terrain);
  }
  terrain = result.group;
  scene.add(terrain);
  const [, highestSurface] = heightRange(world.heightmap);
  const highest = highestSurface - world.minY + 1;
  const visibleTop = Math.min(highest, cutoff - world.minY + 1);
  const focusY = Math.max(12, visibleTop - Math.min(mode === "surface" ? 24 : 14, world.width * 0.18));
  const distance = Math.max(world.width * (mode === "surface" ? 1.3 : 1.65), 84);
  controls.target.set(0, focusY, 0);
  if (mode === "surface") camera.position.set(distance * 0.42, focusY + distance * 1.1, distance * 0.52);
  else camera.position.set(distance * 0.66, focusY + distance * 0.52, distance * 0.82);
  grid.position.y = world.seaLevel - world.minY - 0.03;
  grid.visible = mode === "full";
  controls.update();
  faceCount.textContent = result.faceCount.toLocaleString();
  statusText.textContent = cutoff < world.maxY ? `Slice ready in ${Math.round(performance.now() - startedAt)} ms` : "World ready";
  setProgress(statusText.textContent, 1);
}

function stopWorkers(): void {
  for (const worker of activeWorkers) worker.terminate();
  activeWorkers = [];
}

function createTileTasks(size: number): TileTask[] {
  if (size < TILE_SIZE || size % TILE_SIZE !== 0) throw new RangeError("Landscape size must be a multiple of 32 blocks");
  const chunksAcross = size / 16;
  const startChunk = -Math.floor(chunksAcross / 2);
  const tilesAcross = size / TILE_SIZE;
  const tasks: TileTask[] = [];
  for (let tileZ = 0; tileZ < tilesAcross; tileZ += 1) {
    for (let tileX = 0; tileX < tilesAcross; tileX += 1) {
      tasks.push({
        id: tasks.length,
        size: TILE_SIZE,
        startChunkX: startChunk + tileX * (TILE_SIZE / 16),
        startChunkZ: startChunk + tileZ * (TILE_SIZE / 16),
      });
    }
  }
  return tasks;
}

function generateTiles(seed: bigint, size: number, token: number): Promise<VoxelWorld> {
  const tasks = createTileTasks(size);
  const progress = new Float32Array(tasks.length);
  const tiles: VoxelWorld[] = [];
  const chunksAcross = size / 16;
  const startChunk = -Math.floor(chunksAcross / 2);
  let nextTask = 0;
  let completed = 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      stopWorkers();
      reject(error);
    };

    const finish = () => {
      if (settled || token !== generationToken) return;
      settled = true;
      stopWorkers();
      setProgress("Stitching exact chunk coordinates", 0.94);
      const world = stitchWorldTiles(tiles, size, startChunk * 16, startChunk * 16);
      resolve(world);
    };

    const workerCount = Math.min(MAX_WORKERS, tasks.length);
    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      const worker = new Worker(new URL("./worldgen/modern26.worker.ts", import.meta.url), { type: "module" });
      activeWorkers.push(worker);

      const assignNext = () => {
        if (token !== generationToken) {
          worker.terminate();
          return;
        }
        const task = tasks[nextTask];
        nextTask += 1;
        if (!task) {
          worker.terminate();
          return;
        }
        worker.postMessage({
          taskId: task.id,
          seed: seed.toString(),
          size: task.size,
          startChunkX: task.startChunkX,
          startChunkZ: task.startChunkZ,
        });
      };

      worker.onmessage = (event: MessageEvent) => {
        if (token !== generationToken) return;
        const taskId = Number(event.data.taskId);
        if (event.data.type === "progress") {
          progress[taskId] = event.data.progress;
          const aggregate = progress.reduce((sum, value) => sum + value, 0) / tasks.length;
          setProgress(`${event.data.stage} · ${completed}/${tasks.length} tiles`, 0.02 + aggregate * 0.9);
          return;
        }
        if (event.data.type === "complete") {
          progress[taskId] = 1;
          tiles.push(event.data.world as VoxelWorld);
          completed += 1;
          if (completed === tasks.length) finish();
          else assignNext();
        }
      };
      worker.onerror = (event) => fail(new Error(event.message));
      assignNext();
    }
  });
}

function decorateWorld(world: VoxelWorld, seed: bigint, token: number): Promise<VoxelWorld> {
  setProgress("Placing biome-specific 26.2 trees", 0.945);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worldgen/decoration26.worker.ts", import.meta.url), { type: "module" });
    activeWorkers.push(worker);
    worker.onmessage = (event: MessageEvent) => {
      if (token !== generationToken) {
        worker.terminate();
        return;
      }
      if (event.data.type === "progress") {
        setProgress("Placing biome-specific 26.2 trees", 0.945 + Number(event.data.progress) * 0.045);
        return;
      }
      if (event.data.type === "complete") {
        worker.terminate();
        activeWorkers = activeWorkers.filter((candidate) => candidate !== worker);
        resolve(event.data.world as VoxelWorld);
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      activeWorkers = activeWorkers.filter((candidate) => candidate !== worker);
      reject(new Error(event.message));
    };
    worker.postMessage(
      { seed: seed.toString(), world },
      { transfer: [world.blocks.buffer, world.heightmap.buffer] },
    );
  });
}

async function generate(): Promise<void> {
  generationToken += 1;
  const token = generationToken;
  stopWorkers();
  const size = Number(sizeInput.value);
  const seed = parseModernSeed(seedInput.value);
  seedInput.value = seed.toString();
  generateButton.disabled = true;
  currentWorld = null;
  generationTime.textContent = "—";
  faceCount.textContent = "—";
  landArea.textContent = `${size} × ${size}`;
  surfaceRange.textContent = "—";
  setProgress("Starting parallel chunk generator", 0);
  const startedAt = performance.now();

  try {
    let world = await generateTiles(seed, size, token);
    if (token !== generationToken) return;
    world = await decorateWorld(world, seed, token);
    if (token !== generationToken) return;
    currentWorld = world;
    generationTime.textContent = `${Math.round(performance.now() - startedAt).toLocaleString()} ms`;
    waterline.textContent = `Y ${world.seaLevel}`;
    const [lowestSurface, highestSurface] = heightRange(world.heightmap);
    landArea.textContent = `${world.width} × ${world.length}`;
    surfaceRange.textContent = `Y ${lowestSurface}–${highestSurface}`;
    slice.min = String(world.minY);
    slice.max = String(world.maxY);
    slice.value = String(world.maxY);
    sliceValue.value = `Y ${world.maxY}`;
    await renderWorld(world, world.maxY);
  } catch (error) {
    if (token !== generationToken) return;
    setProgress(`Generation failed: ${error instanceof Error ? error.message : String(error)}`, 0);
  } finally {
    if (token === generationToken) generateButton.disabled = false;
  }
}

function heightRange(values: Int16Array): [minimum: number, maximum: number] {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return [minimum, maximum];
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void generate();
});

randomSeedButton.addEventListener("click", () => {
  const values = new Int32Array(1);
  crypto.getRandomValues(values);
  seedInput.value = String(values[0]);
});

viewModeInput.addEventListener("change", () => {
  updateViewNote();
  if (currentWorld) void renderWorld(currentWorld, Number(slice.value));
});

slice.addEventListener("input", () => {
  const value = Number(slice.value);
  sliceValue.value = `Y ${value}`;
  window.clearTimeout(sliceTimer);
  sliceTimer = window.setTimeout(() => {
    if (currentWorld) void renderWorld(currentWorld, value);
  }, 100);
});

function frame(): void {
  resize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

updateViewNote();
frame();
void generate();
