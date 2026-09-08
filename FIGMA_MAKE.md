# Figma Make 导入说明

这个分支专门用于 Figma Make。根目录已经是可直接运行的 React + Vite 项目，不依赖数据库或 Wasp 服务。

## 在 Figma Make 中导入

1. 新建 Make 文件。
2. 选择 **Import from GitHub**。
3. 选择仓库 `bestranran/xuanshang`。
4. 选择分支 `codex/figma-make`。
5. 让 Make 执行 `npm install` 和 `npm run dev`。

## 给 Make 的首条提示词

请在不改变现有中文业务流程和页面信息架构的前提下，重构这个悬赏与比赛平台的完整视觉系统。先统一设计变量和组件，再逐页优化悬赏大厅、悬赏详情、比赛大厅、比赛详情、钱包和管理后台。保持响应式布局，强化金额、状态、截止时间和主要操作的视觉层级。比赛必须保留一等奖、二等奖、三等奖各一名且不可重复获奖，奖励进入 24 小时冷却，管理员可以随时 review 和拦截。所有用户可见文案保持中文。

## 源码位置

- Make 可运行原型：`figma-src/`
- 原始 Wasp 业务页面：`src/`
- 业务与页面说明：`docs/FIGMA_FRONTEND_GUIDE.md`
