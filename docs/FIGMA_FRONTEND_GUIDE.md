# 悬赏平台前端重构说明

这份压缩包用于在 Figma 中重构界面。目标是升级视觉和交互，不改变现有业务规则。

## 产品与语言

- 产品：中文悬赏与比赛平台
- 用户角色：发布者、接单者、管理员
- 前端技术：React 19、Tailwind CSS 4、Radix UI、Lucide 图标、Wasp 路由
- 所有用户可见文案保持中文
- 桌面端和移动端都需要设计

## 重点页面

1. 首页：`src/landing-page/LandingPage.tsx`
2. 登录/注册：`src/auth/LoginPage.tsx`、`src/auth/SignupPage.tsx`
3. 悬赏大厅与发布：`src/bounty/pages/TaskListPage.tsx`
4. 悬赏详情与完整履约流程：`src/bounty/pages/TaskDetailsPage.tsx`
5. 比赛大厅与发布：`src/contest/pages/ContestListPage.tsx`
6. 比赛详情、投稿和评奖：`src/contest/pages/ContestDetailsPage.tsx`
7. 钱包与资金流水：`src/bounty/pages/WalletPage.tsx`
8. 管理后台：`src/admin/AdminLayout.tsx`、`src/bounty/pages/AdminPage.tsx`
9. 账号设置：`src/user/AccountPage.tsx`

## 必须保留的业务状态

- 悬赏：待支付、待审核、招募中、进行中、已交付、冷却中、已完成、已退款、已关闭
- 比赛：待支付、投稿中、评奖中、奖励冷却中、已完成、已退款、已关闭
- 比赛固定设置一等奖、二等奖、三等奖，每档一位获奖者，同一人不能重复获奖
- 截止前投稿仅本人、比赛发布者和管理员可见；截止后全部公开
- 奖励确认后进入 24 小时冷却，管理员可查看并拦截
- 钱包区分充值余额、收益余额和提现冻结金额
- 管理后台必须保留数据概览、悬赏管理、比赛管理、提现管理、奖励冷却、用户管理、审计记录

## 组件和视觉约束

- 通用组件位于 `src/client/components/ui`
- 全局样式位于 `src/client/Main.css`
- 导航位于 `src/client/components/NavBar`
- 设计时覆盖加载、空数据、错误、禁用、成功、危险操作确认和移动端状态
- 后台需要高信息密度，但要保持清晰的状态标签、金额层级和操作优先级
- 不要在视觉稿中删除资金托管、退款来源、奖励冷却或管理员审计信息

## 交付建议

Figma 中建议按“设计变量 → 基础组件 → 用户端页面 → 管理端页面 → 响应式变体”的顺序组织。开发回填时应尽量保留页面的数据调用和事件处理，只替换布局、组件组合与样式。
