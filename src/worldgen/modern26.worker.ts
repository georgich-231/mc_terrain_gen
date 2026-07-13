/// <reference lib="webworker" />
import { generateModern26World } from "./modern26";

interface GenerateMessage {
  taskId: number;
  seed: string;
  size: number;
  startChunkX: number;
  startChunkZ: number;
}

self.onmessage = (event: MessageEvent<GenerateMessage>) => {
  const startedAt = performance.now();
  const world = generateModern26World({
    seed: BigInt(event.data.seed),
    size: event.data.size,
    startChunkX: event.data.startChunkX,
    startChunkZ: event.data.startChunkZ,
    onProgress(stage, progress) {
      self.postMessage({ type: "progress", taskId: event.data.taskId, stage, progress });
    },
  });
  self.postMessage(
    { type: "complete", taskId: event.data.taskId, world, duration: performance.now() - startedAt },
    { transfer: [world.blocks.buffer, world.heightmap.buffer] },
  );
};

export {};
