/**
 * electron-builder afterPack: trim Chromium/Electron payload for smaller installers.
 * @param {import("app-builder-lib").AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { appOutDir } = context;

  const localeDir = path.join(appOutDir, "locales");
  const keepLocales = new Set(["en-US.pak", "zh-CN.pak"]);
  try {
    for (const name of fs.readdirSync(localeDir)) {
      if (!keepLocales.has(name)) {
        fs.unlinkSync(path.join(localeDir, name));
      }
    }
  } catch {
    /* no locales dir */
  }

  const removableFiles = [
    "LICENSES.chromium.html",
    "LICENSE.electron.txt"
    // 保留 ffmpeg.dll：Chromium 启动时会加载，删除会导致「找不到 ffmpeg」报错（约 +3MB）
  ];
  for (const name of removableFiles) {
    const filePath = path.join(appOutDir, name);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already absent */
    }
  }
};
