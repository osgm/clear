import path from "node:path";
import { DuplicateGroup, DuplicateScanOptions, DuplicateScanResult, JunkFile } from "../../../shared/src/types";
import { ensureDirectoryExists } from "../internal/fs-helpers";
import { ScanRuntimeHooks } from "../internal/scan-hooks";
import { hashFileSha256, quickFingerprint } from "../cleanup/shred";
import { AnalyzeFileMeta, collectFilesMeta, metaToJunk } from "./meta";

async function processSizeBucket(
  candidates: AnalyzeFileMeta[],
  options: DuplicateScanOptions,
  hooks: ScanRuntimeHooks,
  skippedPaths: string[],
  byHash: Map<string, JunkFile[]>,
  emittedDuplicateKeys: Set<string>,
  state: { hashed: number; truncated: boolean; scannedFileCount: number }
): Promise<void> {
  if (candidates.length < 2) {
    return;
  }

  const byFingerprint = new Map<string, AnalyzeFileMeta[]>();
  for (const c of candidates) {
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    try {
      const fp = await quickFingerprint(c.path, c.size);
      const list = byFingerprint.get(fp) ?? [];
      list.push(c);
      byFingerprint.set(fp, list);
    } catch {
      skippedPaths.push(c.path);
    }
  }

  for (const [, list] of byFingerprint) {
    if (list.length < 2) continue;
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }

    const hashedItems: Array<{ meta: AnalyzeFileMeta; digest: string }> = [];
    for (const c of list) {
      if (state.truncated) break;
      if (hooks.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      if (state.hashed >= options.maxFilesToHash) {
        state.truncated = true;
        break;
      }
      state.hashed += 1;
      try {
        const digest = await hashFileSha256(c.path);
        hashedItems.push({ meta: c, digest });
      } catch {
        skippedPaths.push(c.path);
      }
      if (state.hashed % 50 === 0) {
        hooks.onProgress?.({
          stage: "hashing",
          scannedCount: state.scannedFileCount,
          junkCount: state.hashed,
          duplicateGroupCount: emittedDuplicateKeys.size,
          percent: Math.min(95, 75 + Math.floor((state.hashed / Math.max(1, options.maxFilesToHash)) * 20))
        });
      }
    }

    for (const item of hashedItems) {
      const j = metaToJunk(item.meta, `SHA256: ${item.digest.slice(0, 12)}…`);
      const existing = byHash.get(item.digest) ?? [];
      existing.push(j);
      byHash.set(item.digest, existing);
      if (existing.length >= 2) {
        const key = `${item.digest}:${existing[0]?.size ?? 0}`;
        if (!emittedDuplicateKeys.has(key)) {
          hooks.onDuplicateGroupBatch?.([{ hash: item.digest, size: existing[0]?.size ?? 0, files: [...existing] }]);
          emittedDuplicateKeys.add(key);
        }
        hooks.onProgress?.({
          stage: "hashing",
          scannedCount: state.scannedFileCount,
          junkCount: state.hashed,
          duplicateGroupCount: emittedDuplicateKeys.size,
          percent: Math.min(95, 75 + Math.floor((state.hashed / Math.max(1, options.maxFilesToHash)) * 20))
        });
      }
    }

    if (state.truncated) {
      break;
    }
  }
}

/** Czkawka 风格：同大小再 SHA256，仅保留重复组 */
export async function scanDuplicateFiles(
  options: DuplicateScanOptions,
  hooks: ScanRuntimeHooks = {}
): Promise<DuplicateScanResult> {
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);
  let scannedCount = 0;
  const bySize = new Map<number, AnalyzeFileMeta[]>();
  const skippedPaths: string[] = [];

  await collectFilesMeta(rootPath, options.ignoreDirKeywords, {
    storeFiles: false,
    isCancelled: hooks.isCancelled,
    onFile: (f) => {
      scannedCount += 1;
      if (f.size < options.minSizeBytes) {
        return;
      }
      const list = bySize.get(f.size) ?? [];
      list.push(f);
      bySize.set(f.size, list);
      if (scannedCount % 200 === 0) {
        hooks.onProgress?.({
          stage: "walking",
          scannedCount,
          junkCount: 0,
          duplicateGroupCount: 0,
          percent: Math.min(75, Math.floor((scannedCount / 8000) * 75))
        });
      }
    }
  });

  const byHash = new Map<string, JunkFile[]>();
  const emittedDuplicateKeys = new Set<string>();
  const state = { hashed: 0, truncated: false, scannedFileCount: scannedCount };

  for (const [size, candidates] of bySize) {
    bySize.delete(size);
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    await processSizeBucket(candidates, options, hooks, skippedPaths, byHash, emittedDuplicateKeys, state);
    if (state.truncated) {
      break;
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [hash, list] of byHash) {
    if (list.length >= 2) {
      groups.push({ hash, size: list[0]?.size ?? 0, files: list });
    }
  }

  hooks.onProgress?.({
    stage: "done",
    scannedCount,
    junkCount: groups.reduce((acc, g) => acc + g.files.length, 0),
    duplicateGroupCount: groups.length,
    percent: 100
  });

  return {
    scannedFileCount: scannedCount,
    groups,
    skippedPaths,
    truncated: state.truncated
  };
}
