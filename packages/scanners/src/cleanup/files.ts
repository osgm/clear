import { promises as fs } from "node:fs";
import { CleanupMode, CleanupResult, JunkFile } from "../../../shared/src/types";
import { CLEANUP_RECYCLE_CONCURRENCY, CLEANUP_SHRED_CONCURRENCY } from "../internal/constants";
import { CleanupRuntimeHooks, forEachWithConcurrency } from "../internal/scan-hooks";
import { moveToRecycleBin } from "../platform/recycle";
import { shredPath, withDeleteTimeout } from "./shred";

export async function cleanupFiles(
  targets: JunkFile[],
  mode: CleanupMode = "recycle",
  hooks: CleanupRuntimeHooks = {}
): Promise<CleanupResult> {
  const failures: CleanupResult["failures"] = [];
  let deletedCount = 0;
  let freedBytes = 0;
  const concurrency = mode === "shred" ? CLEANUP_SHRED_CONCURRENCY : CLEANUP_RECYCLE_CONCURRENCY;

  await forEachWithConcurrency(targets, concurrency, async (file) => {
    if (hooks.isCancelled?.()) {
      throw new Error("CLEANUP_CANCELLED");
    }
    try {
      const stat = await fs.lstat(file.path);
      if (mode === "shred") {
        await withDeleteTimeout(shredPath(file.path), file.path);
      } else {
        await withDeleteTimeout(moveToRecycleBin(file.path), file.path);
      }
      deletedCount += 1;
      freedBytes += stat.isFile() ? stat.size : file.size;
    } catch (error) {
      if (error instanceof Error && error.message === "CLEANUP_CANCELLED") {
        throw error;
      }
      failures.push({
        path: file.path,
        error: error instanceof Error ? error.message : "未知错误"
      });
    }
  });

  return {
    deletedCount,
    failedCount: failures.length,
    freedBytes,
    failures
  };
}
