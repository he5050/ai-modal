# AIModal

> OpenAI 兼容接口的检测与管理桌面工具，基于 Tauri 2 + React 构建。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 功能特性

- **模型检测** — 输入 Base URL 和 API Key，一键获取全部模型列表并逐条并发检测可用性与延迟
- **模型列表** — 管理多个 Provider，查看每个接口下的模型数量、可用状态和最近检测结果
- **批量操作** — 支持多选 Provider 进行批量检测、批量删除
- **导入 / 导出** — JSON 格式导入导出 Provider 配置
- **实时日志** — Debug 模式下右下角显示实时操作日志面板
- **深色主题** — 全局深色 UI，macOS 强制深色模式

## macOS 安装

```sh
xattr -d com.apple.quarantine /Applications/AIModal.app
```

## 下载

前往 [Releases](../../releases) 页面下载对应平台的安装包：

| 平台                | 文件                                     |
| ------------------- | ---------------------------------------- |
| macOS Apple Silicon | `AI.Modal_x.x.x_aarch64.dmg`             |
| macOS Intel         | `AI.Modal_x.x.x_x64.dmg`                 |
| Windows             | `AI.Modal_x.x.x_x64-setup.exe` 或 `.msi` |

## 本地开发

### 环境要求

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Rust](https://rustup.rs/) stable
- macOS：Xcode Command Line Tools
- Windows：[Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### 启动开发环境

```bash
# 安装依赖
pnpm install

# 启动 Tauri 开发模式（含热更新）
pnpm tauri:dev
```

### 构建生产包

```bash
# 当前平台
pnpm tauri:build

# macOS Apple Silicon
pnpm tauri:build:mac-arm64

# macOS Intel
pnpm tauri:build:mac-x64
```

构建矩阵：

| Job         | Runner           | 产物          |
| ----------- | ---------------- | ------------- |
| macOS arm64 | `macos-latest`   | `.dmg` `.app` |
| macOS x64   | `macos-latest`   | `.dmg` `.app` |
| Windows x64 | `windows-latest` | `.msi` `.exe` |

## 技术栈

| 层       | 技术                                                                   |
| -------- | ---------------------------------------------------------------------- |
| 桌面框架 | [Tauri 2](https://tauri.app/)                                          |
| 前端框架 | [React 18](https://react.dev/) + TypeScript                            |
| 样式     | [Tailwind CSS 3](https://tailwindcss.com/)                             |
| 动画     | [anime.js 4](https://animejs.com/)                                     |
| 图标     | [lucide-react](https://lucide.dev/)                                    |
| 构建工具 | [Vite 5](https://vitejs.dev/)                                          |
| 后端     | Rust + [reqwest](https://docs.rs/reqwest) + [tokio](https://tokio.rs/) |

## 项目结构

```
ai-modal/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── DetectPage.tsx  # 模型检测页
│   │   ├── ModelsPage.tsx  # 模型列表页
│   │   ├── SettingsPage.tsx# 设置页
│   │   ├── Sidebar.tsx     # 侧边导航
│   │   ├── Tooltip.tsx     # 通用 Tooltip 组件
│   │   └── ...             # 其他组件
│   ├── api.ts              # Tauri 命令调用封装
│   └── types.ts            # 类型定义
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── commands/       # Tauri 命令处理
│   │   └── providers/      # OpenAI 兼容接口逻辑
│   └── tauri.conf.json     # Tauri 配置
└── .github/workflows/      # CI/CD
    └── release.yml         # 自动构建发布
```

## License

MIT
