import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeWinPath } from "../path-safety";
import { EXCLUDED_DIR_NAMES } from "./constants";

export function normalizeExtensions(exts: string[]): string[] {
  return exts
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
}

export function isSystemProtectedDir(dirPath: string): boolean {
  const parts = dirPath.toLowerCase().split(path.sep);
  return parts.some((part) => EXCLUDED_DIR_NAMES.has(part));
}

export function shouldIgnoreByKeyword(dirPath: string, keywords: string[]): boolean {
  if (keywords.length === 0) {
    return false;
  }
  const lower = dirPath.toLowerCase();
  return keywords.some((word) => lower.includes(word.toLowerCase()));
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`扫描路径不是目录: ${dirPath}`);
  }
}

export function getSystemDriveRoot(): string {
  const sys = process.env.SystemDrive ?? "C:";
  return sys.endsWith("\\") ? sys : `${sys}\\`;
}

export function isPathOnDrive(targetPath: string, driveRoot: string): boolean {
  const norm = normalizeWinPath(targetPath);
  const root = normalizeWinPath(driveRoot);
  const rootNoSlash = root.endsWith("\\") ? root.slice(0, -1) : root;
  return norm === rootNoSlash || norm.startsWith(root);
}

export function isSystemDriveRoot(driveRoot: string): boolean {
  return normalizeWinPath(driveRoot) === normalizeWinPath(getSystemDriveRoot());
}
