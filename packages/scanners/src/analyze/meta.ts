import { promises as fs } from "node:fs";
import path from "node:path";
import { JunkFile } from "../../../shared/src/types";
import { MB, SCAN_IO_CONCURRENCY } from "../internal/constants";
import { isSystemProtectedDir, shouldIgnoreByKeyword } from "../internal/fs-helpers";
import { forEachWithConcurrency } from "../internal/scan-hooks";

export interface AnalyzeFileMeta {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface CollectFilesMetaHooks {
  onFile?: (file: AnalyzeFileMeta) => void;
  isCancelled?: () => boolean;
  /** When false, only invoke onFile without retaining a full files array. Default true. */
  storeFiles?: boolean;
}

export async function collectFilesMeta(
  rootPath: string,
  ignoreDirKeywords: string[],
  hooks?: CollectFilesMetaHooks
): Promise<{ files: AnalyzeFileMeta[]; skippedPaths: string[] }> {
  const storeFiles = hooks?.storeFiles !== false;
  const files: AnalyzeFileMeta[] = [];
  const skippedPaths: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    if (hooks?.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    if (shouldIgnoreByKeyword(currentPath, ignoreDirKeywords)) {
      return;
    }
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      skippedPaths.push(currentPath);
      return;
    }
    if (stat.isFile()) {
      const meta = {
        path: currentPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      };
      if (storeFiles) {
        files.push(meta);
      }
      hooks?.onFile?.(meta);
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    if (isSystemProtectedDir(currentPath)) {
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
      const full = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        subDirs.push(full);
      } else if (entry.isFile()) {
        filePaths.push(full);
      }
    }

    await forEachWithConcurrency(filePaths, SCAN_IO_CONCURRENCY, async (p) => {
      if (hooks?.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      await walk(p);
    });
    for (const d of subDirs) {
      if (hooks?.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      await walk(d);
    }
  }

  await walk(rootPath);
  return { files, skippedPaths };
}

export async function collectRestorePointFilesMeta(rootPath: string): Promise<AnalyzeFileMeta[]> {
  if (process.platform !== "win32") {
    return [];
  }
  const volumeRoot = path.parse(path.resolve(rootPath)).root;
  if (!volumeRoot) {
    return [];
  }
  const restoreRoot = path.join(volumeRoot, "System Volume Information");
  let rootStat;
  try {
    rootStat = await fs.stat(restoreRoot);
  } catch {
    return [];
  }
  if (!rootStat.isDirectory()) {
    return [];
  }

  const files: AnalyzeFileMeta[] = [];
  async function walk(currentPath: string): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      return;
    }
    if (stat.isFile()) {
      files.push({
        path: currentPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      });
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    const filePaths: string[] = [];
    const subDirs: string[] = [];
    for (const entry of entries) {
      const full = path.join(currentPath, entry.name);
      if (entry.isFile()) {
        filePaths.push(full);
      } else if (entry.isDirectory()) {
        subDirs.push(full);
      }
    }
    await forEachWithConcurrency(filePaths, SCAN_IO_CONCURRENCY, async (p) => {
      await walk(p);
    });
    await forEachWithConcurrency(subDirs, 4, async (d) => {
      await walk(d);
    });
  }

  await walk(restoreRoot);
  return files;
}

export function metaToJunk(m: AnalyzeFileMeta, reason: string): JunkFile {
  return {
    path: m.path,
    size: m.size,
    sizeMB: Number((m.size / MB).toFixed(2)),
    reason,
    modifiedAt: new Date(m.mtimeMs).toLocaleString()
  };
}
