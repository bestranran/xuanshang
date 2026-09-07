# 轻量 Web2 悬赏平台技术规格

> 对应 PRD：v1.0  
> 技术栈：TypeScript、React、Wasp、Prisma、PostgreSQL  
> 状态：实现规格已定义，易支付协议测试向量待上游审计后锁定

## 1. 技术基线

实现前必须完成并记录：

1. 拉取 `wasp-lang/open-saas` 官方仓库默认分支最新提交，记录 commit SHA、Wasp 版本和依赖版本。
2. 拉取 `cedar2025/Xboard` 官方仓库默认分支最新提交，定位其易支付实现并记录 commit SHA。
3. 将 XBoard 实现与目标易支付服务商协议交叉验证，确认参数名、编码、排序、签名、通知成功值和查单协议。
4. 为确认后的协议制作固定请求、签名和回调测试向量，再开始支付代码实现。

XBoard 仅作为协议研究参考，不复制其 PHP 架构，也不假设其签名或回调处理天然安全。

保留 Open SaaS 的认证、管理员、邮件、文件上传、任务队列和测试框架。移除 Stripe 路由、页面、Webhook、订阅实体引用、环境变量检查和业务入口。

## 2. 架构边界

业务逻辑按以下服务集中管理：

- `TaskService`：任务创建、托管、审核和状态流转。
- `WalletService`：余额、流水、托管、奖励和提现冻结。
- `EpayService`：签名、订单创建、通知验证和订单查询。
- `FeeService`：费率读取、快照和整数手续费计算。
- `AdminService`：权限检查、人工退款、异常处理和审计。

React 页面不得直接拼装状态流转或余额修改。所有重要写操作使用服务端事务，并在事务中验证当前状态、操作者和金额条件。

## 3. 枚举

### 3.1 TaskStatus

```text
DRAFT
PENDING_PAYMENT
PENDING_REVIEW
OPEN
IN_PROGRESS
JUDGING
COMPLETED
CANCELLED
REFUNDED
CLOSED
```

### 3.2 ApplicationStatus

```text
PENDING
SELECTED
REJECTED
WITHDRAWN
```

### 3.3 RechargeOrderStatus

```text
CREATED
PAID
CLOSED
REFUNDED
```

### 3.4 EscrowStatus

```text
HELD
RELEASED
AWARDED
```

### 3.5 AwardStatus

```text
COOLING
BLOCKED
CREDITED
```

### 3.6 WithdrawalStatus

```text
REQUESTED
TOKEN_ISSUED
COMPLETED
REJECTED
CANCELLED
```

## 4. 数据模型

所有金额字段以 `Int` 整数分存储。时间使用数据库 UTC 时间，在界面按用户时区显示。

### 4.1 Task

- `id`
- `publisherId`
- `title`
- `description`
- `budgetCents`
- `applicationDeadline`
- `deliveryDeadline`
- `status`
- `selectedApplicationId`，可空且唯一关联当前选中的报名
- `createdAt`、`updatedAt`

约束：预算大于零；交付截止晚于报名截止；发布者不能参与自己的任务。

### 4.2 Application

- `id`
- `taskId`
- `applicantId`
- `message`
- `status`
- `createdAt`、`updatedAt`

唯一约束：`taskId + applicantId`。首版撤回后可在截止前恢复或更新同一条记录，不创建重复报名。

### 4.3 Submission

- `id`
- `taskId`
- `applicationId`
- `submitterId`
- `content`
- `submittedAt`、`updatedAt`

一个任务只有一个有效交付记录。附件复用 Open SaaS 文件上传实体并关联 `Submission`。只有接单者、发布者和管理员可读取。

### 4.4 WalletAccount

- `id`
- `userId`，唯一
- `rechargeAvailableCents`
- `earningsAvailableCents`
- `withdrawalFrozenCents`
- `version`
- `updatedAt`

所有余额不得小于零。`version` 或数据库行锁用于并发保护。

### 4.5 WalletEntry

- `id`
- `userId`
- `type`
- `rechargeDeltaCents`
- `earningsDeltaCents`
- `frozenDeltaCents`
- `referenceType`
- `referenceId`
- `idempotencyKey`，唯一
- `balanceSnapshot`
- `createdAt`

流水只允许追加，不允许更新或删除。余额变化必须与流水在同一事务中完成。

### 4.6 RechargeOrder

- `id`
- `orderNo`，全局唯一
- `userId`
- `creditCents`
- `feeCents`
- `payableCents`
- `feeRateBpsSnapshot`
- `fixedFeeCentsSnapshot`
- `epayTradeNo`，支付成功后唯一
- `status`
- `paidAt`
- `createdAt`、`updatedAt`

同一订单只能产生一次充值流水。`payableCents = creditCents + feeCents`。

### 4.7 PaymentNotification

- `id`
- `orderNo`
- `epayTradeNo`
- `payloadJson`
- `payloadHash`
- `signatureValid`
- `validationResult`
- `processingResult`
- `receivedAt`

每次通知均保存，包括无效和重复通知。敏感配置和 `EPAY_KEY` 不得写入记录。

### 4.8 TaskEscrow

