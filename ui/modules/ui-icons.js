/**
 * 小清新统一线性图标（24×24 viewBox，currentColor）
 */
const S =
  'xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"';

/** @param {string} inner */
function svg24(inner) {
  return `<svg ${S} viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

/** @param {string} inner */
function svg24Brand(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

const PRIVACY_ICONS = {
  // 参考真实品牌图标做简化：保留识别特征，不引入外部资源文件
  chrome: svg24Brand(
    '<circle cx="12" cy="12" r="10" fill="#DB4437"/><path d="M12 12L21 12A9 9 0 0 1 7.5 19.8Z" fill="#0F9D58"/><path d="M12 12L7.5 19.8A9 9 0 0 1 3 12Z" fill="#F4B400"/><circle cx="12" cy="12" r="4.3" fill="#4285F4"/><circle cx="12" cy="12" r="2.1" fill="#BBD7FF"/>'
  ),
  edge: svg24Brand(
    '<path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-2.3-1-4.5-2.8-6-1.4-1.2-3.2-2-6-2.8z" fill="#0FA5E9"/><path d="M19.8 13.2c-.4 3.8-3.3 6.8-7.8 6.8-3.7 0-6.5-2.1-7.7-5 1.4 1.2 3.5 1.9 5.9 1.9 4.2 0 6.6-1.8 9.6-3.7z" fill="#10B981"/><circle cx="12.2" cy="12.1" r="3.4" fill="#E6F8FF"/>'
  ),
  firefox: svg24Brand(
    '<circle cx="12" cy="12" r="9.6" fill="#5B2CC9"/><path d="M19.2 12.8c0 3.9-3.2 6.7-7.3 6.7-3.8 0-6.9-2.8-6.9-6.4 0-2.7 1.4-5.1 3.7-6.5-.2 1.1.2 2.3 1.2 3.1 1.3-1.5 2.9-2.6 5-3.3-.5 1.1-.3 2.1.5 2.8 1.4-.3 2.7.1 3.7 1-.8.7-1.2 1.6-1 2.6.3 0 .7 0 1.1 0z" fill="#FF7A00"/><circle cx="12.2" cy="13.1" r="2.8" fill="#FFD39A"/>'
  ),
  recent: svg24('<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'),
  app: svg24('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  search: svg24('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  typed: svg24(
    '<path d="M5 7h14M5 11h14M5 15h10"/><rect x="6" y="17" width="12" height="3" rx="1" stroke-width="1.5"/>'
  ),
  run: svg24('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9l4 3-4 3V9z"/><path d="M14 16h4"/>'),
  registry: svg24('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 13v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>'),
  jump: svg24('<path d="M5 19V5"/><path d="M5 5l6 6"/><path d="M19 19L8 8"/>'),
  clipboard: svg24(
    '<path d="M9 4h6l1 2h4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6h4l1-2z"/><path d="M9 11h6M9 15h4"/>'
  ),
  ie: svg24Brand(
    '<ellipse cx="12" cy="12.1" rx="6.1" ry="6.5" fill="#2B7CD3"/><path d="M3.8 11.8c1.1-3.9 4.5-6.3 8.6-6.3 2.7 0 5.1.9 7 2.9l-1.5 1.2c-1.3-1.4-3.2-2.2-5.5-2.2-3 0-5.7 1.7-6.7 4.7h8.5v1.9H5.6c.7 2.8 3.2 4.6 6.4 4.6 2.1 0 4-.7 5.4-2.1l1.4 1.3c-1.9 1.8-4.2 2.8-6.9 2.8-4.4 0-7.9-2.7-8.7-6.8l.6-2.9z" fill="#7CC6FF"/>'
  ),
  generic: svg24('<path d="M4 20V8l4-3h8l4 3v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 5V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  notepadpp: svg24Brand(
    '<rect x="4" y="5" width="16" height="14" rx="2" fill="#8BC34A"/><path d="M7 9h10M7 12h8M7 15h6" stroke="#fff" stroke-width="1.4"/>'
  ),
  msoffice: svg24Brand(
    '<rect x="4" y="5" width="7" height="14" rx="1" fill="#D24726"/><rect x="13" y="5" width="7" height="14" rx="1" fill="#217346"/><path d="M7.5 9h3M16.5 9h3" stroke="#fff" stroke-width="1.2"/>'
  )
};

const PRIVACY_SECTION_ICONS = {
  system: svg24(
    '<path d="M12 2.8L5.2 6v6c0 4.7 3.6 8.9 6.8 10.2 3.2-1.3 6.8-5.5 6.8-10.2V6L12 2.8z"/><path d="M9.4 12.1l1.8 1.9 3.7-4.3"/>'
  ),
  software: svg24('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
};

/**
 * @param {"system"|"software"} kind
 */
export function getPrivacySectionIconSvg(kind) {
  return PRIVACY_SECTION_ICONS[kind] || PRIVACY_SECTION_ICONS.system;
}

/**
 * @param {"chrome"|"edge"|"firefox"|"recent"|"app"|"search"|"typed"|"run"|"registry"|"jump"|"clipboard"|"ie"|"generic"} kind
 */
export function getPrivacyIconSvg(kind) {
  return PRIVACY_ICONS[kind] || PRIVACY_ICONS.generic;
}

/**
 * 应用主图标（与桌面图标语义统一：清理+守护）
 * 用于侧栏品牌位，菜单图标在此基础上做轻量变体。
 */
export const appBrandSvg = svg24(
  '<path d="M12 2.8L5.2 6v6c0 4.7 3.6 8.9 6.8 10.2 3.2-1.3 6.8-5.5 6.8-10.2V6L12 2.8z"/><path d="M8.4 13.2c1.6-2.6 3.5-4.3 7.2-5.1"/><path d="M10.1 14.9c1.2 1.3 2.8 2.1 4.8 2.2"/>'
);

/** 磁盘清理 — 主图标风格下的磁盘变体 */
export const heroDiskSvg = svg24(
  '<path d="M12 2.8L5.2 6v6c0 4.7 3.6 8.9 6.8 10.2 3.2-1.3 6.8-5.5 6.8-10.2V6L12 2.8z"/><path d="M8.7 9.6h6.6"/><path d="M8.7 12.4h5.2"/><path d="M10.2 15.2h3"/>'
);

/** 磁盘分析 — 主图标风格下的分析变体 */
export const heroAnalyzeSvg = svg24(
  '<path d="M12 2.8L5.2 6v6c0 4.7 3.6 8.9 6.8 10.2 3.2-1.3 6.8-5.5 6.8-10.2V6L12 2.8z"/><path d="M8.6 15.1v-2.6"/><path d="M12 15.1v-4.6"/><path d="M15.4 15.1v-1.4"/>'
);

/** 隐私盾牌 — 与页头大幅图形同系，小尺寸装饰 */
export const heroPrivacyBadgeSvg = svg24(
  '<path d="M12 2.8L5.2 6v6c0 4.7 3.6 8.9 6.8 10.2 3.2-1.3 6.8-5.5 6.8-10.2V6L12 2.8z"/><path d="M9.4 12.1l1.8 1.9 3.7-4.3"/>'
);

const CDISK_TILE_ICONS = {
  windows: svg24Brand(
    '<rect x="3" y="5" width="18" height="14" rx="2" fill="#5CB8E8"/><path d="M3 9h18" stroke="#fff" stroke-width="1.2"/><rect x="6" y="12" width="5" height="4" rx=".8" fill="#fff" opacity=".9"/>'
  ),
  apps: svg24('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="16" r="3"/>'),
  wechat: svg24Brand(
    '<circle cx="9.5" cy="11" r="5.5" fill="#09BB07"/><circle cx="15.5" cy="13" r="5" fill="#07C160"/><path d="M7.5 10.5h.01M11 10.5h.01M14 12.5h.01M17.5 12.5h.01" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'
  ),
  qq: svg24Brand(
    '<ellipse cx="12" cy="13" rx="8" ry="7" fill="#12B7F5"/><circle cx="9.5" cy="11.5" r="1.2" fill="#fff"/><circle cx="14.5" cy="11.5" r="1.2" fill="#fff"/><path d="M9 16.5c1.2 1.2 2.8 1.8 4.5 1.5" stroke="#fff" stroke-width="1.2" fill="none"/>'
  ),
  "restore-point": svg24('<path d="M5 7h14v12H5z"/><path d="M8 7V5h8v2"/><path d="M9 12h6M9 15h4"/>'),
  "patch-backup": svg24('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  "update-cache": svg24('<path d="M12 4v4l3-2"/><path d="M20 12a8 8 0 0 1-14 5"/><path d="M4 12a8 8 0 0 1 14-5"/>'),
  "installer-leftover": svg24('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>'),
  "old-windows": svg24('<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M8 10h8M8 13h5"/>'),
  hibernate: svg24('<path d="M18 8a7 7 0 1 1-12 5"/><path d="M6 14H3v3"/>'),
  pagefile: svg24('<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M8 9h8M8 12h6M8 15h4"/>'),
  "memory-dump": svg24('<path d="M5 8h14v10H5z"/><path d="M9 8V6h6v2"/><path d="M8 13h8"/>'),
  minidump: svg24('<rect x="6" y="7" width="12" height="10" rx="1"/><path d="M9 10h6"/>'),
  "temp-files": svg24('<path d="M5 8h14l-2 10H7L5 8z"/><circle cx="12" cy="6" r="2"/>'),
  "log-files": svg24('<path d="M7 4h10v16H7z"/><path d="M9 9h6M9 12h6M9 15h4"/>'),
  "cache-files": svg24('<rect x="4" y="5" width="16" height="12" rx="1"/><path d="M8 15l4-4 4 4"/>'),
  "other-files": svg24('<path d="M5 7h14v12H5z"/><path d="M9 11h6"/>'),
  "security-center": svg24('<path d="M12 3l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z"/>'),
  diagnostic: svg24('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4"/>'),
  dotnet: svg24('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M8 9h8M8 12h6"/>'),
  thumbnails: svg24('<rect x="4" y="6" width="16" height="12" rx="1"/><circle cx="9" cy="10" r="1.5"/><path d="M6 16l5-5 4 4 3-3 4 4"/>'),
  "recycle-bin": svg24('<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7V5h6v2"/><path d="M10 10v7M14 10v7"/>'),
  "other-unmapped": svg24('<path d="M5 8h14v10H5z"/><path d="M8 11h8M8 14h5"/><circle cx="17" cy="9" r="1.2" fill="currentColor" stroke="none"/>'),
  chrome: PRIVACY_ICONS.chrome,
  edge: PRIVACY_ICONS.edge,
  firefox: PRIVACY_ICONS.firefox,
  ie: PRIVACY_ICONS.ie,
  itunes: svg24Brand('<circle cx="12" cy="12" r="9" fill="#FC5C54"/><path d="M12 7v10M9 10c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3" stroke="#fff" stroke-width="1.5" fill="none"/>'),
  sogou: svg24Brand('<rect x="4" y="5" width="16" height="14" rx="2" fill="#FF6A00"/><path d="M8 10h8M8 14h5" stroke="#fff" stroke-width="1.5"/>'),
  wemeet: svg24Brand('<rect x="4" y="6" width="16" height="12" rx="2" fill="#006EFF"/><path d="M9 10l3 2.5L15 10" stroke="#fff" stroke-width="1.5" fill="none"/>'),
  "wx-log": svg24('<path d="M7 4h10v16H7z"/><path d="M9 9h6M9 12h6"/>'),
  "wx-cache": svg24('<path d="M12 4v4l3-2"/><path d="M20 12a8 8 0 0 1-14 5"/>'),
  "wx-image": svg24('<rect x="4" y="6" width="16" height="12" rx="1"/><circle cx="8.5" cy="10" r="1"/><path d="M6 16l4-4 3 3 3-4 4 5"/>'),
  "wx-video": svg24('<circle cx="12" cy="12" r="8"/><path d="M10 9l6 3-6 3V9z" fill="currentColor" stroke="none"/>'),
  "wx-file": svg24('<path d="M8 4h8l4 4v12H8z"/><path d="M16 4v4h4"/>'),
  "wx-backup": svg24('<rect x="6" y="5" width="12" height="14" rx="1"/><rect x="9" y="8" width="6" height="10" rx=".5"/>'),
  "qq-log": svg24('<path d="M7 4h10v16H7z"/><path d="M9 9h6"/>'),
  "qq-cache": svg24('<path d="M12 4v4l3-2"/><path d="M4 12a8 8 0 0 0 14-5"/>'),
  "qq-image": svg24('<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M6 16l5-5 4 4 3-3 4 5"/>'),
  "qq-video": svg24('<rect x="4" y="7" width="16" height="10" rx="1"/><path d="M10 10l5 2.5-5 2.5V10z"/>'),
  "qq-audio": svg24('<path d="M9 10a3 3 0 0 0 6 0v4a3 3 0 0 1-6 0v-4"/><path d="M12 17v2"/>'),
  "qq-file": svg24('<path d="M6 8h12l-2 10H8L6 8z"/><path d="M12 5v3"/>'),
  generic: PRIVACY_ICONS.generic
};

/**
 * @param {string} key
 */
export function getCDiskIconSvg(key) {
  return CDISK_TILE_ICONS[key] || CDISK_TILE_ICONS.generic;
}
