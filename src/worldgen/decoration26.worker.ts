/// <reference lib="webworker" />
import { createModern26BiomeSampler } from "./modern26";
import { decorateMinecraft26Trees } from "./treeDecoration26";
import type { VoxelWorld } from "./types";

interface DecorationMessage {
  seed: string;
  world: VoxelWorld;
}

self.onmessage = (event: MessageEvent<DecorationMessage>) => {
  const { world } = event.data;
  let lastReported = -1;
  const stats = decorateMinecraft26Trees(
    world,
    createModern26BiomeSampler(BigInt(event.data.seed)),
    (progress) => {
      const percent = Math.floor(progress * 100);
      if (percent === lastReported) return;
      lastReported = percent;
      self.postMessage({ type: "progress", progress });
    },
  );
  self.postMessage(
    { type: "complete", world, stats },
    { transfer: [world.blocks.buffer, world.heightmap.buffer] },
  );
};

export {};
