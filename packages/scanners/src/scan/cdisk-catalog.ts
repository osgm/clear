import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CDiskCategoryStat, JunkFile, ScanOptions } from "../../../shared/src/types";
import { normalizeWinPath } from "../path-safety";
import { DAY_MS, MB } from "../internal/constants";
import { isPathOnDrive, isSystemDriveRoot } from "../internal/fs-helpers";
import {
  CDiskCatalogEntry,
  CDiskMatchStrategy,
  CDiskRuleConfig,
  CDISK_TEMP_EXT,
  DEFAULT_CDISK_RULE_CONFIG
} from "./cdisk-types";

export function matchCDiskStrategy(
  fullPath: string,
  _scanRootNorm: string,
  strategy: CDiskMatchStrategy,
  stat: { size: number; mtimeMs: number },
  options: ScanOptions
): { match: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const ext = path.extname(fullPath).toLowerCase();
  const base = path.basename(fullPath).toLowerCase();
  const oldThreshold = Date.now() - options.oldFileDays * DAY_MS;
  const bigBytes = options.minBigFileSizeMB * MB;

  if (strategy === "all_files") {
    reasons.push("该分类目录内可清理文件");
    return { match: true, reasons };
  }
  if (strategy === "prefetch_only") {
    if (ext === ".pf") {
      reasons.push("预读取缓存(.pf)");
      return { match: true, reasons };
    }
    return { match: false, reasons };
  }
  if (strategy === "panther_leftover") {
    if ([".log", ".xml", ".tmp"].includes(ext) || base === "setuperr.log" || base === "setupact.log") {
      reasons.push("安装/升级过程残留日志");
      return { match: true, reasons };
    }
    return { match: false, reasons };
  }
  if (strategy === "dotnet_setup_cache") {
    if (CDISK_TEMP_EXT.has(ext) || ext === ".msi" || ext === ".cab") {
      reasons.push(".NET 安装/更新缓存相关");
      return { match: true, reasons };
    }
    return { match: false, reasons };
  }
  if (strategy === "hiberfil_pagefile_dump") {
    const dumpNames = new Set(["hiberfil.sys", "pagefile.sys", "memory.dmp"]);
    if (!dumpNames.has(base)) {
      return { match: false, reasons };
    }
    reasons.push("系统休眠/分页/完整内存转储（删除可能需要管理员权限）");
    return { match: true, reasons };
  }
  if (strategy === "downloads_redundant") {
    if (CDISK_TEMP_EXT.has(ext)) {
      reasons.push(`下载目录临时/未完成: ${ext || "无扩展名"}`);
    }
    if (stat.size >= bigBytes && stat.mtimeMs <= oldThreshold) {
      reasons.push(`大文件且长期未修改: ${(stat.size / MB).toFixed(2)} MB`);
    }
    return { match: reasons.length > 0, reasons };
  }
  // temp_like
  const normPath = normalizeWinPath(fullPath);
  const inTempDir = /\\temp(\\|$)/i.test(normPath);
  if (CDISK_TEMP_EXT.has(ext)) {
    reasons.push(`临时/日志类: ${ext || "无扩展名"}`);
  } else if (inTempDir) {
    reasons.push("临时目录内文件");
  }
  if (stat.size >= bigBytes) {
    reasons.push(`大文件: ${(stat.size / MB).toFixed(2)} MB`);
  }
  if (stat.mtimeMs <= oldThreshold) {
    reasons.push(`长期未修改: ${options.oldFileDays}+ 天`);
  }
  return { match: reasons.length > 0, reasons };
}

async function tryPushDirEntries(
  category: string,
  dirPath: string,
  into: CDiskCatalogEntry[],
  options?: { riskLevel?: "safe" | "cautious" | "risky"; strategy?: CDiskMatchStrategy }
): Promise<void> {
  try {
    const st = await fs.stat(dirPath);
    if (st.isDirectory()) {
      into.push({
        category,
        root: dirPath,
        strategy: options?.strategy ?? "all_files",
        riskLevel: options?.riskLevel ?? "safe"
      });
    }
  } catch {
    /* skip */
  }
}

