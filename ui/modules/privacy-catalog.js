/**
 * 隐私清理结果分区（与产品设计图一致）
 */

/** @typedef {{ id: string, title: string, subtitle: string, icon: string, columns: number, order: string[] }} PrivacySectionDef */

/** @type {PrivacySectionDef[]} */
export const PRIVACY_SECTIONS = [
  {
    id: "system",
    title: "系统隐私风险",
    subtitle: "（包括最近使用的文件、打开应用记录、系统剪切板等）",
    icon: "system",
    columns: 8,
    order: [
      "recent-files",
      "app-activity",
      "search-history",
      "typed-paths",
      "run-command",
      "registry-mru",
      "taskbar-jump",
      "clipboard"
    ]
  },
  {
    id: "software",
    title: "软件数据隐患",
    subtitle: "（包括最近使用记录、下载记录、上传记录等）",
    icon: "software",
    columns: 6,
    order: ["privacy-notepadpp", "privacy-msoffice"]
  }
];

/** 仍参与扫描但不展示在结果面板中的项 */
export const PRIVACY_HIDDEN_IDS = ["privacy-chrome", "privacy-edge", "privacy-firefox", "inet-cache"];
