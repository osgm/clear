import { contextBridge, ipcRenderer } from "electron";
import {
  BigFilesScanOptions,
  BigFilesScanResult,
  CleanupMode,
  CleanupResult,
  DuplicateGroup,
  DuplicateScanOptions,
  DuplicateScanResult,
  EmptyScanOptions,
  EmptyScanResult,
  JunkFile,
  PrivacyCategory,
  ReportPayload,
  ScanProgress,
  ScanOptions,
  ScanResult
} from "../../../../packages/shared/src/types";

contextBridge.exposeInMainWorld("cleanerApi", {
  listDrives: async (): Promise<{ drives: string[]; defaultDrive: string }> =>
    ipcRenderer.invoke("system:listDrives"),
  chooseDirectory: async (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:chooseDirectory"),
  scan: async (options: ScanOptions, taskId: string): Promise<ScanResult> =>
    ipcRenderer.invoke("scan:start", options, taskId),
  cancelScan: async (taskId: string): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke("scan:cancel", taskId),
  pauseScan: async (taskId: string): Promise<{ paused: boolean }> =>
    ipcRenderer.invoke("scan:pause", taskId),
  resumeScan: async (taskId: string): Promise<{ paused: boolean }> =>
    ipcRenderer.invoke("scan:resume", taskId),
  onScanProgress: (callback: (payload: ScanProgress & { taskId: string }) => void): (() => void) => {
    const listener = (_event: unknown, payload: ScanProgress & { taskId: string }) => callback(payload);
    ipcRenderer.on("scan:progress", listener);
    return () => ipcRenderer.removeListener("scan:progress", listener);
  },
  onScanJunkBatch: (callback: (payload: { taskId: string; items: JunkFile[] }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { taskId: string; items: JunkFile[] }) => callback(payload);
    ipcRenderer.on("scan:junkBatch", listener);
    return () => ipcRenderer.removeListener("scan:junkBatch", listener);
  },
  cleanup: async (targets: JunkFile[], mode?: CleanupMode): Promise<CleanupResult> =>
    ipcRenderer.invoke("cleanup:start", targets, mode),
  scanPrivacy: async (): Promise<PrivacyCategory[]> => ipcRenderer.invoke("privacy:scan"),
  cleanupPrivacy: async (
    categories: PrivacyCategory[],
    mode?: CleanupMode,
    taskId?: string
  ): Promise<CleanupResult> => ipcRenderer.invoke("privacy:cleanup", categories, mode, taskId),
  scanDuplicates: async (opts: DuplicateScanOptions): Promise<DuplicateScanResult> =>
    ipcRenderer.invoke("analyze:duplicates", opts),
  scanDuplicatesTask: async (opts: DuplicateScanOptions, taskId: string): Promise<DuplicateScanResult> =>
    ipcRenderer.invoke("analyze:duplicates", opts, taskId),
  scanBigFiles: async (opts: BigFilesScanOptions): Promise<BigFilesScanResult> =>
    ipcRenderer.invoke("analyze:bigfiles", opts),
  scanBigFilesTask: async (opts: BigFilesScanOptions, taskId: string): Promise<BigFilesScanResult> =>
    ipcRenderer.invoke("analyze:bigfiles", opts, taskId),
  scanEmptyItems: async (opts: EmptyScanOptions): Promise<EmptyScanResult> =>
    ipcRenderer.invoke("analyze:empty", opts),
  scanEmptyItemsTask: async (opts: EmptyScanOptions, taskId: string): Promise<EmptyScanResult> =>
    ipcRenderer.invoke("analyze:empty", opts, taskId),
  cancelAnalyze: async (taskId: string): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke("analyze:cancel", taskId),
  onAnalyzeProgress: (callback: (payload: ScanProgress & { taskId: string }) => void): (() => void) => {
    const listener = (_event: unknown, payload: ScanProgress & { taskId: string }) => callback(payload);
    ipcRenderer.on("analyze:progress", listener);
    return () => ipcRenderer.removeListener("analyze:progress", listener);
  },
  onAnalyzeJunkBatch: (callback: (payload: { taskId: string; items: JunkFile[] }) => void): (() => void) => {
    const listener = (_event: unknown, payload: { taskId: string; items: JunkFile[] }) => callback(payload);
    ipcRenderer.on("analyze:junkBatch", listener);
    return () => ipcRenderer.removeListener("analyze:junkBatch", listener);
  },
  onAnalyzeDuplicateBatch: (
    callback: (payload: { taskId: string; groups: DuplicateGroup[] }) => void
  ): (() => void) => {
    const listener = (_event: unknown, payload: { taskId: string; groups: DuplicateGroup[] }) =>
      callback(payload);
    ipcRenderer.on("analyze:duplicateBatch", listener);
    return () => ipcRenderer.removeListener("analyze:duplicateBatch", listener);
  },
  saveReport: async (payload: ReportPayload): Promise<{ saved: boolean; filePath?: string }> =>
    ipcRenderer.invoke("report:save", payload)
});
