import path from "node:path";
import { BigFilesScanOptions, BigFilesScanResult } from "../../../shared/src/types";
import { MB } from "../internal/constants";
import { ensureDirectoryExists } from "../internal/fs-helpers";
import { ScanRuntimeHooks } from "../internal/scan-hooks";
import { getRestorePointUsageBytes } from "../platform/restore-point";
import { AnalyzeFileMeta, collectFilesMeta, collectRestorePointFilesMeta, metaToJunk } from "./meta";

export async function scanBigFilesRanking(
  options: BigFilesScanOptions,
  hooks: ScanRuntimeHooks = {}
): Promise<BigFilesScanResult> {
  const rootPath = path.resolve(options.rootPath);
  await ensureDirectoryExists(rootPath);
  const minBytes = Math.max(0, options.minSizeMB) * MB;
  const topN = Math.max(1, options.topN);
  const candidates: AnalyzeFileMeta[] = [];
  let scannedCount = 0;
  let lastLiveEmitAt = 0;

  const emitLiveBigTop = () => {
    if (candidates.length === 0) return;
    const top = [...candidates].sort((a, b) => b.size - a.size).slice(0, topN);
    hooks.onJunkBatch?.(
      top.map((m, i) => {
        const restoreHint = m.path.toLowerCase().includes("system volume information");
        return metaToJunk(m, restoreHint ? `大文件候选 #${i + 1}` : `大文件候选 #${i + 1}`);
      })
    );
  };

  await collectFilesMeta(rootPath, options.ignoreDirKeywords, {
    storeFiles: false,
    isCancelled: hooks.isCancelled,
    onFile: (meta) => {
      scannedCount += 1;
      if (meta.size >= minBytes) {
        candidates.push(meta);
        if (candidates.length - lastLiveEmitAt >= 20) {
          lastLiveEmitAt = candidates.length;
          emitLiveBigTop();
        }
      }
      if (scannedCount % 200 === 0) {
        hooks.onProgress?.({
          stage: "walking",
          scannedCount,
          junkCount: candidates.length,
          duplicateGroupCount: 0,
          percent: Math.min(90, Math.floor((scannedCount / 10000) * 90))
        });
      }
    }
  });

  if (hooks.isCancelled?.()) {
    throw new Error("SCAN_CANCELLED");
  }

  const includeRestore = Boolean(options.includeRestorePointFiles && process.platform === "win32");
  if (includeRestore) {
    const restoreFiles = await collectRestorePointFilesMeta(rootPath);
    for (const f of restoreFiles) {
      if (f.size >= minBytes) {
        candidates.push(f);
      }
    }
    if (restoreFiles.length === 0) {
      const restoreBytes = await getRestorePointUsageBytes(rootPath);
      if (typeof restoreBytes === "number" && restoreBytes >= minBytes) {
        candidates.push({
          path: path.join(path.parse(rootPath).root, "System Volume Information", "(ShadowStorage Summary)"),
          size: restoreBytes,
          mtimeMs: Date.now()
        });
      }
    }
  }

  candidates.sort((a, b) => b.size - a.size);
  const top = candidates.slice(0, topN);
  hooks.onJunkBatch?.(
    top.map((m, i) => {
      const restoreHint = m.path.toLowerCase().includes("system volume information");
      return metaToJunk(m, restoreHint ? `系统还原点相关 #${i + 1}` : `大文件排行 #${i + 1}`);
    })
  );
  hooks.onProgress?.({
    stage: "done",
    scannedCount,
    junkCount: top.length,
    duplicateGroupCount: 0,
    percent: 100
  });
  return {
    scannedFileCount: scannedCount,
    files: top.map((m, i) => {
      const restoreHint = m.path.toLowerCase().includes("system volume information");
      return metaToJunk(m, restoreHint ? `系统还原点相关 #${i + 1}` : `大文件排行 #${i + 1}`);
    })
  };
}
