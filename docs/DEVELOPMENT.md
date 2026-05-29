# 开发指南

## 环境要求

- Node.js **>= 18**（推荐 18 或 20 LTS）
- npm **>= 9**
- Windows 10/11（完整功能开发与验证）

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖 |
| `npm run dev` | 编译 TypeScript 并启动 Electron |
| `npm run typecheck` | 仅类型检查，不产出 `dist` |
| `npm run build:ts` | 编译到 `dist/` 并复制 `cdisk-rules.json` |
| `npm run build:win` | 编译 + 打包 Windows 便携版 exe |

## 仓库结构

```
clean/
├── apps/desktop/src/main/     # Electron 主进程、preload、drives
├── packages/
│   ├── core/                  # task-services 任务编排
│   ├── scanners/              # 扫描/清理（已模块化，见下方）
│   │   └── src/
│   │       ├── cleaner.ts     # 公开 API barrel
│   │       ├── scan/          # C 盘 / 默认扫描
│   │       ├── analyze/       # 重复 / 大文件 / 空项
│   │       ├── cleanup/       # 删除 / 隐私
│   │       ├── internal/      # 常量 / 并发 / FS
│   │       └── platform/      # 子进程 / 还原点 / 回收站
│   └── shared/                # 共享类型
├── ui/                        # 渲染进程（HTML/CSS/ESM）
│   ├── app.js                 # 入口、全局 state、导航
│   └── modules/               # 功能模块
├── scripts/                   # 构建辅助脚本
├── dist/                      # tsc 输出（git 通常忽略）
├── release/                   # electron-builder 输出
└── docs/                      # 项目文档
```

## 修改扫描规则

**静态路径**（系统缓存、临时目录等）：

- 编辑 `packages/scanners/src/config/cdisk-rules.json`
- 运行 `npm run build:ts`（会将 JSON 复制到 `dist/.../config/`）

**动态路径**（微信/QQ、浏览器 Profile、IDE 缓存等）：

- 修改 `packages/scanners/src/cleaner.ts` 中对应 `expand*` 函数

## 修改 UI

- 页面结构：`ui/index.html`
- 样式：`ui/styles.css`
- 逻辑：按功能拆在 `ui/modules/*.js`，由 `ui/app.js` 初始化
- 大列表（≥80 行分析结果、≥60 行详情）使用 `ui/modules/virtual-list.js` 虚拟滚动

新增面板时：

1. 在 `index.html` 增加 `.panel` 与侧栏 `.nav-item`
2. 新建 `ui/modules/xxx.js` 并 `export function initXxxModule(...)`
3. 在 `app.js` 中调用 `initXxxModule`

## 修改 IPC

1. 在 `main.ts` 注册 `ipcMain.handle`
2. 在 `preload.ts` 的 `cleanerApi` 中暴露方法
3. 更新 [IPC.md](./IPC.md)
4. 在 UI 模块中通过 `window.cleanerApi` 调用

## TypeScript 范围

- **已纳入 tsc**：`apps/**/*.ts`、`packages/**/*.ts`
- **未纳入**：`ui/**/*.js`（可考虑逐步加 JSDoc 或迁移到 TS）

编译配置见根目录 `tsconfig.json`，`outDir` 为 `dist`，`rootDir` 为仓库根。

## 后台任务

`ui/modules/background-tasks.js` 提供：

- `startBackgroundTask` / `updateBackgroundTask` / `endBackgroundTask`
- `subscribeBackgroundTasks` 供侧栏显示进行中任务

扫描/分析模块在启动长任务时应注册后台任务 ID（如 `cdisk-scan:${taskId}`），切换面板时不调用 `cancel`。

## 调试建议

- 主进程日志：在 `main.ts` 或 `cleaner.ts` 使用 `console.log`（输出在启动终端）
- 渲染进程：DevTools（开发模式下可为窗口增加 `webPreferences.devTools`）
- 扫描过慢：关注 `SCAN_IO_CONCURRENCY`（默认 16）与规则目录深度

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [IPC.md](./IPC.md)
- [BUILD.md](./BUILD.md)
