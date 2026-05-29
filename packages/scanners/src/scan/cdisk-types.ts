export const CDISK_TEMP_EXT = new Set([
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
  ".etl",
  ".txt"
]);

export type CDiskMatchStrategy =
  | "all_files"
  | "temp_like"
  | "prefetch_only"
  | "panther_leftover"
  | "dotnet_setup_cache"
  | "downloads_redundant"
  | "hiberfil_pagefile_dump";

export interface CDiskCatalogEntry {
  category: string;
  root: string;
  strategy: CDiskMatchStrategy;
  riskLevel: "safe" | "cautious" | "risky";
  recycleBinRoot?: string;
}

export interface CDiskJsonRuleEntry {
  category: string;
  rootTemplate: string;
  strategy: CDiskMatchStrategy;
  riskLevel?: "safe" | "cautious" | "risky";
  recycleBinRoot?: string;
}

export interface CDiskJsonChromium {
  category: string;
  pathSegments: string[];
  riskLevel?: "safe" | "cautious" | "risky";
}

export interface CDiskRuleConfig {
  entries: CDiskJsonRuleEntry[];
  chromiumUserData: CDiskJsonChromium[];
}

export const DEFAULT_CDISK_RULE_CONFIG: CDiskRuleConfig = {
  entries: [],
  chromiumUserData: [
    { category: "常用软件 · Chrome", pathSegments: ["Google", "Chrome", "User Data"], riskLevel: "safe" },
    { category: "常用软件 · Edge", pathSegments: ["Microsoft", "Edge", "User Data"], riskLevel: "safe" }
  ]
};
