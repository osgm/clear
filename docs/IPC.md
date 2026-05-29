# IPC 与 preload API

渲染进程通过 `window.cleanerApi`（定义于 `apps/desktop/src/main/preload.ts`）访问主进程能力。所有方法均为 **异步**；事件类 API 返回 **取消订阅函数**。

## 系统与对话框

| cleanerApi | IPC | 说明 |
|------------|-----|------|
| `listDrives()` | `system:listDrives` | 返回 `{ drives, defaultDrive }` |
| `chooseDirectory()` | `dialog:chooseDirectory` | 选择目录，取消返回 `null` |

## 磁盘清理

| cleanerApi | IPC | 说明 |
|------------|-----|------|
| `scan(options, taskId)` | `scan:start` | 启动扫描；`taskId` 用于取消与事件关联 |
| `cancelScan(taskId)` | `scan:cancel` | 设置取消标志 |
| `pauseScan(taskId)` | `scan:pause` | 暂停扫描（停止读盘） |
| `resumeScan(taskId)` | `scan:resume` | 继续扫描 |
| `onScanProgress(cb)` | ← `scan:progress` | 进度 `{ taskId, stage, percent, ... }` |
| `onScanJunkBatch(cb)` | ← `scan:junkBatch` | 批次垃圾 `{ taskId, items: JunkFile[] }` |
| `cleanup(targets, mode?, taskId?)` | `cleanup:start` | 可选 `taskId` 以支持取消 |
| `cancelCleanup(taskId)` | `cleanup:cancel` | 取消进行中的清理 |

### ScanOptions（摘要）

```ts
{
  rootPath: string;
  minBigFileSizeMB: number;
  oldFileDays: number;
  includeExtensions: string[];
  ignoreDirKeywords: string[];
  scanProfile?: "default" | "c-disk";  // C 盘专清用 "c-disk"
}
```

## 隐私清理

| cleanerApi | IPC | 说明 |
|------------|-----|------|
| `scanPrivacy()` | `privacy:scan` | 返回 `PrivacyCategory[]` |
| `cleanupPrivacy(categories, mode?)` | `privacy:cleanup` | 按类别清理 |

## 磁盘分析

无 `taskId` 时为一次性等待结果；带 `taskId` 时启用进度推送与 `analyze:cancel`。

| cleanerApi | IPC | 说明 |
|------------|-----|------|
| `scanDuplicates(opts)` | `analyze:duplicates` | 同步等待完整结果 |
| `scanDuplicatesTask(opts, taskId)` | `analyze:duplicates` | 带实时批次 |
| `scanBigFiles(opts)` | `analyze:bigfiles` | |
| `scanBigFilesTask(opts, taskId)` | `analyze:bigfiles` | |
| `scanEmptyItems(opts)` | `analyze:empty` | |
| `scanEmptyItemsTask(opts, taskId)` | `analyze:empty` | |
| `cancelAnalyze(taskId)` | `analyze:cancel` | |
| `onAnalyzeProgress(cb)` | ← `analyze:progress` | |
| `onAnalyzeJunkBatch(cb)` | ← `analyze:junkBatch` | 大文件、空项 |
| `onAnalyzeDuplicateBatch(cb)` | ← `analyze:duplicateBatch` | 重复组 |

## 报告

| cleanerApi | IPC | 说明 |
|------------|-----|------|
| `saveReport(payload)` | `report:save` | 弹出保存对话框，写入 JSON |

## 类型定义

完整字段见 `packages/shared/src/types.ts`：

- `JunkFile`、`ScanResult`、`ScanProgress`
- `CleanupResult`、`CleanupMode`
- `DuplicateScanOptions`、`DuplicateGroup`
- `BigFilesScanOptions`、`EmptyScanOptions`
- `PrivacyCategory`、`ReportPayload`

## 取消与错误

- 扫描/分析取消后，核心层抛出 `Error("SCAN_CANCELLED")`，IPC Promise 以 rejection 结束（UI 需 catch 或判断消息）。
- 长时间 IPC 会阻塞应用退出；关闭窗口时主进程会对所有活动 `taskId` 置取消并结束子进程（见 [ARCHITECTURE.md](./ARCHITECTURE.md)）。