async function expandWeChatAccountDirs(
  accountRoot: string,
  categoryPrefix: string,
  wxBaseForBackup: string,
  into: CDiskCatalogEntry[]
): Promise<void> {
  const fsRoot = path.join(accountRoot, "FileStorage");
  const hasFileStorage = existsSync(fsRoot);

  await tryPushDirEntries(`${categoryPrefix} · 日志文件`, path.join(accountRoot, "Log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries(`${categoryPrefix} · 日志文件`, path.join(accountRoot, "log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries(`${categoryPrefix} · 日志文件`, path.join(accountRoot, "Applet"), into, {
    riskLevel: "cautious",
    strategy: "temp_like"
  });

  if (hasFileStorage) {
    await tryPushDirEntries(`${categoryPrefix} · 缓存文件`, path.join(fsRoot, "Cache"), into, { riskLevel: "safe" });
    await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(fsRoot, "Image"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(fsRoot, "Image2"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 聊天视频`, path.join(fsRoot, "Video"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 接收的文件`, path.join(fsRoot, "File"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 接收的文件`, path.join(fsRoot, "CustomEmotion"), into, {
      riskLevel: "cautious"
    });
  } else {
    const msgRoot = path.join(accountRoot, "msg");
    await tryPushDirEntries(`${categoryPrefix} · 缓存文件`, path.join(accountRoot, "cache"), into, { riskLevel: "safe" });
    await tryPushDirEntries(`${categoryPrefix} · 缓存文件`, path.join(accountRoot, "Cache"), into, { riskLevel: "safe" });
    await tryPushDirEntries(`${categoryPrefix} · 临时文件`, path.join(accountRoot, "temp"), into, {
      riskLevel: "safe",
      strategy: "temp_like"
    });
    await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(msgRoot, "image"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(msgRoot, "attach"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 聊天视频`, path.join(msgRoot, "video"), into, { riskLevel: "cautious" });
    await tryPushDirEntries(`${categoryPrefix} · 接收的文件`, path.join(msgRoot, "file"), into, { riskLevel: "cautious" });
  }

  await tryPushDirEntries(`${categoryPrefix} · 微信备份`, path.join(accountRoot, "Backup"), into, {
    riskLevel: "risky"
  });
  await tryPushDirEntries(`${categoryPrefix} · 微信备份`, path.join(wxBaseForBackup, "Backup"), into, { riskLevel: "risky" });
}

async function expandWeChatBase(wxBase: string, categoryPrefix: string, into: CDiskCatalogEntry[]): Promise<void> {
  try {
    const subs = await fs.readdir(wxBase, { withFileTypes: true });
    for (const d of subs) {
      if (!d.isDirectory()) continue;
      const id = d.name;
      if (id === "All Users" || id === "Applet" || id === "Backup") continue;
      await expandWeChatAccountDirs(path.join(wxBase, id), categoryPrefix, wxBase, into);
    }
  } catch {
    /* no WeChat at this path */
  }
}

async function expandQQAccountDir(q: string, categoryPrefix: string, into: CDiskCatalogEntry[]): Promise<void> {
  await tryPushDirEntries(`${categoryPrefix} · 日志文件`, path.join(q, "log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries(`${categoryPrefix} · 日志文件`, path.join(q, "Log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries(`${categoryPrefix} · 缓存文件`, path.join(q, "Cache"), into, { riskLevel: "safe" });
  await tryPushDirEntries(`${categoryPrefix} · 缓存文件`, path.join(q, "cache"), into, { riskLevel: "safe" });
  await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(q, "Image"), into, { riskLevel: "cautious" });
  await tryPushDirEntries(`${categoryPrefix} · 聊天图片`, path.join(q, "Pic"), into, { riskLevel: "cautious" });
  await tryPushDirEntries(`${categoryPrefix} · 聊天视频`, path.join(q, "Video"), into, { riskLevel: "cautious" });
  await tryPushDirEntries(`${categoryPrefix} · 聊天语音`, path.join(q, "Audio"), into, { riskLevel: "cautious" });
  await tryPushDirEntries(`${categoryPrefix} · 接收的文件`, path.join(q, "FileRecv"), into, { riskLevel: "cautious" });
  await tryPushDirEntries(`${categoryPrefix} · 接收的文件`, path.join(q, "File"), into, { riskLevel: "cautious" });
}

async function expandQQTencentFiles(qqBase: string, categoryPrefix: string, into: CDiskCatalogEntry[]): Promise<void> {
  try {
    const subs = await fs.readdir(qqBase, { withFileTypes: true });
    for (const d of subs) {
      if (!d.isDirectory()) continue;
      if (d.name === "nt_qq") continue;
      await expandQQAccountDir(path.join(qqBase, d.name), categoryPrefix, into);
    }
  } catch {
    /* no QQ */
  }
}

async function expandWeChatQQCatalog(home: string, into: CDiskCatalogEntry[]): Promise<void> {
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const documents = path.join(home, "Documents");

  await expandWeChatBase(path.join(documents, "WeChat Files"), "微信专清", into);
  await expandWeChatBase(path.join(documents, "xwechat_files"), "微信4.0专清", into);

  await expandQQTencentFiles(path.join(documents, "Tencent Files"), "QQ/TIM专清", into);

  const ntQqRoot = path.join(documents, "Tencent Files", "nt_qq");
  try {
    const subs = await fs.readdir(ntQqRoot, { withFileTypes: true });
    for (const d of subs) {
      if (!d.isDirectory()) continue;
      await expandQQAccountDir(path.join(ntQqRoot, d.name), "QQ NT专清", into);
    }
  } catch {
    /* no QQ NT */
  }

  await tryPushDirEntries("QQ NT专清 · 缓存文件", path.join(localAppData, "Tencent", "QQNT", "Cache"), into, {
    riskLevel: "safe"
  });
  await tryPushDirEntries("QQ NT专清 · 日志文件", path.join(localAppData, "Tencent", "QQNT", "log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries("QQ NT专清 · 日志文件", path.join(localAppData, "Tencent", "QQNT", "Log"), into, {
    riskLevel: "safe",
    strategy: "temp_like"
  });
  await tryPushDirEntries("QQ NT专清 · 缓存文件", path.join(localAppData, "Tencent", "QQNT", "Temp"), into, {
    riskLevel: "safe"
  });
}

async function expandFirefoxProfileCaches(localAppData: string, into: CDiskCatalogEntry[]): Promise<void> {
  const profilesRoot = path.join(localAppData, "Mozilla", "Firefox", "Profiles");
  try {
    const subs = await fs.readdir(profilesRoot, { withFileTypes: true });
    for (const d of subs) {
      if (!d.isDirectory() || !d.name.includes(".")) continue;
      const prof = path.join(profilesRoot, d.name);
      /** cache2 / startupCache：与 BleachBit mozilla_firefox 等开源规则一致，仅缓存树 */
      await tryPushDirEntries(`常用软件 · Firefox`, path.join(prof, "cache2"), into, { riskLevel: "safe" });
      await tryPushDirEntries(`常用软件 · Firefox`, path.join(prof, "startupCache"), into, { riskLevel: "safe" });
    }
  } catch {
    /* no Firefox */
  }
}

/** Chromium 系：仅 User Data 下配置目录 + 共享 GPU 着色器缓存（不扫 Cookies/Preferences） */
const CHROMIUM_PROFILE_DIR = /^(Default|Guest Profile|System Profile|Profile \d+)$/i;

async function expandChromiumUserDataCaches(
  localAppData: string,
  vendorToUserData: string[],
  category: string,
  into: CDiskCatalogEntry[],
  riskLevel: "safe" | "cautious" | "risky" = "safe"
): Promise<void> {
  const userDataRoot = path.join(localAppData, ...vendorToUserData);
  let subs;
  try {
    subs = await fs.readdir(userDataRoot, { withFileTypes: true });
  } catch {
    return;
  }
  const sharedCaches = ["GrShaderCache", "ShaderCache", "GraphiteDawnCache", "component_crx_cache", "extensions_crx_cache"];
  for (const name of sharedCaches) {
    await tryPushDirEntries(category, path.join(userDataRoot, name), into, { riskLevel });
  }
  for (const d of subs) {
    if (!d.isDirectory() || !CHROMIUM_PROFILE_DIR.test(d.name)) continue;
    const profile = path.join(userDataRoot, d.name);
    await tryPushDirEntries(category, path.join(profile, "Cache"), into, { riskLevel });
    await tryPushDirEntries(category, path.join(profile, "Code Cache"), into, { riskLevel });
    await tryPushDirEntries(category, path.join(profile, "GPUCache"), into, { riskLevel });
    await tryPushDirEntries(category, path.join(profile, "Service Worker", "CacheStorage"), into, { riskLevel });
    await tryPushDirEntries(category, path.join(profile, "Service Worker", "ScriptCache"), into, { riskLevel });
  }
}

/** Windows Store UWP：每包 AC/INetCache、AC/Temp（常见可再生的网络与临时缓存） */
async function expandWindowsStoreCaches(localAppData: string, into: CDiskCatalogEntry[]): Promise<void> {
  const packagesRoot = path.join(localAppData, "Packages");
  try {
    const pkgs = await fs.readdir(packagesRoot, { withFileTypes: true });
    for (const p of pkgs) {
      if (!p.isDirectory()) continue;
      const base = path.join(packagesRoot, p.name, "AC");
      await tryPushDirEntries(`Microsoft Store · 应用缓存`, path.join(base, "INetCache"), into, { riskLevel: "safe" });
      await tryPushDirEntries(`Microsoft Store · 应用缓存`, path.join(base, "Temp"), into, { riskLevel: "safe" });
    }
  } catch {
    /* no Packages */
  }
}

/** VS Code / Cursor 等 Electron IDE：仅 Roaming 下缓存目录（不动用户设置 workspaceStorage） */
async function expandElectronIdeCaches(roaming: string, into: CDiskCatalogEntry[]): Promise<void> {
  const roots: { category: string; segments: string[] }[] = [
    { category: "常用软件 · VS Code", segments: ["Code", "Cache"] },
    { category: "常用软件 · VS Code", segments: ["Code", "CachedData"] },
    { category: "常用软件 · VS Code", segments: ["Code", "GPUCache"] },
    { category: "常用软件 · VS Code", segments: ["Code", "Code Cache"] },
    { category: "常用软件 · VS Code Insiders", segments: ["Code - Insiders", "Cache"] },
    { category: "常用软件 · VS Code Insiders", segments: ["Code - Insiders", "CachedData"] },
    { category: "常用软件 · VS Code Insiders", segments: ["Code - Insiders", "GPUCache"] },
    { category: "常用软件 · VS Code Insiders", segments: ["Code - Insiders", "Code Cache"] },
    { category: "常用软件 · Cursor", segments: ["Cursor", "Cache"] },
    { category: "常用软件 · Cursor", segments: ["Cursor", "CachedData"] },
    { category: "常用软件 · Cursor", segments: ["Cursor", "GPUCache"] },
    { category: "常用软件 · Cursor", segments: ["Cursor", "Code Cache"] }
  ];
  for (const { category, segments } of roots) {
    await tryPushDirEntries(category, path.join(roaming, ...segments), into, { riskLevel: "safe" });
  }
}

function resolveRuleTemplatePath(template: string, vars: Record<string, string>): string {
  const resolved = template.replace(/\{([A-Z_]+)\}/g, (_match, key: string) => vars[key] ?? "");
  return path.resolve(resolved);
}

function resolveCDiskRulesPath(): string {
  const candidates = [
    path.join(__dirname, "config", "cdisk-rules.json"),
    path.resolve(process.cwd(), "packages", "scanners", "src", "config", "cdisk-rules.json")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

export async function loadCDiskRuleConfig(): Promise<CDiskRuleConfig> {
  const candidate = resolveCDiskRulesPath();
  try {
    const raw = await fs.readFile(candidate, "utf8");
    const parsed = JSON.parse(raw) as CDiskRuleConfig;
    if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.chromiumUserData)) {
      return DEFAULT_CDISK_RULE_CONFIG;
    }
    if (parsed.entries.length === 0) {
      return {
        entries: DEFAULT_CDISK_RULE_CONFIG.entries,
        chromiumUserData: parsed.chromiumUserData.length
          ? parsed.chromiumUserData
          : DEFAULT_CDISK_RULE_CONFIG.chromiumUserData
      };
    }
    return parsed;
  } catch {
    return DEFAULT_CDISK_RULE_CONFIG;
  }
}

export async function buildCDiskScanCatalog(selectedPath: string): Promise<CDiskCatalogEntry[]> {
  const resolved = path.resolve(selectedPath);
  const driveRoot = path.parse(resolved).root;
  const windir = process.env.WINDIR ?? path.join(driveRoot, "Windows");
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const roaming = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
  const programData = process.env.ProgramData ?? path.join(driveRoot, "ProgramData");
  const temp = process.env.TEMP ?? path.join(localAppData, "Temp");

  const vars = {
    DRIVE_ROOT: driveRoot,
    WINDIR: windir,
    LOCALAPPDATA: localAppData,
    APPDATA: roaming,
    PROGRAMDATA: programData,
    HOME: home,
    TEMP: temp
  };
  const config = await loadCDiskRuleConfig();
  const list: CDiskCatalogEntry[] = [];

  for (const entry of config.entries) {
    const root = resolveRuleTemplatePath(entry.rootTemplate, vars);
    const recycleBinRoot = entry.recycleBinRoot ? resolveRuleTemplatePath(entry.recycleBinRoot, vars) : undefined;
    list.push({
      category: entry.category,
      root,
      strategy: entry.strategy,
      riskLevel: entry.riskLevel ?? "safe",
      recycleBinRoot
    });
  }

  if (isSystemDriveRoot(driveRoot)) {
    for (const browser of config.chromiumUserData) {
      await expandChromiumUserDataCaches(
        localAppData,
        browser.pathSegments,
        browser.category,
        list,
        browser.riskLevel ?? "safe"
      );
    }
    await expandWindowsStoreCaches(localAppData, list);
    await expandElectronIdeCaches(roaming, list);
    await expandFirefoxProfileCaches(localAppData, list);
    await expandWeChatQQCatalog(home, list);
  }

  const seen = new Set<string>();
  return list.filter((e) => {
    if (!isPathOnDrive(e.root, driveRoot)) {
      return false;
    }
    const k = `${e.category}|${normalizeWinPath(e.root)}|${e.strategy}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function buildCategoryStatsFromJunks(junks: JunkFile[]): CDiskCategoryStat[] {
  const map = new Map<string, { cleanableBytes: number; cleanableCount: number }>();
  const seenPaths = new Set<string>();
  for (const item of junks) {
    const pathKey = normalizeWinPath(item.path);
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    const category = item.category || "其它可清理";
    const cur = map.get(category) ?? { cleanableBytes: 0, cleanableCount: 0 };
    cur.cleanableBytes += item.size;
    cur.cleanableCount += 1;
    map.set(category, cur);
  }
  return Array.from(map.entries()).map(([category, s]) => ({
    category,
    totalBytes: s.cleanableBytes,
    cleanableBytes: s.cleanableBytes,
    fileCount: s.cleanableCount,
    cleanableCount: s.cleanableCount
  }));
}