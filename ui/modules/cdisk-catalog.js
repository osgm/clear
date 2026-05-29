/**
 * 磁盘清理结果分区与条目定义（与产品设计图一致）
 */

/** @typedef {{ key: string, label: string, match?: string[], matchPrefix?: string, matchPrefixes?: string[], virtual?: boolean, defaultRisk?: 'safe'|'cautious'|'risky' }} CatalogItemDef */

/** @typedef {{ id: string, title: string, subtitle: string, icon: string, columns: number, items: CatalogItemDef[] }} CatalogSectionDef */

/** @type {CatalogSectionDef[]} */
export const CDISK_SECTIONS = [
  {
    id: "windows",
    title: "Windows可清理内容",
    subtitle: "删除后不影响系统正常使用",
    icon: "windows",
    columns: 6,
    items: [
      { key: "restore-point", label: "系统还原点", virtual: true, defaultRisk: "cautious" },
      { key: "patch-backup", label: "升级补丁备份", match: ["升级补丁备份"] },
      { key: "update-cache", label: "系统更新缓存", match: ["系统更新缓存"] },
      { key: "installer-leftover", label: "安装包残留文件", match: ["安装包残留文件"] },
      { key: "old-windows", label: "旧版系统文件", match: ["旧版系统文件"] },
      { key: "hibernate", label: "系统休眠文件", match: ["系统休眠文件"], defaultRisk: "risky" },
      { key: "pagefile", label: "转移虚拟内存", match: ["转移虚拟内存"], defaultRisk: "risky" },
      { key: "memory-dump", label: "内存转储文件", match: ["内存转储文件"] },
      { key: "minidump", label: "小型转储文件", match: ["小型转储文件"] },
      { key: "temp-files", label: "临时文件", match: ["临时文件"] },
      { key: "log-files", label: "日志文件", match: ["日志文件"] },
      { key: "cache-files", label: "缓存文件", matchPrefix: "缓存文件" },
      { key: "other-files", label: "其它文件", match: ["其它文件"] },
      { key: "security-center", label: "系统安全中心", match: ["系统安全中心"] },
      { key: "diagnostic", label: "系统诊断数据", matchPrefix: "系统诊断数据" },
      { key: "dotnet", label: ".Net框架", matchPrefix: ".Net框架" },
      { key: "thumbnails", label: "缩略图缓存", match: ["缩略图缓存"] },
      { key: "recycle-bin", label: "回收站", match: ["回收站"] },
      { key: "other-unmapped", label: "其它可清理项", matchPrefix: "其它可清理" }
    ]
  },
  {
    id: "apps",
    title: "常用软件",
    subtitle: "软件使用过程中产生的临时文件，可以删除以节省空间",
    icon: "apps",
    columns: 7,
    items: [
      { key: "chrome", label: "Chrome", matchPrefix: "常用软件 · Chrome" },
      { key: "edge", label: "Edge浏览器", matchPrefix: "常用软件 · Edge" },
      { key: "firefox", label: "Firefox", matchPrefix: "常用软件 · Firefox" },
      { key: "ie", label: "IE", matchPrefix: "常用软件 · IE" },
      { key: "itunes", label: "iTunes", matchPrefix: "常用软件 · iTunes" },
      { key: "sogou", label: "搜狗输入法", matchPrefix: "常用软件 · 搜狗输入法" },
      { key: "wemeet", label: "腾讯会议", matchPrefix: "常用软件 · 腾讯会议" }
    ]
  },
  {
    id: "wechat",
    title: "微信电脑版专清",
    subtitle: "过期的聊天视频图片可删除",
    icon: "wechat",
    columns: 6,
    items: [
      { key: "wx-log", label: "日志文件", matchPrefix: "微信专清 · 日志文件" },
      { key: "wx-cache", label: "缓存文件", matchPrefix: "微信专清 · 缓存文件" },
      { key: "wx-image", label: "聊天图片", matchPrefix: "微信专清 · 聊天图片", defaultRisk: "cautious" },
      { key: "wx-video", label: "聊天视频", matchPrefix: "微信专清 · 聊天视频", defaultRisk: "cautious" },
      { key: "wx-file", label: "接收的文件", matchPrefix: "微信专清 · 接收的文件", defaultRisk: "cautious" },
      { key: "wx-backup", label: "微信备份", matchPrefix: "微信专清 · 微信备份", defaultRisk: "risky" }
    ]
  },
  {
    id: "qq",
    title: "QQ/TIM电脑版专清",
    subtitle: "过期的聊天视频图片可删除",
    icon: "qq",
    columns: 6,
    items: [
      { key: "qq-log", label: "日志文件", matchPrefix: "QQ/TIM专清 · 日志文件" },
      { key: "qq-cache", label: "缓存文件", matchPrefix: "QQ/TIM专清 · 缓存文件" },
      { key: "qq-image", label: "聊天图片", matchPrefix: "QQ/TIM专清 · 聊天图片", defaultRisk: "cautious" },
      { key: "qq-video", label: "聊天视频", matchPrefix: "QQ/TIM专清 · 聊天视频", defaultRisk: "cautious" },
      { key: "qq-audio", label: "聊天语音", matchPrefix: "QQ/TIM专清 · 聊天语音", defaultRisk: "cautious" },
      { key: "qq-file", label: "接收的文件", matchPrefix: "QQ/TIM专清 · 接收的文件", defaultRisk: "cautious" }
    ]
  }
];

