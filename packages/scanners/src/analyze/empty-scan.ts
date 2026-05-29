import { promises as fs } from "node:fs";
import path from "node:path";
import { EmptyScanOptions, EmptyScanResult, JunkFile } from "../../../shared/src/types";
import { ensureDirectoryExists, isSystemProtectedDir, shouldIgnoreByKeyword } from "../internal/fs-helpers";
import { ScanRuntimeHooks } from "../internal/scan-hooks";
import { AnalyzeFileMeta, collectFilesMeta, metaToJunk } from "./meta";

async function collectEmptyDirectories(
  rootPath: string,
  ignoreDirKeywords: string[],
  hooks?: {
    isCancelled?: () => boolean;
    onDirScanned?: (scannedCount: number, emptyCount: number) => void;
    onEmptyBatch?: (paths: string[]) => void;
  }
): Promise<string[]> {
  const empty: string[] = [];
  let scannedCount = 0;
  let pendingEmptyBatch: string[] = [];

  async function walkDir(dirPath: string): Promise<boolean> {
    if (hooks?.isCancelled?.()) {
      throw new Error("SCAN_CANCELLED");
    }
    if (shouldIgnoreByKeyword(dirPath, ignoreDirKeywords)) {
      return false;
    }
    if (isSystemProtectedDir(dirPath)) {
      return false;
    }
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return false;
    }
    scannedCount += 1;
    if (scannedCount % 120 === 0) {
      hooks?.onDirScanned?.(scannedCount, empty.length);
    }
    const subDirs = entries.filter((ent) => ent.isDirectory()).map((ent) => path.join(dirPath, ent.name));
    const childFlags: boolean[] = [];
    for (const sub of subDirs) {
      if (hooks?.isCancelled?.()) {
        throw new Error("SCAN_CANCELLED");
      }
      childFlags.push(await walkDir(sub));
    }
    const hasFiles = entries.some((ent) => ent.isFile());
    const hasNonEmptyDir = childFlags.some((x) => !x);
    const isEmpty = !hasFiles && !hasNonEmptyDir;
    if (isEmpty) {
      empty.push(dirPath);
      pendingEmptyBatch.push(dirPath);
      if (pendingEmptyBatch.length >= 25) {
        hooks?.onEmptyBatch?.(pendingEmptyBatch.splice(0, pendingEmptyBatch.length));
      }
      if (empty.length % 25 === 0) {
        hooks?.onDirScanned?.(scannedCount, empty.length);
      }
    }
    return isEmpty;
  }

  await walkDir(path.resolve(rootPath));
  if (pendingEmptyBatch.length > 0) {
    hooks?.onEmptyBatch?.(pendingEmptyBatch.splice(0, pendingEmptyBatch.length));
  }
  hooks?.onDirScanned?.(scannedCount, empty.length);
  return empty;
}

export async function scanEmptyItems(
  options: EmptyScanOptions,
  hooks: ScanRuntimeHooks = {}
): Promise<EmptyScanResult> {
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);

  if (options.mode === "empty-files") {
    let scannedCount = 0;
    const foundBatch: JunkFile[] = [];
    const empties: AnalyzeFileMeta[] = [];
    await collectFilesMeta(rootPath, options.ignoreDirKeywords, {
      storeFiles: false,
      isCancelled: hooks.isCancelled,
      onFile: (meta) => {
        scannedCount += 1;
        if (meta.size === 0) {
          empties.push(meta);
        }
        if (scannedCount % 200 === 0) {
          hooks.onProgress?.({
            stage: "walking",
            scannedCount,
            junkCount: foundBatch.length + empties.length,
            duplicateGroupCount: 0,
            percent: Math.min(92, Math.floor((scannedCount / 10000) * 92))
          });
        }
      }
    });
    for (const m of empties) {
      foundBatch.push(metaToJunk(m, "空文件（0 字节）"));
      if (foundBatch.length >= 25) {
        hooks.onJunkBatch?.(foundBatch.splice(0, foundBatch.length));
      }
    }
    if (foundBatch.length > 0) {
      hooks.onJunkBatch?.(foundBatch.splice(0, foundBatch.length));
    }
    hooks.onProgress?.({
      stage: "done",
      scannedCount,
      junkCount: empties.length,
      duplicateGroupCount: 0,
      percent: 100
    });
    return {
      scannedFileCount: scannedCount,
      items: empties.map((m) => metaToJunk(m, "空文件（0 字节）"))
    };
  }

  if (hooks.isCancelled?.()) {
    throw new Error("SCAN_CANCELLED");
  }
  const dirs = await collectEmptyDirectories(rootPath, options.ignoreDirKeywords, {
    isCancelled: hooks.isCancelled,
    onDirScanned: (scannedCount, emptyCount) => {
      hooks.onProgress?.({
        stage: "walking",
        scannedCount,
        junkCount: emptyCount,
        duplicateGroupCount: 0,
        percent: Math.min(94, Math.floor((scannedCount / 6000) * 94))
      });
    },
    onEmptyBatch: (paths) => {
      hooks.onJunkBatch?.(
        paths.map((p) => ({
          path: p,
          size: 0,
          sizeMB: 0,
          reason: "空文件夹",
          modifiedAt: ""
        }))
      );
    }
  });
  hooks.onJunkBatch?.(
    dirs.map((p) => ({
      path: p,
      size: 0,
      sizeMB: 0,
      reason: "空文件夹",
      modifiedAt: ""
    }))
  );
  hooks.onProgress?.({
    stage: "done",
    scannedCount: dirs.length,
    junkCount: dirs.length,
    duplicateGroupCount: 0,
    percent: 100
  });
  return {
    scannedFileCount: dirs.length,
    items: dirs.map((p) => ({
      path: p,
      size: 0,
      sizeMB: 0,
      reason: "空文件夹",
      modifiedAt: ""
    }))
  };
}