- `id`
- `taskId`，唯一
- `publisherId`
- `rechargeCents`
- `earningsCents`
- `totalCents`
- `status`
- `heldAt`
- `releasedAt`

`totalCents` 必须等于任务预算及两类来源之和。退款严格按照这里保存的来源退回。

### 4.9 Award

- `id`
- `taskId`，唯一
- `recipientId`
- `amountCents`
- `status`
- `availableAt`
- `blockedReason`
- `creditedAt`

首版一个任务只能生成一个 Award，金额必须等于任务预算。

### 4.10 WithdrawalRequest

- `id`
- `userId`
- `amountCents`
- `feeCents`
- `payoutCents`
- `feeRateBpsSnapshot`
- `fixedFeeCentsSnapshot`
- `status`
- `tokenCiphertext`
- `tokenIssuedAt`
- `completedAt`
- `adminId`
- `adminNote`
- `createdAt`、`updatedAt`

红包口令使用服务端加密密钥加密保存，不进入普通日志。只有申请用户与管理员可读取解密结果。

### 4.11 FeeConfig

- `id`
- `rechargeRateBps`
- `rechargeFixedCents`
- `withdrawalRateBps`
- `withdrawalFixedCents`
- `version`
- `updatedByAdminId`
- `updatedAt`

首版使用单条当前配置。每次修改增加版本并写管理员日志；业务单据始终保存所用费率快照。

### 4.12 RefundRecord 与 TaskEvent

`RefundRecord` 保存退款对象、原交易、金额、渠道、外部凭证、原因、管理员和时间。易支付退款首版只记录人工操作，不主动调用退款接口。

`TaskEvent` 保存任务关键操作的操作者、事件类型、前后状态、结构化元数据和时间。系统任务的操作者为空并标记来源为 `SYSTEM`。

`User` 扩展封禁字段及封禁原因。封禁用户保留只读访问，所有用户端写操作均在服务端拒绝。

## 5. 状态流转

### 5.1 创建与审核

- 新建任务：`DRAFT`。
- 提交时余额不足：`DRAFT → PENDING_PAYMENT`，不创建托管。
- 用户充值后再次提交且余额充足：事务扣减余额、写流水、创建托管，进入 `PENDING_REVIEW`。
- 管理员通过：`PENDING_REVIEW → OPEN`。
- 管理员拒绝：释放托管并进入 `REFUNDED`。
- 无托管任务由发布者取消：进入 `CANCELLED`。

任务进入 `PENDING_REVIEW` 后，发布者不能修改预算和核心内容。需要修改时由管理员释放托管并退回草稿，且写入事件日志。

### 5.2 报名、选人和交付

- 只有 `OPEN` 且未过报名截止的任务可以报名。
- 发布者只能在 `OPEN` 且截止前选择一个有效报名。
- 选人事务将任务更新为 `IN_PROGRESS`，选中报名为 `SELECTED`，其他报名为 `REJECTED`。
- 只有选中的接单者可以在交付截止前创建或更新交付物。
- 首次提交将任务更新为 `JUDGING`；截止前更新交付物不重复改变状态。
- 只有发布者可以确认交付，且确认操作只能执行一次。

### 5.3 奖励入账

- 发布者确认时创建 `COOLING` Award，`availableAt = confirmedAt + 24 hours`。
- 管理员可在入账前将 Award 改为 `BLOCKED`，任务保持 `JUDGING`。
- 管理员可以解除拦截并重新设置 24 小时冷却、退回 `IN_PROGRESS` 重新交付，或关闭任务并释放托管。
- 队列仅处理 `COOLING` 且到达 `availableAt` 的 Award。
- 入账事务将托管标记为 `AWARDED`、增加接单者收益余额、写双方资金流水、将 Award 标记为 `CREDITED`，并将任务更新为 `COMPLETED`。
- `Award.id` 对应的入账幂等键唯一，重复队列任务不得重复入账。

### 5.4 逾期

报名截止后禁止新增报名和选人；交付截止后禁止接单者继续修改交付。队列生成管理员待处理事件和通知，但不自动裁决或退款。

管理员可以延长对应截止时间，或关闭任务并释放托管。所有延期和关闭操作写入 TaskEvent。

## 6. 钱包事务

### 6.1 手续费计算

```text
fee = ceil(amountCents * rateBps / 10000) + fixedFeeCents
```

- 充值以希望到账的 `creditCents` 为计算基数。
- 提现以申请冻结的 `amountCents` 为计算基数。
- 所有输入必须为正整数。
- 提现要求 `amountCents > feeCents`。

### 6.2 托管

发布任务时优先扣减 `rechargeAvailableCents`，剩余预算从 `earningsAvailableCents` 扣除。扣减金额、WalletEntry 和 TaskEscrow 必须在同一事务中写入。

释放托管时按 `TaskEscrow.rechargeCents` 和 `TaskEscrow.earningsCents` 恢复原余额桶。已 `AWARDED` 的托管不能释放。

### 6.3 提现

