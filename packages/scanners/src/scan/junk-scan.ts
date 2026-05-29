import path from "node:path";
import { promises as fs } from "node:fs";
import { JunkFile, ScanOptions, ScanProgress, ScanResult } from "../../../shared/src/types";
import { DEFAULT_EXTENSIONS, DAY_MS, MB, SCAN_IO_CONCURRENCY } from "../internal/constants";
import {
  ensureDirectoryExists,
  isSystemProtectedDir,
  normalizeExtensions,
  shouldIgnoreByKeyword
} from "../internal/fs-helpers";
import { forEachWithConcurrency, ScanRuntimeHooks, waitIfPaused } from "../internal/scan-hooks";
import { scanCDiskCleanupWithHooks } from "./cdisk-scan";

export async function scanForJunk(options: ScanOptions): Promise<ScanResult> {
  if (options.scanProfile === "c-disk") {
    return scanForJunkWithHooks(options, {});
  }
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);
  const includeExtensions =
    options.includeExtensions.length > 0
      ? normalizeExtensions(options.includeExtensions)
      : DEFAULT_EXTENSIONS;

  const oldThreshold = Date.now() - options.oldFileDays * DAY_MS;
  const bigFileThresholdBytes = options.minBigFileSizeMB * MB;
  const ignoreDirKeywords = options.ignoreDirKeywords
    .map((x) => x.trim())
    .filter(Boolean);

  const junkFiles: JunkFile[] = [];
  const skippedPaths: string[] = [];
  let scannedCount = 0;

  async function walk(currentPath: string): Promise<void> {
    if (
      (isSystemProtectedDir(currentPath) || shouldIgnoreByKeyword(currentPath, ignoreDirKeywords)) &&
      currentPath !== rootPath
    ) {
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

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      scannedCount += 1;

      try {
        const stat = await fs.stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase();
        const reasons: string[] = [];

        if (includeExtensions.includes(ext)) {
          reasons.push(`临时/缓存扩展名: ${ext}`);
        }
        if (stat.size >= bigFileThresholdBytes) {
          reasons.push(`大文件: ${(stat.size / MB).toFixed(2)} MB`);
        }
        if (stat.mtimeMs <= oldThreshold) {
          reasons.push(`长期未修改: ${options.oldFileDays}+ 天`);
        }

        if (reasons.length > 0) {
          junkFiles.push({
            path: fullPath,
            size: stat.size,
            sizeMB: Number((stat.size / MB).toFixed(2)),
            reason: reasons.join(" | "),
            modifiedAt: new Date(stat.mtimeMs).toLocaleString(),
            riskLevel: "safe" as const
          });
        }
      } catch {
        skippedPaths.push(fullPath);
      }
    }
  }

  await walk(rootPath);

  const totalJunkBytes = junkFiles.reduce((acc, item) => acc + item.size, 0);
  return {
    scannedCount,
    junkFiles,
    totalJunkBytes,
    skippedPaths,
    duplicateGroupCount: 0
  };
}

export async function scanForJunkWithHooks(
  options: ScanOptions,
  hooks: ScanRuntimeHooks = {}
): Promise<ScanResult> {
  if (options.scanProfile === "c-disk") {
    return scanCDiskCleanupWithHooks(options, hooks);
  }
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);
  const includeExtensions =
    options.includeExtensions.length > 0
      ? normalizeExtensions(options.includeExtensions)
      : DEFAULT_EXTENSIONS;

  const oldThreshold = Date.now() - options.oldFileDays * DAY_MS;
  const bigFileThresholdBytes = options.minBigFileSizeMB * MB;
  const ignoreDirKeywords = options.ignoreDirKeywords.map((x) => x.trim()).filter(Boolean);

  const junkFiles: JunkFile[] = [];
  const skippedPaths: string[] = [];
  let scannedCount = 0;

  const emitProgress = (progress: Partial<ScanProgress>) => {
    hooks.onProgress?.({
      stage: "walking",
      scannedCount,
      junkCount: junkFiles.length,
      duplicateGroupCount: 0,
      percent: Math.min(70, Math.floor((scannedCount / 6000) * 70)),
      ...progress
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

  async function walk(currentPath: string): Promise<void> {
    await waitIfPaused(hooks);
    if (hooks.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    if (
      (isSystemProtectedDir(currentPath) || shouldIgnoreByKeyword(currentPath, ignoreDirKeywords)) &&
      currentPath !== rootPath
    ) {
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
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        subDirs.push(fullPath);
      } else if (entry.isFile()) {
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
        const ext = path.extname(fullPath).toLowerCase();
        const reasons: string[] = [];
        if (includeExtensions.includes(ext)) {
          reasons.push(`临时/缓存扩展名: ${ext}`);
        }
        if (stat.size >= bigFileThresholdBytes) {
          reasons.push(`大文件: ${(stat.size / MB).toFixed(2)} MB`);
        }
        if (stat.mtimeMs <= oldThreshold) {
          reasons.push(`长期未修改: ${options.oldFileDays}+ 天`);
        }
        if (reasons.length > 0) {
          const found = {
            path: fullPath,
            size: stat.size,
            sizeMB: Number((stat.size / MB).toFixed(2)),
            reason: reasons.join(" | "),
            modifiedAt: new Date(stat.mtimeMs).toLocaleString(),
            riskLevel: "safe" as const
          };
          junkFiles.push(found);
          emitJunk(found);
        }
      } catch {
        skippedPaths.push(fullPath);
      }
      if (scannedCount % 200 === 0) {
        emitProgress({ stage: "walking", currentPath: fullPath });
      }
    });

    for (const fullPath of subDirs) {
      if (hooks.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      await walk(fullPath);
    }
  }

  await walk(rootPath);
  flushJunk();

  hooks.onProgress?.({
    stage: "done",
    scannedCount,
    junkCount: junkFiles.length,
    duplicateGroupCount: 0,
    percent: 100
  });

  const totalJunkBytes = junkFiles.reduce((acc, item) => acc + item.size, 0);
  return {
    scannedCount,
    junkFiles,
    totalJunkBytes,
    skippedPaths,
    duplicateGroupCount: 0
  };
}
