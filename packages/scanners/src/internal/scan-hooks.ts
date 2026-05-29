import type { DuplicateGroup, JunkFile, ScanProgress } from "../../../shared/src/types";

export interface ScanRuntimeHooks {
  onProgress?: (progress: ScanProgress) => void;
  onJunkBatch?: (items: JunkFile[]) => void;
  onDuplicateGroupBatch?: (groups: DuplicateGroup[]) => void;
  isCancelled?: () => boolean;
  isPaused?: () => boolean;
}

export interface CleanupRuntimeHooks {
  isCancelled?: () => boolean;
}

const PAUSE_POLL_MS = 250;

export async function waitIfPaused(hooks: ScanRuntimeHooks): Promise<void> {
  while (hooks.isPaused?.()) {
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_POLL_MS));
  }
}

export async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let index = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const cur = index;
      index += 1;
      if (cur >= items.length) {
        break;
      }
      await worker(items[cur]);
    }
  });
  await Promise.all(runners);
}
