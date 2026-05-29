import path from "node:path";
import { MB, RESTORE_POINT_CACHE_TTL_MS } from "../internal/constants";
import { execFile } from "./subprocess";

const restorePointCache = new Map<string, { at: number; value?: number }>();

function getVolumeSpecFromRoot(rootPath: string): string | undefined {
  const root = path.parse(path.resolve(rootPath)).root;
  const volume = root.endsWith("\\") ? root.slice(0, -1) : root;
  return /^[A-Za-z]:$/.test(volume) ? volume : undefined;
}

function parseVssShadowStorageUsedBytes(line: string): number | undefined {
  const bytesInParens = line.match(/\(([\d,\.]+)\s*(?:bytes|字节)\)/i);
  if (bytesInParens?.[1]) {
    const num = Number(bytesInParens[1].replace(/[,.]/g, ""));
    return Number.isFinite(num) ? num : undefined;
  }
  const sizeWithUnit = line.match(/:\s*([\d,\.]+)\s*(TB|GB|MB|KB|B|字节|千兆字节|兆字节|千字节)\b/i);
  if (!sizeWithUnit?.[1] || !sizeWithUnit[2]) {
    return undefined;
  }
  const num = Number(sizeWithUnit[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) {
    return undefined;
  }
  const unit = sizeWithUnit[2];
  const u = unit.toLowerCase();
  let mult: number | undefined;
  if (u === "tb") mult = 1024 ** 4;
  else if (u === "gb" || unit.includes("千兆")) mult = 1024 ** 3;
  else if (u === "mb" || unit.includes("兆")) mult = 1024 ** 2;
  else if (u === "kb" || unit.includes("千")) mult = 1024;
  else if (u === "b" || unit === "字节") mult = 1;
  return mult ? Math.round(num * mult) : undefined;
}

function extractVssUsedShadowStorageLine(text: string): string | undefined {
  const patterns = [
    /Used Shadow Copy Storage space[^\r\n]*/i,
    /已用卷影复制存储空间[^\r\n]*/,
    /已使用的阴影复制存储空间[^\r\n]*/,
    /已用.*(?:卷影|阴影)复制.*存储空间[^\r\n]*/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[0];
    if (match) {
      return match;
    }
  }
  return undefined;
}

function parseRestorePointBytesFromVssText(text: string): number | undefined {
  const usedLine = extractVssUsedShadowStorageLine(text);
  if (usedLine) {
    const used = parseVssShadowStorageUsedBytes(usedLine);
    if (used !== undefined) {
      return used;
    }
  }
  const allocatedLine =
    text.match(/Allocated Shadow Copy Storage space[^\r\n]*/i)?.[0] ??
    text.match(/已分配的?卷影复制存储空间[^\r\n]*/)?.[0] ??
    text.match(/已分配.*(?:卷影|阴影)复制.*存储空间[^\r\n]*/)?.[0];
  return allocatedLine ? parseVssShadowStorageUsedBytes(allocatedLine) : undefined;
}

async function queryRestorePointBytesViaWmi(volume: string): Promise<number | undefined> {
  const letter = volume[0]?.toUpperCase();
  if (!letter) {
    return undefined;
  }
  const script = [
    `$d='${letter}:'`,
    "$r = Get-CimInstance Win32_ShadowStorage -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.Volume -like ('*' + $d[0] + ':*') } |",
    "  Select-Object -First 1",
    "if ($null -eq $r) { exit 1 }",
    "if ([uint64]$r.UsedSpace -gt 0) { Write-Output ([uint64]$r.UsedSpace); exit 0 }",
    "if ([uint64]$r.AllocatedSpace -gt 0) { Write-Output ([uint64]$r.AllocatedSpace); exit 0 }",
    "exit 1"
  ].join(" ");
  return new Promise((resolve) => {
    execFile(
      process.env.SystemRoot
        ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        : "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, encoding: "utf8", maxBuffer: MB },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const n = Number(String(stdout ?? "").trim());
        resolve(Number.isFinite(n) && n > 0 ? n : undefined);
      }
    );
  });
}

async function queryRestorePointBytesViaVssAdmin(volume: string): Promise<number | undefined> {
  const vssadmin = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "vssadmin.exe");
  const psCommand = `chcp 65001 > $null; & '${vssadmin.replace(/'/g, "''")}' list shadowstorage /for=${volume}`;
  return new Promise((resolve) => {
    execFile(
      process.env.SystemRoot
        ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
        : "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      { windowsHide: true, encoding: "utf8", maxBuffer: 8 * MB },
      (_error, stdout, stderr) => {
        const text = `${stdout ?? ""}\n${stderr ?? ""}`;
        resolve(parseRestorePointBytesFromVssText(text));
      }
    );
  });
}

export async function getRestorePointUsageBytes(rootPath: string): Promise<number | undefined> {
  if (process.platform !== "win32") {
    return undefined;
  }
  const volume = getVolumeSpecFromRoot(rootPath);
  if (!volume) {
    return undefined;
  }
  const cached = restorePointCache.get(volume);
  if (cached && Date.now() - cached.at < RESTORE_POINT_CACHE_TTL_MS) {
    return cached.value;
  }
  const value =
    (await queryRestorePointBytesViaVssAdmin(volume)) ?? (await queryRestorePointBytesViaWmi(volume));
  restorePointCache.set(volume, { at: Date.now(), value });
  return value;
}
