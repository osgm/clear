export type RuleKey = "tempExtensions" | "bigFiles" | "oldFiles";

export interface ScanOptions {
  rootPath: string;
  minBigFileSizeMB: number;
  oldFileDays: number;
  includeExtensions: string[];
  ignoreDirKeywords: string[];
  /** default: 通用规则；c-disk: 磁盘清理（系统缓存/临时/冗余/备份类路径） */
  scanProfile?: "default" | "c-disk";
}

export interface JunkFile {
  path: string;
  size: number;
  sizeMB: number;
  reason: string;
  modifiedAt: string;
  /** 磁盘清理时的分类：系统缓存 | 临时文件 | 冗余文件 | 系统备份 */
  category?: string;
  /** 规则风险等级：safe 默认勾选，cautious/risky 需人工确认 */
  riskLevel?: "safe" | "cautious" | "risky";
}

/** 磁盘清理：按扫描分类汇总的体积（用于结果面板展示） */
export interface CDiskCategoryStat {
  category: string;
  /** 该分类扫描目录内文件总体积 */
  totalBytes: number;
  /** 符合清理规则、可安全删除的体积 */
  cleanableBytes: number;
  fileCount: number;
  cleanableCount: number;
}

export interface ScanResult {
  scannedCount: number;
  junkFiles: JunkFile[];
  totalJunkBytes: number;
  skippedPaths: string[];
  duplicateGroupCount: number;
  /** C 盘系统还原点/卷影副本占用（字节），仅检查不清理 */
  restorePointBytes?: number;
  /** c-disk 扫描：各分类体积汇总 */
  categoryStats?: CDiskCategoryStat[];
}

export interface ScanProgress {
  stage: "walking" | "hashing" | "done";
  scannedCount: number;
  junkCount: number;
  duplicateGroupCount: number;
  percent: number;
  currentPath?: string;
}

export interface CleanupResult {
  deletedCount: number;
  failedCount: number;
  freedBytes: number;
  failures: Array<{ path: string; error: string }>;
  /** 用户取消清理时为 true */
  cancelled?: boolean;
}

export interface ReportPayload {
  createdAt: string;
  rootPath: string;
  options: ScanOptions;
  scanResult: ScanResult;
  cleanupResult?: CleanupResult;
}

export interface PrivacyCategory {
  id: string;
  name: string;
  /** 展示用主路径（取 paths 中首个非空） */
  path: string;
  /** 扫描与清理涉及的路径；空占位项可为空数组 */
  paths: string[];
  fileCount: number;
  sizeBytes: number;
  group: "browser" | "system" | "software";
}

/** recycle: 回收站；shred: 覆写后删除（参考 BleachBit 安全删除思路，不可依赖回收站恢复） */
export type CleanupMode = "recycle" | "shred";

/** Czkawka 类：按目录分析重复文件 */
export interface DuplicateScanOptions {
  rootPath: string;
  ignoreDirKeywords: string[];
  minSizeBytes: number;
  maxFilesToHash: number;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: JunkFile[];
}

export interface DuplicateScanResult {
  scannedFileCount: number;
  groups: DuplicateGroup[];
  skippedPaths: string[];
  truncated: boolean;
}

export interface BigFilesScanOptions {
  rootPath: string;
  ignoreDirKeywords: string[];
  minSizeMB: number;
  topN: number;
  /** Windows: 额外扫描 System Volume Information 下还原点相关文件 */
  includeRestorePointFiles?: boolean;
}

export interface BigFilesScanResult {
  scannedFileCount: number;
  files: JunkFile[];
}

export interface EmptyScanOptions {
  rootPath: string;
  ignoreDirKeywords: string[];
  mode: "empty-files" | "empty-dirs";
}

export interface EmptyScanResult {
  scannedFileCount: number;
  items: JunkFile[];
}
