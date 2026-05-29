export const DEFAULT_EXTENSIONS = [
  ".tmp",
  ".temp",
  ".log",
  ".cache",
  ".bak",
  ".old",
  ".dmp",
  ".chk",
  ".download",
  ".crdownload",
  ".partial",
  ".part",
  ".aria2",
  ".opdownload",
  ".etl"
];

export const EXCLUDED_DIR_NAMES = new Set([
  "$recycle.bin",
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "system volume information"
]);

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MB = 1024 * 1024;
export const SCAN_IO_CONCURRENCY = 16;
export const CLEANUP_RECYCLE_CONCURRENCY = 24;
export const CLEANUP_SHRED_CONCURRENCY = 2;
export const CLEANUP_DELETE_TIMEOUT_MS = 10_000;
export const DUP_FINGERPRINT_BYTES = 64 * 1024;
export const DUP_HASH_CONCURRENCY = 8;
export const RESTORE_POINT_CACHE_TTL_MS = 5 * 60 * 1000;
