import { cleanupFiles, cleanupPrivacyCategories } from "../../../scanners/src/modules/cleanup";
import { scanForJunkWithHooks } from "../../../scanners/src/modules/disk-scan";
import { scanPrivacyCategories } from "../../../scanners/src/modules/privacy";
import { scanBigFilesRanking, scanDuplicateFiles, scanEmptyItems } from "../../../scanners/src/modules/analysis";
import {
  BigFilesScanOptions,
  CleanupMode,
  DuplicateGroup,
  DuplicateScanOptions,
  EmptyScanOptions,
  JunkFile,
  PrivacyCategory,
  ScanOptions,
  ScanProgress
} from "../../../shared/src/types";

export async function runDiskScanTask(
  options: ScanOptions,
  hooks: {
    onProgress?: (progress: ScanProgress) => void;
    onJunkBatch?: (items: JunkFile[]) => void;
    isCancelled?: () => boolean;
    isPaused?: () => boolean;
  }
) {
  return scanForJunkWithHooks(options, hooks);
}

export async function runCleanupTask(
  targets: JunkFile[],
  mode: CleanupMode,
  hooks?: { isCancelled?: () => boolean }
) {
  return cleanupFiles(targets, mode, hooks);
}

export async function runPrivacyScanTask() {
  return scanPrivacyCategories();
}

export async function runPrivacyCleanupTask(
  categories: PrivacyCategory[],
  mode: CleanupMode,
  hooks?: { isCancelled?: () => boolean }
) {
  return cleanupPrivacyCategories(categories, mode, hooks);
}

export async function runDuplicateAnalyzeTask(opts: DuplicateScanOptions) {
  return scanDuplicateFiles(opts);
}

export async function runDuplicateAnalyzeTaskWithHooks(
  opts: DuplicateScanOptions,
  hooks: {
    onProgress?: (progress: ScanProgress) => void;
    onJunkBatch?: (items: JunkFile[]) => void;
    onDuplicateGroupBatch?: (groups: DuplicateGroup[]) => void;
    isCancelled?: () => boolean;
  }
) {
  return scanDuplicateFiles(opts, hooks);
}

export async function runBigFilesAnalyzeTask(opts: BigFilesScanOptions) {
  return scanBigFilesRanking(opts);
}

export async function runBigFilesAnalyzeTaskWithHooks(
  opts: BigFilesScanOptions,
  hooks: {
    onProgress?: (progress: ScanProgress) => void;
    onJunkBatch?: (items: JunkFile[]) => void;
    isCancelled?: () => boolean;
  }
) {
  return scanBigFilesRanking(opts, hooks);
}

export async function runEmptyAnalyzeTask(opts: EmptyScanOptions) {
  return scanEmptyItems(opts);
}

export async function runEmptyAnalyzeTaskWithHooks(
  opts: EmptyScanOptions,
  hooks: {
    onProgress?: (progress: ScanProgress) => void;
    onJunkBatch?: (items: JunkFile[]) => void;
    isCancelled?: () => boolean;
  }
) {
  return scanEmptyItems(opts, hooks);
}
