import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CleanupMode, CleanupResult, PrivacyCategory } from "../../../shared/src/types";
import { normalizeWinPath } from "../path-safety";
import { CLEANUP_RECYCLE_CONCURRENCY, CLEANUP_SHRED_CONCURRENCY, SCAN_IO_CONCURRENCY } from "../internal/constants";
import { CleanupRuntimeHooks, forEachWithConcurrency } from "../internal/scan-hooks";
import { moveToRecycleBin } from "../platform/recycle";
import { shredPath, withDeleteTimeout } from "./shred";

async function getPathStats(
  targetPath: string,
  seenPaths: Set<string> = new Set()
): Promise<{ fileCount: number; sizeBytes: number }> {
  let fileCount = 0;
  let sizeBytes = 0;

  async function walk(currentPath: string): Promise<void> {
    const pathKey = normalizeWinPath(currentPath);
    if (seenPaths.has(pathKey)) {
      return;
    }
    let stat;
    try {
      stat = await fs.stat(currentPath);
    } catch {
      return;
    }

    if (stat.isFile()) {
      seenPaths.add(pathKey);
      fileCount += 1;
      sizeBytes += stat.size;
      return;
    }

    if (!stat.isDirectory()) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    const paths = entries.map((entry) => path.join(currentPath, entry.name));
    await forEachWithConcurrency(paths, SCAN_IO_CONCURRENCY, async (p) => {
      await walk(p);
    });
  }

  await walk(targetPath);
  return { fileCount, sizeBytes };
}

async function aggregatePathStatsShallow(
  dirPath: string,
  seenPaths: Set<string>
): Promise<{ fileCount: number; sizeBytes: number }> {
  let fileCount = 0;
  let sizeBytes = 0;
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { fileCount, sizeBytes };
  }
  for (const dirent of entries) {
    if (!dirent.isFile()) continue;
    const fullPath = path.join(dirPath, dirent.name);
    const key = normalizeWinPath(fullPath);
    if (seenPaths.has(key)) continue;
    try {
      const stat = await fs.stat(fullPath);
      seenPaths.add(key);
      fileCount += 1;
      sizeBytes += stat.size;
    } catch {
      /* skip */
    }
  }
  return { fileCount, sizeBytes };
}

async function getFirefoxPrivacyCachePaths(localAppData: string): Promise<string[]> {
  const profilesRoot = path.join(localAppData, "Mozilla", "Firefox", "Profiles");
  const paths: string[] = [];
  try {
    const subs = await fs.readdir(profilesRoot, { withFileTypes: true });
    for (const d of subs) {
      if (!d.isDirectory() || !d.name.includes(".")) continue;
      const prof = path.join(profilesRoot, d.name);
      paths.push(path.join(prof, "cache2"), path.join(prof, "startupCache"));
    }
  } catch {
    /* no Firefox */
  }
  return paths;
}

type PrivacyDef = {
  id: string;
  name: string;
  group: "browser" | "system" | "software";
  paths: string[];
};

