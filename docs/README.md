# JoyCleaner 文档

本目录存放项目设计与开发文档，与源码一同版本管理。架构图使用 [Mermaid](https://mermaid.js.org/) 编写，在 GitHub、Cursor、VS Code（安装 Mermaid 插件）中可直接预览。

## 文档索引

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、分层、数据流、扫描流水线 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 目录结构、本地开发、模块职责 |
| [IPC.md](./IPC.md) | 主进程 IPC 与 `cleanerApi` 对照 |
| [BUILD.md](./BUILD.md) | 构建发布、常见问题（文件占用等） |
| [ROADMAP.md](./ROADMAP.md) | 已知限制与优化路线图 |

## 维护约定

- 调整 IPC、模块边界或扫描流程时，同步更新对应文档。
- 复杂示意图可放在 `docs/diagrams/`（如 `.drawio`），并在 Markdown 中链接。
- 用户向说明以根目录 [README.md](../README.md) 为主；本目录面向贡献者与维护者。
