# 项目开发指南

> 本文档面向 AI Agent 和开发者，提供项目开发的完整上下文。本项目使用模块化文档架构，请根据任务类型选择阅读，阅读完相关文档后，严格遵循框架约束进行开发。

## EdenX 框架指南

> 文档地址：**[EDENX.md](./docs/EDENX.md)**

**🟢 除以下情况外，必须优先阅读 EDENX.md：**

- 编写普通的 React 组件（非路由组件）
- 修改 CSS/样式文件
- 添加工具函数或业务逻辑
- 安装普通 npm 包（非 EdenX 相关）

---

## 🏗️ 项目信息

### 技术栈

- **框架**: EdenX (基于 React 18)
- **语言**: TypeScript
- **包管理器**: pnpm

---

## 🎯 开发规范

### 文件命名

- 组件文件：使用 PascalCase，如 `UserCard.tsx`
- 工具函数：使用 camelCase，如 `formatDate.ts`

### 代码组织

```tsx
// 组件示例
import { useState } from 'react';
import type { FC } from 'react';

interface Props {
  // 接口定义
}

export const ComponentName: FC<Props> = ({ ...props }) => {
  // 组件实现
  return <div>...</div>;
};
```

### Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
```

---

## 📝 注意事项

1. **文档更新**：`docs/EDENX.md` 由命令自动生成，请勿手动编辑
2. **问题反馈**：遇到框架 bug 或文档问题，请及时反馈
