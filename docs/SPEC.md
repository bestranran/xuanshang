# 悬赏平台技术规格

> 版本：v1.0
> 状态：与当前实现一致
> 更新日期：2026-09-15

## 1. 架构原则

采用一个 Wasp 应用、一个 PostgreSQL 数据库和一个对象存储。React 负责界面，Wasp Operation/API/Job 作为服务端入口，Prisma 负责事务与约束。首版不拆微服务。

代码的三个事实源：

1. `schema.prisma` 定义持久化事实与关系。
2. `src/bounty/taskState.ts` 定义悬赏状态迁移。
3. `src/server/walletService.ts` 定义所有余额变化与资金流水。

Operation 是薄的用例入口：解析输入、鉴权、调用领域规则并提交事务。共享输入与权限逻辑位于 `src/server/operationUtils.ts`。

## 2. 悬赏模型

### 2.1 状态

`TaskStatus`：

```text
DRAFT → PENDING_PAYMENT → PENDING_REVIEW → OPEN → CLAIMED
CLAIMED → SUBMITTED
SUBMITTED → REVISION_REQUESTED → SUBMITTED
SUBMITTED → REJECTED_PENDING_APPEAL → APPEALED
SUBMITTED/APPEALED → COOLING → COMPLETED
```

允许按规则回到 `OPEN`，或进入 `CANCELLED`、`REFUNDED`、`CLOSED`。状态迁移必须先经 `assertTaskTransition` 检查；并发敏感的写入使用条件 `updateMany`。

### 2.2 聚合关系

- `UserTask`：任务说明、预算、接取窗口及唯一 `assignedClaimId`。
- `TaskClaim`：一次接取历史，保存工作截止、审核截止、申诉截止和最终 `outcome`。
- `Submission`：一对一属于 `TaskClaim`。
- `SubmissionVersion`：保存每次交付文字与文件。
- `WorkReview`：属于 `TaskClaim`，双方各最多一条。
- `TaskEscrow`、`Award`、`TaskEvent`：分别记录托管组成、待入账奖励和审计事件。

`TaskClaim.outcome = null` 表示当前或尚未裁决；终值为 `REJECTED | APPROVED | EXPIRED | RELEASED`。任务当前状态只保存在 `UserTask.status`，不在接单记录重复保存一份状态。

### 2.3 并发接取

接取在 Serializable 事务中执行：

1. 创建 `TaskClaim`。
2. 条件更新 `UserTask where status=OPEN and assignedClaimId=null`。
3. 更新数量不是 1 时删除本事务内的接单记录并返回 409。

数据库对 `assignedClaimId` 的唯一约束提供最后一道保护。

## 3. 比赛模型

`Contest` 聚合 `ContestPrize`、`ContestEntry`、`ContestEntryVersion`、`ContestEscrow` 和 `ContestAward`。`ContestEntry` 不重复保存最新正文；读取 DTO 从最后一个版本派生 `content`。奖项的 `winnerEntryId` 唯一，避免同一作品重复获奖。

## 4. 资金模型

`WalletAccount` 保存充值可用、收益可用、提现冻结和乐观锁版本。`WalletEntry` 保存三类增量、业务引用、全局唯一幂等键和变更后余额快照。

所有余额写入调用 `applyWalletMutation(tx, mutation)`：

- 先检查幂等键；合法重放直接返回原流水。
- 使用账户版本和余额下限做条件更新。
- 更新失败返回 409，不允许负余额。
- 在同一事务写入余额快照流水。

适用场景包括支付入账、任务/比赛托管与退款、奖励、礼品卡、提现冻结/完成/释放及管理员资金调整。只读场景允许 `WalletAccount.upsert` 创建零余额账户。

## 5. 文件模型与权限

`File` 在上传阶段通过 `targetType + targetId` 暂存，完成提交后绑定 `SubmissionVersion` 或 `ContestEntryVersion`。业务提交与文件绑定在同一事务完成。

- 视频最大 500 MB，每个版本最多一个。
- 普通附件最大 20 MB，每个版本最多五个。
- 上传会话 24 小时后清理；业务终态 30 天后清理非最终历史版本。
- 下载 URL 必须在服务端按上传者、任务双方、比赛发布者/公开状态或管理员身份授权。

## 6. 安全与一致性

- 写操作统一拒绝被封禁用户；管理员操作还需 `isAdmin`。
- 业务状态、余额、托管、奖励和审计记录位于同一事务。
- 资金相关事务使用 Serializable；可重放入口使用稳定幂等键。
- 支付通知校验签名、内部订单号、金额、交易状态和第三方交易号。
- 系统密钥使用 `APP_MASTER_KEY` 加密入库，不写入客户端或普通日志。
- 提现口令只对申请人和管理员解密。

## 7. 定时任务

- `advanceTaskTimers`：处理接单超时、审核超时自动通过和拒绝申诉超时。
- `creditAvailableAwards`：处理悬赏与比赛冷却期结束后的奖励入账。
- `cleanupBusinessFiles`：清理无效上传和非最终历史文件。

任务可重复执行；资金动作依赖幂等键，状态动作依赖条件更新或当前状态检查。

## 8. 构建与部署

- `npm run dev`：Wasp 开发环境。
- `npm test`：Vitest 单元测试。
- `npm run build`：Wasp 生产代码生成后执行 Vite SSR/浏览器构建。
- 数据库迁移唯一基线为 `migrations/20260915040000_initial`，包含业务与 Wasp Auth 表。
- 生产由 PostgreSQL、Wasp 服务、邮件中继和 Caddy 组成；Caddy 代理 `/auth/*`、`/operations/*` 和 `/epay/notify`，其余请求提供 Vite 的 `200.html` 与静态资源。

## 9. 上线前验证

```bash
npm test
npm run build
bash deploy/tests/test-deploy.sh
```

此外必须用空 PostgreSQL 执行迁移、播种测试账户，并烟测首页、`/auth/me` 和公开查询接口。