export async function scanPrivacyCategories(): Promise<PrivacyCategory[]> {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const roaming = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");

  const chromeDefault = path.join(local, "Google", "Chrome", "User Data", "Default");
  const edgeDefault = path.join(local, "Microsoft", "Edge", "User Data", "Default");
  const recent = path.join(roaming, "Microsoft", "Windows", "Recent");
  const autoJump = path.join(roaming, "Microsoft", "Windows", "Recent", "AutomaticDestinations");
  const customJump = path.join(roaming, "Microsoft", "Windows", "Recent", "CustomDestinations");
  const wordWheel = path.join(local, "Microsoft", "Windows", "Explorer", "WordWheelQuery");
  const clipboardDir = path.join(local, "Microsoft", "Windows", "Clipboard");

  const defs: PrivacyDef[] = [
    {
      id: "privacy-chrome",
      name: "Chrome",
      group: "browser",
      paths: [
        path.join(chromeDefault, "Cache"),
        path.join(chromeDefault, "Code Cache"),
        path.join(chromeDefault, "GPUCache"),
        path.join(chromeDefault, "History"),
        path.join(chromeDefault, "Login Data"),
        path.join(chromeDefault, "Web Data"),
        path.join(chromeDefault, "Cookies"),
        path.join(chromeDefault, "Network", "Cookies")
      ]
    },
    {
      id: "privacy-edge",
      name: "Edge",
      group: "browser",
      paths: [
        path.join(edgeDefault, "Cache"),
        path.join(edgeDefault, "Code Cache"),
        path.join(edgeDefault, "GPUCache"),
        path.join(edgeDefault, "History"),
        path.join(edgeDefault, "Web Data"),
        path.join(edgeDefault, "Cookies"),
        path.join(edgeDefault, "Network", "Cookies")
      ]
    },
    {
      id: "privacy-firefox",
      name: "Firefox",
      group: "browser",
      paths: []
    },
    {
      id: "recent-files",
      name: "最近使用的文件",
      group: "system",
      paths: [recent]
    },
    {
      id: "app-activity",
      name: "打开应用记录",
      group: "system",
      paths: [autoJump]
    },
    {
      id: "search-history",
      name: "搜索文件记录",
      group: "system",
      paths: [wordWheel]
    },
    {
      id: "typed-paths",
      name: "输入路径记录",
      group: "system",
      paths: []
    },
    {
      id: "run-command",
      name: "运行命令记录",
      group: "system",
      paths: []
    },
    {
      id: "registry-mru",
      name: "注册表记录位置",
      group: "system",
      paths: []
    },
    {
      id: "taskbar-jump",
      name: "任务栏跳转列表",
      group: "system",
      paths: [customJump]
    },
    {
      id: "clipboard",
      name: "系统剪贴板",
      group: "system",
      paths: [clipboardDir]
    },
    {
      id: "inet-cache",
      name: "Internet 临时文件",
      group: "browser",
      paths: [path.join(local, "Microsoft", "Windows", "INetCache")]
    },
    {
      id: "privacy-notepadpp",
      name: "Notepad++",
      group: "software",
      paths: [
        path.join(roaming, "Notepad++", "backup"),
        path.join(roaming, "Notepad++", "session.xml"),
        path.join(roaming, "Notepad++", "user.history")
      ]
    },
    {
      id: "privacy-msoffice",
      name: "MS Office",
      group: "software",
      paths: [
        path.join(roaming, "Microsoft", "Office", "Recent"),
        path.join(roaming, "Microsoft", "Office", "16.0", "OfficeFileCache"),
        path.join(local, "Microsoft", "Office", "16.0", "OfficeFileCache"),
        path.join(local, "Microsoft", "Office", "16.0", "Wef")
      ]
    }
  ];

  const firefoxCachePaths = await getFirefoxPrivacyCachePaths(local);
  const firefoxDef = defs.find((d) => d.id === "privacy-firefox");
  if (firefoxDef) {
    firefoxDef.paths = firefoxCachePaths;
  }

  const globalSeenPaths = new Set<string>();
  const result: PrivacyCategory[] = [];
  for (const def of defs) {
    let fileCount = 0;
    let sizeBytes = 0;
    const nonEmpty = def.paths.filter((p) => p.trim().length > 0);
    if (def.id === "recent-files" && nonEmpty.length > 0) {
      const shallow = await aggregatePathStatsShallow(nonEmpty[0], globalSeenPaths);
      fileCount = shallow.fileCount;
      sizeBytes = shallow.sizeBytes;
    } else if (nonEmpty.length > 0) {
      for (const p of nonEmpty) {
        try {
          await fs.access(p);
          const stat = await getPathStats(p, globalSeenPaths);
          fileCount += stat.fileCount;
          sizeBytes += stat.sizeBytes;
        } catch {
          /* skip */
        }
      }
    }
    const primary = nonEmpty[0] ?? "";
    result.push({
      id: def.id,
      name: def.name,
      path: primary,
      paths: nonEmpty,
      fileCount,
      sizeBytes,
      group: def.group
    });
  }
  return result;
}

export async function cleanupPrivacyCategories(
  categories: PrivacyCategory[],
  mode: CleanupMode = "recycle",
  hooks: CleanupRuntimeHooks = {}
): Promise<CleanupResult> {
  const failures: CleanupResult["failures"] = [];
  let deletedCount = 0;
  let freedBytes = 0;
  const concurrency = mode === "shred" ? CLEANUP_SHRED_CONCURRENCY : CLEANUP_RECYCLE_CONCURRENCY;

  await forEachWithConcurrency(categories, concurrency, async (item) => {
    if (hooks.isCancelled?.()) {
      throw new Error("CLEANUP_CANCELLED");
    }
    const targets = (item.paths?.length ? item.paths : item.path ? [item.path] : [])
      .map((p) => p.trim())
      .filter(Boolean);
    if (targets.length === 0) {
      return;
    }

    let pathSuccess = 0;
    let pathFreed = 0;
    for (const p of targets) {
      let sizeBefore = 0;
      try {
        const st = await fs.stat(p);
        sizeBefore = st.isFile() ? st.size : await getPathStats(p).then((s) => s.sizeBytes);
      } catch {
        sizeBefore = 0;
      }
      try {
        if (mode === "shred") {
          await withDeleteTimeout(shredPath(p), p);
        } else {
          await withDeleteTimeout(moveToRecycleBin(p), p);
        }
        pathSuccess += 1;
        pathFreed += sizeBefore;
      } catch (error) {
        if (error instanceof Error && error.message === "CLEANUP_CANCELLED") {
          throw error;
        }
        failures.push({
          path: p,
          error: error instanceof Error ? error.message : "未知错误"
        });
      }
    }
    if (pathSuccess > 0) {
      deletedCount += Math.max(pathSuccess, Math.min(item.fileCount, pathSuccess));
      freedBytes += pathFreed;
    }
  });

  return {
    deletedCount,
    failedCount: failures.length,
    freedBytes,
    failures
  };
}
