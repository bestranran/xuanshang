# Xuanshang

基于 Open SaaS、Wasp、React、Prisma 和 PostgreSQL 规划的轻量 Web2 悬赏平台。

当前已包含 Open SaaS/Wasp 应用骨架、Prisma 资金模型、核心业务操作、易支付通知、奖励冷却任务以及用户端首版页面。

文档：

- [产品需求文档](docs/PRD.md)
- [技术规格](docs/SPEC.md)
- [实现基线](docs/BASELINE.md)

首版聚焦单人悬赏、易支付充值、任务资金托管、受限余额及人工支付宝口令提现。

## 本地运行

1. 安装 Wasp `0.25.x` 与 PostgreSQL；如已安装 Docker，可执行 `docker compose up -d postgres`。
2. 复制 `.env.server.example` 为 `.env.server` 并填写认证、存储和易支付配置。
3. 执行 `wasp db migrate-dev`、`wasp db seed`，再执行 `wasp start`。仓库包含业务表和 Wasp 认证表的 SQL 迁移。
4. 单元测试：`npm test`。

本地种子账号的统一密码为 `Password123`：

- 管理员：`admin@example.com`
- 发布者：`publisher@example.com`（含 1000 元测试充值余额）
- 接单者：`worker@example.com`

支付返回页不会入账；只有 `/api/epay/notify` 的合法异步通知会增加充值余额。
