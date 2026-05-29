export { killTrackedChildProcesses } from "./platform/subprocess";
export type { CleanupRuntimeHooks } from "./internal/scan-hooks";
export { scanForJunk, scanForJunkWithHooks } from "./scan/junk-scan";
export { cleanupFiles } from "./cleanup/files";
export { scanPrivacyCategories, cleanupPrivacyCategories } from "./cleanup/privacy";
export { scanDuplicateFiles } from "./analyze/duplicate-scan";
export { scanBigFilesRanking } from "./analyze/bigfiles-scan";
export { scanEmptyItems } from "./analyze/empty-scan";
