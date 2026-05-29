# 构建与发布

## 默认输出

| 命令 | 产物 |
|------|------|
| `npm run build:win` | `release/JoyCleaner 0.2.0.exe`（portable 单文件） |
| 同上 | `release/win-unpacked/`（解压后的完整目录） |

配置见根目录 `package.json` 的 `build` 字段；打包后裁剪见 `scripts/electron-after-pack.cjs`。

## Windows 便携版

```bash
npm run build:win
```

等价于：

```bash
npm run build:ts
npx electron-builder --win portable
```

## 网络镜像（下载 Electron 失败时）

PowerShell：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run build:win
```

## 常见问题

### 1. `app.asar` 被占用，构建失败

**现象：**

```
remove ...\release\win-unpacked\resources\app.asar: The process cannot access the file...
```

**原因：**

- 正在运行的 JoyCleaner / Electron 未退出；
- 从 `release\win-unpacked` 直接运行过 exe；
- IDE（如 Cursor）索引了 `app.asar`。

**处理：**

```powershell
taskkill /F /IM "JoyCleaner.exe" 2>$null
taskkill /F /IM "electron.exe" 2>$null
```

仍失败时，输出到临时目录再复制 exe：

```powershell
npm run build:ts
npx electron-builder --win portable --config.directories.output=D:/Temp/joycleaner-release
Copy-Item "D:\Temp\joycleaner-release\JoyCleaner 0.2.0.exe" -Destination ".\release\" -Force
```

### 2. 关闭程序后无法删除 `release` 目录

长时扫描/分析未结束前关闭窗口，主进程可能等待 IPC 完成。当前版本已在退出时取消任务并结束子进程；若仍残留，结束任务管理器中的 `JoyCleaner.exe` 后再删。

### 3. 运行报「找不到 ffmpeg」

`electron-after-pack` **不得**删除 `ffmpeg.dll`，Chromium 启动需要该文件（约 +3MB）。

### 4. 测试安装包

- 将 portable exe 复制到 `%TEMP%` 或桌面再运行，避免锁住源码下的 `release` 目录。
- 不要长期从 `release\win-unpacked\JoyCleaner.exe` 直接调试。

## 其它平台

需在对应系统上执行 `npm run build:ts` 后：

```bash
# macOS
npx electron-builder --mac dmg zip

# Linux
npx electron-builder --linux AppImage deb
```

扫描与清理功能当前仅针对 Windows 实现，其它平台包仅验证壳层能否启动。

## 体积优化说明

`afterPack` 已移除多余 Chromium 语言包与 LICENSE  HTML。Electron 运行时本身约 60MB+，属正常范围。
