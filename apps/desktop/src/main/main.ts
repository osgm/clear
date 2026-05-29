import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultSystemDrive, listSystemDrives } from "./drives";
import {
  runBigFilesAnalyzeTask,
  runBigFilesAnalyzeTaskWithHooks,
  runCleanupTask,
  runDiskScanTask,
  runDuplicateAnalyzeTask,
  runDuplicateAnalyzeTaskWithHooks,
  runEmptyAnalyzeTask,
  runEmptyAnalyzeTaskWithHooks,
  runPrivacyCleanupTask,
  runPrivacyScanTask
} from "../../../../packages/core/src/application/task-services";
import { killTrackedChildProcesses } from "../../../../packages/scanners/src/cleaner";
import { configureRecycleBinHandler } from "../../../../packages/scanners/src/platform/recycle";
import { assertSafeScanRoot, filterSafeCleanupTargets } from "../../../../packages/scanners/src/path-safety";
import {
  BigFilesScanOptions,
  CleanupMode,
  DuplicateGroup,
  DuplicateScanOptions,
  EmptyScanOptions,
  JunkFile,
  PrivacyCategory,
  ReportPayload,
  ScanOptions,
  ScanProgress
} from "../../../../packages/shared/src/types";

let mainWindow: BrowserWindow | null = null;
const scanCancelFlags = new Map<string, boolean>();
const scanPauseFlags = new Map<string, boolean>();
const analyzeCancelFlags = new Map<string, boolean>();
const cleanupCancelFlags = new Map<string, boolean>();

function requestGracefulShutdown(): void {
  for (const taskId of scanCancelFlags.keys()) {
    scanCancelFlags.set(taskId, true);
  }
  for (const taskId of scanPauseFlags.keys()) {
    scanPauseFlags.delete(taskId);
  }
  for (const taskId of analyzeCancelFlags.keys()) {
    analyzeCancelFlags.set(taskId, true);
  }
  for (const taskId of cleanupCancelFlags.keys()) {
    cleanupCancelFlags.set(taskId, true);
  }
  killTrackedChildProcesses();
}

