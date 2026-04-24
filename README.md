# Agentic Loop Demo

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.7-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)

一个用于演示智能体循环执行过程的前后端分离 Demo。

项目提供一个可视化时间线界面，用来展示任务在运行过程中经历的观察、决策、工具调用、复盘和状态更新等阶段，适合作为 Agent Workflow、Loop Orchestration 和可观测性演示项目。

## 特性

- 使用 `Vite + React + TypeScript` 构建前端界面
- 使用 Node HTTP API 提供运行时接口
- 展示任务执行的完整时间线和节点详情
- 支持轮询任务状态并查看每一步的原始输出
- 适合作为 GitHub 开源 Demo、学习样例或二次改造基础项目

## 项目结构

```text
.
├── src/                 # 前端应用
├── server/              # Node API 与 Agent Loop 逻辑
├── index.html           # Vite 入口 HTML
├── vite.config.ts       # Vite 配置
├── package.json         # 脚本与依赖
└── README.md
```

## 环境要求

- Node.js `>= 20`
- pnpm

## 快速开始

```bash
pnpm install
cp .env.example .env.local
pnpm dev:api
pnpm dev
```

## 安装依赖

```bash
pnpm install
```

## 本地开发

先启动后端 API：

```bash
pnpm dev:api
```

再启动前端：

```bash
pnpm dev
```

前端默认请求 `http://localhost:3001`。

如果你需要自定义前端请求地址，可以配置环境变量：

```bash
VITE_API_BASE_URL=http://localhost:3001
```

## 环境变量

LLM 模型主要使用以下环境变量：

```bash
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=your_model_name
ANTHROPIC_BASE_URL=https://your-model-endpoint.example.com
```

建议基于仓库中的 `.env.example` 复制出本地的 `.env.local` 再进行修改。

## 可用脚本

```bash
pnpm dev       # 启动前端开发环境
pnpm dev:api   # 启动后端 API
pnpm check     # TypeScript 类型检查
pnpm lint      # 代码检查
pnpm build     # 构建前端产物
pnpm preview   # 预览构建结果
```

## 开源说明

- 本仓库当前版本已移除对内部框架和内部工具配置的依赖，可作为独立 GitHub 项目使用
- 仓库默认不包含本地私有环境变量，请自行通过 `.env.local` 配置运行时密钥
- 如果你要在此基础上继续扩展，建议优先保持前后端解耦，避免把部署、密钥和私有基础设施配置直接提交到仓库
- 欢迎基于此项目进行学习、二次开发和提交 Issue / PR

## 仓库展示建议

- GitHub 仓库描述可使用：`A visual demo for agent loop orchestration, tool calls, and execution timeline inspection.`
- 推荐 Topics：`agent`、`ai-agent`、`workflow`、`orchestration`、`react`、`vite`、`typescript`、`observability`
- 如果你准备进一步完善仓库首页，建议补一张界面截图并设置 GitHub Social Preview

## License

本项目使用 [MIT License](./LICENSE)。