/**
 * @param {string} category
 * @param {CatalogItemDef} def
 */
function categoryMatchesDef(category, def) {
  if (!category) return false;
  if (def.match?.includes(category)) return true;
  if (def.matchPrefix && category.startsWith(def.matchPrefix)) return true;
  if (def.matchPrefixes?.some((p) => category.startsWith(p))) return true;
  return false;
}

/**
 * @param {string} category
 * @returns {string | null}
 */
export function resolveCategoryKey(category) {
  if (!category) return null;
  for (const section of CDISK_SECTIONS) {
    for (const item of section.items) {
      if (item.virtual) continue;
      if (categoryMatchesDef(category, item)) return item.key;
    }
  }
  if (category === "其它可清理") return "other-unmapped";
  return "other-unmapped";
}

/**
 * @param {number} bytes
 */
export function formatSizeLabel(bytes) {
  if (!bytes || bytes <= 0) return "0KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb * 10) / 10}MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb * 10) / 10}GB`;
}

/**
 * @param {import('./cdisk-catalog.js').CatalogItemDef[]} items
 * @param {Array<{ path: string, size: number, category?: string, riskLevel?: string }>} junks
 * @param {number | undefined} restorePointBytes
 */
/**
 * @param {Array<{ category: string, totalBytes?: number, cleanableBytes?: number }> | undefined} categoryStats
 */
export function buildCategoryAggregates(items, junks, restorePointBytes, categoryStats) {
  /** @type {Map<string, { sizeBytes: number, paths: string[], junks: typeof junks, maxRisk: string }>} */
  const map = new Map();
  for (const def of items) {
    map.set(def.key, { sizeBytes: 0, paths: [], junks: [], maxRisk: def.defaultRisk || "safe" });
  }

  const seenPaths = new Set();

  for (const junk of junks) {
    const key = resolveCategoryKey(junk.category || "");
    if (!key || !map.has(key)) continue;
    const agg = map.get(key);
    const pathKey = junk.path;
    if (!seenPaths.has(pathKey)) {
      seenPaths.add(pathKey);
      agg.sizeBytes += junk.size || 0;
    }
    agg.paths.push(junk.path);
    agg.junks.push(junk);
    const risk = junk.riskLevel || "safe";
    if (risk === "risky" || (risk === "cautious" && agg.maxRisk !== "risky")) {
      agg.maxRisk = risk;
    } else if (risk === "cautious" && agg.maxRisk === "safe") {
      agg.maxRisk = "cautious";
    }
  }

  const restore = map.get("restore-point");
  if (restore && typeof restorePointBytes === "number" && restorePointBytes > 0) {
    restore.sizeBytes = restorePointBytes;
    restore.maxRisk = "cautious";
  }

  return map;
}
