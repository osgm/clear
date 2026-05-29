import path from "node:path";
import { promises as fs } from "node:fs";
import { JunkFile, ScanOptions, ScanResult } from "../../../shared/src/types";
import { normalizeWinPath, shouldBlockCDiskSubtree } from "../path-safety";
import { MB, SCAN_IO_CONCURRENCY } from "../internal/constants";
import { ensureDirectoryExists, shouldIgnoreByKeyword } from "../internal/fs-helpers";
import { forEachWithConcurrency, ScanRuntimeHooks, waitIfPaused } from "../internal/scan-hooks";
import { getRestorePointUsageBytes } from "../platform/restore-point";
import {
  buildCategoryStatsFromJunks,
  buildCDiskScanCatalog,
  matchCDiskStrategy
} from "./cdisk-catalog";
import type { CDiskCatalogEntry } from "./cdisk-types";

export async function scanCDiskCleanupWithHooks(
  options: ScanOptions,
  hooks: ScanRuntimeHooks
): Promise<ScanResult> {
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);
  const ignoreDirKeywords = options.ignoreDirKeywords.map((x) => x.trim()).filter(Boolean);

  const junkFiles: JunkFile[] = [];
  const seenJunkPaths = new Set<string>();
  const skippedPaths: string[] = [];
  let scannedCount = 0;
  const duplicateGroupCount = 0;

  const catalog = await buildCDiskScanCatalog(rootPath);
  const emitProgress = (currentPath?: string) => {
    hooks.onProgress?.({
      stage: "walking",
      scannedCount,
      junkCount: junkFiles.length,
      duplicateGroupCount,
      percent: Math.min(95, Math.floor((scannedCount / 12000) * 95)),
      currentPath
    });
  };
  const batch: JunkFile[] = [];
  const emitJunk = (item: JunkFile) => {
    batch.push(item);
    if (batch.length >= 25) {
      hooks.onJunkBatch?.(batch.splice(0, batch.length));
    }
  };
  const flushJunk = () => {
    if (batch.length > 0) {
      hooks.onJunkBatch?.(batch.splice(0, batch.length));
    }
  };

  const tryAddJunk = (found: JunkFile) => {
    const pathKey = normalizeWinPath(found.path);
    if (seenJunkPaths.has(pathKey)) {
      return;
    }
    seenJunkPaths.add(pathKey);
    junkFiles.push(found);
    emitJunk(found);
  };

  const blockCtx = (entry: CDiskCatalogEntry) =>
    entry.recycleBinRoot ? { recycleBinRoot: entry.recycleBinRoot } : undefined;

  async function walkTree(currentPath: string, scanRoot: string, entry: CDiskCatalogEntry): Promise<void> {
    await waitIfPaused(hooks);
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    const ctx = blockCtx(entry);
    if (
      shouldBlockCDiskSubtree(currentPath, ctx) &&
      normalizeWinPath(currentPath) !== normalizeWinPath(scanRoot)
    ) {
      skippedPaths.push(currentPath);
      return;
    }
    if (shouldIgnoreByKeyword(currentPath, ignoreDirKeywords) && normalizeWinPath(currentPath) !== normalizeWinPath(scanRoot)) {
      skippedPaths.push(currentPath);
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      skippedPaths.push(currentPath);
      return;
    }

    const subDirs: string[] = [];
    const filePaths: string[] = [];
    for (const dirent of entries) {
      const fullPath = path.join(currentPath, dirent.name);
      if (dirent.isDirectory()) {
        subDirs.push(fullPath);
      } else if (dirent.isFile()) {
        filePaths.push(fullPath);
      }
    }

    await forEachWithConcurrency(filePaths, SCAN_IO_CONCURRENCY, async (fullPath) => {
      await waitIfPaused(hooks);
      if (hooks.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      scannedCount += 1;
      try {
        const stat = await fs.stat(fullPath);
        const { match, reasons } = matchCDiskStrategy(fullPath, scanRoot, entry.strategy, stat, options);
        if (match) {
          tryAddJunk({
            path: fullPath,
            size: stat.size,
            sizeMB: Number((stat.size / MB).toFixed(2)),
            reason: reasons.join(" | "),
            modifiedAt: new Date(stat.mtimeMs).toLocaleString(),
            category: entry.category,
            riskLevel: entry.riskLevel
          });
        }
      } catch {
        skippedPaths.push(fullPath);
      }
      if (scannedCount % 200 === 0) {
        emitProgress(fullPath);
      }
    });

    for (const fullPath of subDirs) {
      if (hooks.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      if (shouldBlockCDiskSubtree(fullPath, ctx)) {
        skippedPaths.push(fullPath);
        continue;
      }
      await walkTree(fullPath, scanRoot, entry);
    }
  }

  async function processEntry(entry: CDiskCatalogEntry): Promise<void> {
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    let st;
    try {
      st = await fs.stat(entry.root);
    } catch {
      return;
    }
    if (st.isFile()) {
      scannedCount += 1;
      const { match, reasons } = matchCDiskStrategy(
        entry.root,
        entry.root,
        entry.strategy,
        { size: st.size, mtimeMs: st.mtimeMs },
        options
      );
      if (match) {
        tryAddJunk({
          path: entry.root,
          size: st.size,
          sizeMB: Number((st.size / MB).toFixed(2)),
          reason: reasons.join(" | "),
          modifiedAt: new Date(st.mtimeMs).toLocaleString(),
          category: entry.category,
          riskLevel: entry.riskLevel
        });
      }
      return;
    }
    if (st.isDirectory()) {
      await walkTree(entry.root, entry.root, entry);
    }
  }

  for (const entry of catalog) {
    await processEntry(entry);
  }
  flushJunk();
  const restorePointBytes = await getRestorePointUsageBytes(rootPath);

  const categoryStats = buildCategoryStatsFromJunks(junkFiles);

  hooks.onProgress?.({
    stage: "done",
    scannedCount,
    junkCount: junkFiles.length,
    duplicateGroupCount,
    percent: 100
  });

  const totalJunkBytes = categoryStats.reduce(
    (acc: number, item: { cleanableBytes: number }) => acc + item.cleanableBytes,
    0
  );
  return {
    scannedCount,
    junkFiles,
    totalJunkBytes,
    skippedPaths,
    duplicateGroupCount,
    restorePointBytes,
    categoryStats
  };
}