- 创建申请：减少收益可用余额，增加提现冻结金额，状态为 `REQUESTED`。
- 管理员录入口令：加密保存口令，状态为 `TOKEN_ISSUED`。
- 用户确认兑换或管理员强制完成：减少冻结金额，状态为 `COMPLETED`。
- 管理员拒绝、用户在发放口令前取消或管理员作废：减少冻结金额并恢复收益可用余额。
- 已进入 `TOKEN_ISSUED` 后，用户不能自行取消。

每一步使用唯一幂等键和条件状态更新。

## 7. 易支付接口

配置：

```text
EPAY_API_URL
EPAY_PID
EPAY_KEY
EPAY_NOTIFY_URL
EPAY_RETURN_URL
PAYOUT_TOKEN_ENCRYPTION_KEY
```

服务能力：

- 创建充值订单。
- 生成 MD5 签名和收银台跳转参数。
- `notify_url` 异步通知。
- `return_url` 支付结果页。
- 管理员查询易支付订单。

协议审计完成前的签名基线为：排除 `sign`、`sign_type` 和空值字段，按参数名排序并按服务商规定拼接，追加商户密钥后计算小写 MD5。是否 URL 编码、字符集和具体拼接格式必须由服务商协议及固定测试向量最终锁定，禁止凭经验猜测。

### 7.1 异步通知处理

1. 保存收到的原始参数，但不记录服务端密钥。
2. 使用确认后的规范化算法重新计算签名，并进行恒定时间比较。
3. 校验商户订单号存在且属于充值订单。
4. 将通知金额严格解析为整数分，禁止浮点比较。
5. 校验金额等于订单 `payableCents`。
6. 校验支付状态为服务商定义的成功状态。
7. 校验并保存易支付交易号，防止同一交易号匹配多个订单。
8. 在数据库事务中条件更新订单、增加充值余额并写 WalletEntry。
9. 成功处理或确认是已处理的合法重复通知时，返回纯文本 `success`。
10. 验签或业务校验失败时不得更新余额，并保存失败原因。

只有异步通知可以将订单标记为 `PAID`。返回页和主动查询只能同步展示状态，不直接入账。

## 8. 权限与隐私

- 所有写接口要求已登录且未封禁。
- 发布者只能管理自己的任务，且不能报名自己的任务。
- 接单者只能修改自己的报名和交付物。
- 报名和交付只对本人、任务发布者及管理员可见。
- 文件下载必须复用现有受控上传/访问机制，不公开对象存储地址。
- 红包口令仅对提现申请人和管理员解密展示，并避免进入错误追踪和分析日志。
- 管理员权限在每个服务端 Action/Route 内验证。
- 易支付通知路由公开访问，但必须完成全部密码学和订单校验。

## 9. 用户端与后台接口

用户端最小能力：

- 查询任务列表和详情。
- 创建、编辑和提交任务。
- 创建充值订单、查询内部充值状态。
- 报名、撤回报名、选择接单者。
- 创建或更新交付、确认成果。
- 查询余额和流水。
- 创建、查看、取消提现及确认兑换。

管理员最小能力：

- 审核、延期、关闭和恢复任务。
- 封禁或解封用户。
- 查看充值订单、通知记录并主动查单。
- 拦截、解除或重新处理 Award。
- 记录人工退款。
- 处理提现和录入红包口令。
- 读取和更新手续费配置。
- 查看操作日志。

## 10. 测试与验收

### 10.1 单元测试

- 易支付签名固定向量、参数顺序、空值、中文和篡改参数。
- 金额字符串与整数分转换，拒绝科学计数、负数和多于两位小数。
- 充值和提现手续费计算及向上取整。
- 每个合法和非法任务状态流转。
- 充值本金不可提现。

### 10.2 集成测试

- 正常通知、错误签名、错误金额、错误订单号和非成功状态。
- 重复及并发通知只产生一次余额入账。
- 并发发布任务不会造成余额为负。
- 两次并发选人只能有一个成功。
- 重复奖励队列任务只产生一次收益入账。
- 并发提现不会超过收益余额。
- 提现完成、拒绝、取消和作废后的余额守恒。
- 托管退款恢复正确的充值/收益余额组成。
- 普通用户、任务相关方、封禁用户和管理员的权限矩阵。

### 10.3 端到端测试

1. 注册用户充值并收到余额。
2. 使用余额发布悬赏并通过审核。
3. 另一用户报名并被选中。
4. 接单者上传交付，发布者确认。
5. 冷却期任务将奖金计入收益余额。
6. 接单者申请提现，管理员录入口令，用户确认兑换。

另覆盖管理员拒绝任务、任务逾期、Award 被拦截和人工退款记录流程。

## 11. 实施顺序

1. 固定 Open SaaS 与 XBoard 提交，完成易支付协议审计和测试向量。
2. 移除 Stripe 业务入口并确认保留模块可运行。
3. 添加 Prisma 模型、枚举、唯一约束和迁移。
4. 实现 FeeService、WalletService 和账务事务测试。
5. 实现 EpayService、充值页面、通知路由和支付结果页。
6. 实现 TaskService 及悬赏用户端流程。
7. 扩展管理员后台和服务端权限验证。
8. 实现冷却队列、提现口令和通知邮件。
9. 完成安全、并发、端到端和回归测试。