function attachWindowShutdownHandlers(win: BrowserWindow): void {
  win.on("close", () => {
    requestGracefulShutdown();
  });
  win.on("closed", () => {
    mainWindow = null;
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: "清理大师",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererCandidates = [
    path.join(app.getAppPath(), "ui", "index.html"),
    path.join(__dirname, "..", "..", "..", "..", "..", "ui", "index.html")
  ];
  const rendererHtml = rendererCandidates.find((p) => existsSync(p)) ?? rendererCandidates[0];
  mainWindow.loadFile(rendererHtml);
  attachWindowShutdownHandlers(mainWindow);
}

app.whenReady().then(() => {
  configureRecycleBinHandler(async (filePath) => {
    await shell.trashItem(filePath);
  });

  ipcMain.handle("system:listDrives", async () => ({
    drives: listSystemDrives(),
    defaultDrive: defaultSystemDrive()
  }));

  ipcMain.handle("dialog:chooseDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle("scan:start", async (_, options: ScanOptions, taskId: string) => {
    const safeRoot = await assertSafeScanRoot(options.rootPath);
    scanCancelFlags.set(taskId, false);
    scanPauseFlags.set(taskId, false);
    try {
      return await runDiskScanTask(
        { ...options, rootPath: safeRoot },
        {
          onProgress: (progress: ScanProgress) => {
            mainWindow?.webContents.send("scan:progress", { taskId, ...progress });
          },
          onJunkBatch: (items: JunkFile[]) => {
            mainWindow?.webContents.send("scan:junkBatch", { taskId, items });
          },
          isCancelled: () => scanCancelFlags.get(taskId) === true,
          isPaused: () => scanPauseFlags.get(taskId) === true
        }
      );
    } finally {
      scanCancelFlags.delete(taskId);
      scanPauseFlags.delete(taskId);
    }
  });
  ipcMain.handle("scan:cancel", async (_, taskId: string) => {
    scanCancelFlags.set(taskId, true);
    scanPauseFlags.set(taskId, false);
    return { cancelled: true };
  });
  ipcMain.handle("scan:pause", async (_, taskId: string) => {
    scanPauseFlags.set(taskId, true);
    return { paused: true };
  });
  ipcMain.handle("scan:resume", async (_, taskId: string) => {
    scanPauseFlags.set(taskId, false);
    return { paused: false };
  });

  ipcMain.handle("cleanup:start", async (_, targets: JunkFile[], mode?: CleanupMode, taskId?: string) => {
    const { allowed, rejected } = filterSafeCleanupTargets(targets);
    if (taskId) {
      cleanupCancelFlags.set(taskId, false);
    }
    try {
      const result = await runCleanupTask(allowed, mode ?? "recycle", {
        isCancelled: () => (taskId ? cleanupCancelFlags.get(taskId) === true : false)
      });
      if (rejected.length > 0) {
        result.failures.push(
          ...rejected.map((r) => ({
            path: r.path,
            error: r.error
          }))
        );
        result.failedCount += rejected.length;
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "CLEANUP_CANCELLED") {
        return {
          deletedCount: 0,
          failedCount: 0,
          freedBytes: 0,
          failures: [],
          cancelled: true
        };
      }
      throw error;
    } finally {
      if (taskId) {
        cleanupCancelFlags.delete(taskId);
      }
    }
  });
  ipcMain.handle("cleanup:cancel", async (_, taskId: string) => {
    cleanupCancelFlags.set(taskId, true);
    return { cancelled: true };
  });
  ipcMain.handle("privacy:scan", async () => {
    return runPrivacyScanTask();
  });
  ipcMain.handle("privacy:cleanup", async (_, categories: PrivacyCategory[], mode?: CleanupMode, taskId?: string) => {
    if (taskId) {
      cleanupCancelFlags.set(taskId, false);
    }
    try {
      return await runPrivacyCleanupTask(categories, mode ?? "recycle", {
        isCancelled: () => (taskId ? cleanupCancelFlags.get(taskId) === true : false)
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CLEANUP_CANCELLED") {
        return { deletedCount: 0, failedCount: 0, freedBytes: 0, failures: [], cancelled: true };
      }
      throw error;
    } finally {
      if (taskId) {
        cleanupCancelFlags.delete(taskId);
      }
    }
  });

  ipcMain.handle("analyze:duplicates", async (_, opts: DuplicateScanOptions, taskId?: string) => {
    const safeRoot = await assertSafeScanRoot(opts.rootPath);
    if (!taskId) return runDuplicateAnalyzeTask({ ...opts, rootPath: safeRoot });
    analyzeCancelFlags.set(taskId, false);
    try {
      return await runDuplicateAnalyzeTaskWithHooks({ ...opts, rootPath: safeRoot }, {
        onProgress: (progress: ScanProgress) => mainWindow?.webContents.send("analyze:progress", { taskId, ...progress }),
        onJunkBatch: (items: JunkFile[]) => mainWindow?.webContents.send("analyze:junkBatch", { taskId, items }),
        onDuplicateGroupBatch: (groups: DuplicateGroup[]) =>
          mainWindow?.webContents.send("analyze:duplicateBatch", { taskId, groups }),
        isCancelled: () => analyzeCancelFlags.get(taskId) === true
      });
    } finally {
      analyzeCancelFlags.delete(taskId);
    }
  });
  ipcMain.handle("analyze:bigfiles", async (_, opts: BigFilesScanOptions, taskId?: string) => {
    const safeRoot = await assertSafeScanRoot(opts.rootPath);
    if (!taskId) return runBigFilesAnalyzeTask({ ...opts, rootPath: safeRoot });
    analyzeCancelFlags.set(taskId, false);
    try {
      return await runBigFilesAnalyzeTaskWithHooks(opts, {
        onProgress: (progress: ScanProgress) => mainWindow?.webContents.send("analyze:progress", { taskId, ...progress }),
        onJunkBatch: (items: JunkFile[]) => mainWindow?.webContents.send("analyze:junkBatch", { taskId, items }),
        isCancelled: () => analyzeCancelFlags.get(taskId) === true
      });
    } finally {
      analyzeCancelFlags.delete(taskId);
    }
  });
  ipcMain.handle("analyze:empty", async (_, opts: EmptyScanOptions, taskId?: string) => {
    const safeRoot = await assertSafeScanRoot(opts.rootPath);
    if (!taskId) return runEmptyAnalyzeTask({ ...opts, rootPath: safeRoot });
    analyzeCancelFlags.set(taskId, false);
    try {
      return await runEmptyAnalyzeTaskWithHooks({ ...opts, rootPath: safeRoot }, {
        onProgress: (progress: ScanProgress) => mainWindow?.webContents.send("analyze:progress", { taskId, ...progress }),
        onJunkBatch: (items: JunkFile[]) => mainWindow?.webContents.send("analyze:junkBatch", { taskId, items }),
        isCancelled: () => analyzeCancelFlags.get(taskId) === true
      });
    } finally {
      analyzeCancelFlags.delete(taskId);
    }
  });
  ipcMain.handle("analyze:cancel", async (_, taskId: string) => {
    analyzeCancelFlags.set(taskId, true);
    return { cancelled: true };
  });

  ipcMain.handle("report:save", async (_, payload: ReportPayload) => {
    const result = await dialog.showSaveDialog({
      title: "保存清理报告",
      defaultPath: `joy-cleaner-report-${Date.now()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    const content = JSON.stringify(payload, null, 2);
    await fs.writeFile(result.filePath, content, "utf8");
    return { saved: true, filePath: result.filePath };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  requestGracefulShutdown();
});

app.on("window-all-closed", () => {
  requestGracefulShutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  killTrackedChildProcesses();
});
