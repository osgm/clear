# JoyCleaner

`JoyCleaner` 是一个基于 **Node.js + Electron + TypeScript** 的 Windows 桌面清理工具，聚焦于系统垃圾清理、隐私痕迹清理、磁盘分析与可追踪的清理流程。

> 本项目采用 **Apache License 2.0** 开源，详见 [LICENSE](./LICENSE)。

## 功能概览

- **磁盘清理**：系统缓存、临时目录、更新缓存、日志、常用软件缓存、微信/QQ 专清等；支持实时扫描结果与分批清理
- **隐私清理**：浏览器缓存、系统临时目录、最近使用记录；按类别勾选清理
- **磁盘分析**：重复文件、大文件、空文件/空目录；分组展示与批量删除
- **安全与可追踪**：回收站 / 安全删除（覆写）；导出 JSON 报告

## 快速开始

### 环境要求

- Node.js `>= 18`（推荐 18 或 20）
- npm `>= 9`
- Windows 10/11（完整功能）

### 安装与运行

```bash
npm install
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

## 构建发布

Windows 便携版（单文件 exe）：

```bash
npm run build:win
```

产物默认在 `release/` 目录。若遇 `app.asar` 被占用，请参阅 [docs/BUILD.md](./docs/BUILD.md)。

下载 Electron 超时时可使用国内镜像，示例见 [docs/BUILD.md](./docs/BUILD.md#网络镜像下载-electron-失败时)。

## 文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](./docs/README.md) | 文档索引 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构设计与 Mermaid 图 |
| [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) | 开发指南与目录说明 |
| [docs/IPC.md](./docs/IPC.md) | IPC 与 `cleanerApi` 对照 |
| [docs/BUILD.md](./docs/BUILD.md) | 构建与常见问题 |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | 已知限制与优化路线图 |

## 项目结构（摘要）

```
apps/desktop/          # Electron 主进程、preload
packages/core/         # 任务编排
packages/scanners/     # 扫描/清理核心 + cdisk-rules.json
packages/shared/       # 共享类型
ui/                    # 渲染进程界面
docs/                  # 设计与开发文档
```

## 开源与贡献

计划配套文件：`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`NOTICE`（见 [docs/ROADMAP.md](./docs/ROADMAP.md)）。

## 免责声明

- 本工具仅用于用户已授权的数据与设备清理
- 安全删除操作不可逆，请务必确认后执行
- 对误删、数据损坏等风险，使用者需自行评估与承担
