import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { JunkFile } from "../../shared/src/types";

export function normalizeWinPath(p: string): string {
  return path.resolve(p).toLowerCase().replace(/\//g, "\\");
}

/** 磁盘清理遍历：禁止进入的危险子路径 */
export function shouldBlockCDiskSubtree(dirPath: string, ctx?: { recycleBinRoot?: string }): boolean {
  const n = normalizeWinPath(dirPath) + "\\";
  if (ctx?.recycleBinRoot) {
    const rb = normalizeWinPath(ctx.recycleBinRoot) + "\\";
    if (n.startsWith(rb) || normalizeWinPath(dirPath) === normalizeWinPath(ctx.recycleBinRoot)) {
      return false;
    }
  }
  const blocks = [
    "\\windows\\winsxs\\",
    "\\windows\\system32\\",
    "\\windows\\syswow64\\",
    "\\program files\\",
    "\\program files (x86)\\",
    "\\program files (arm)\\",
    "\\system volume information\\",
    "$recycle.bin\\"
  ];
  return blocks.some((b) => n.includes(b));
}

/** 单文件/目录删除：拒绝系统关键路径 */
export function isBlockedDeletionPath(targetPath: string): boolean {
  const n = normalizeWinPath(targetPath);
  const blocks = [
    "\\windows\\system32",
    "\\windows\\syswow64",
    "\\windows\\winsxs",
    "\\program files\\",
    "\\program files (x86)\\",
    "\\boot\\",
    "\\efi\\"
  ];
  if (blocks.some((b) => n.includes(b))) {
    return true;
  }
  const base = path.basename(n);
  const blockedNames = new Set(["ntuser.dat", "bootmgr", "pagefile.sys", "hiberfil.sys", "swapfile.sys"]);
  return blockedNames.has(base);
}

export async function assertSafeScanRoot(rootPath: string): Promise<string> {
  const resolved = path.resolve(rootPath.trim());
  if (!existsSync(resolved)) {
    throw new Error(`扫描路径不存在: ${resolved}`);
  }
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`扫描路径不是目录: ${resolved}`);
  }
  if (shouldBlockCDiskSubtree(resolved)) {
    throw new Error(`不允许将系统保护目录作为扫描根路径: ${resolved}`);
  }
  return resolved;
}

export function filterSafeCleanupTargets(targets: JunkFile[]): {
  allowed: JunkFile[];
  rejected: Array<{ path: string; error: string }>;
} {
  const allowed: JunkFile[] = [];
  const rejected: Array<{ path: string; error: string }> = [];
  for (const item of targets) {
    const raw = item?.path?.trim();
    if (!raw) {
      rejected.push({ path: raw || "", error: "路径为空" });
      continue;
    }
    const resolved = path.resolve(raw);
    if (!existsSync(resolved)) {
      rejected.push({ path: resolved, error: "路径不存在" });
      continue;
    }
    if (isBlockedDeletionPath(resolved)) {
      rejected.push({ path: resolved, error: "系统保护路径，禁止删除" });
      continue;
    }
    allowed.push({ ...item, path: resolved });
  }
  return { allowed, rejected };
}
