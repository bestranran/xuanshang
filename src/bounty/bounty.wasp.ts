import { action, api, job, page, query, route, type Spec } from "@wasp.sh/spec";

import { TaskDetailsPage } from "./pages/TaskDetailsPage" with { type: "ref" };
import { TaskListPage } from "./pages/TaskListPage" with { type: "ref" };
import { WalletPage } from "./pages/WalletPage" with { type: "ref" };
import {
  applyToTask,
  cancelBountyTask,
  cancelWithdrawal,
  closeBountyTask,
  confirmWithdrawal,
  confirmDelivery,
  createBountyTask,
  createRechargeOrder,
  createWithdrawal,
  finalizeWithdrawal,
  getAdminOverview,
  getTaskDetails,
  getTasks,
  getWallet,
  selectApplication,
  reviewBountyTask,
  setAwardBlocked,
  issueWithdrawalToken,
  submitBountyTask,
  submitDelivery,
} from "./operations" with { type: "ref" };
import { epayNotify } from "./webhook" with { type: "ref" };
import { creditAvailableAwards } from "./awardJob" with { type: "ref" };

const entities = [
  "User", "UserTask", "Application", "Submission", "WalletAccount", "WalletEntry",
  "RechargeOrder", "PaymentNotification", "TaskEscrow", "Award", "WithdrawalRequest",
  "FeeConfig", "TaskEvent", "RefundRecord", "AdminAuditLog",
  "Contest", "ContestPrize", "ContestEntry", "ContestEscrow", "ContestAward",
] as const;

export const bountySpec: Spec = [
  route("TaskListRoute", "/tasks", page(TaskListPage)),
  route("TaskDetailsRoute", "/tasks/:id", page(TaskDetailsPage)),
  route("WalletRoute", "/wallet", page(WalletPage, { authRequired: true })),
  query(getTasks, { entities: ["UserTask", "User", "Award"] }),
  query(getTaskDetails, { entities: ["UserTask", "Application", "Submission", "Award", "User"] }),
  query(getWallet, { entities: ["WalletAccount", "WalletEntry", "RechargeOrder", "WithdrawalRequest"] }),
  query(getAdminOverview, { entities: [...entities] }),
  action(createBountyTask, { entities: [...entities] }),
  action(submitBountyTask, { entities: [...entities] }),
  action(applyToTask, { entities: [...entities] }),
  action(cancelBountyTask, { entities: [...entities] }),
  action(selectApplication, { entities: [...entities] }),
  action(submitDelivery, { entities: [...entities] }),
  action(confirmDelivery, { entities: [...entities] }),
  action(createRechargeOrder, { entities: [...entities] }),
  action(createWithdrawal, { entities: [...entities] }),
  action(cancelWithdrawal, { entities: [...entities] }),
  action(closeBountyTask, { entities: [...entities] }),
  action(confirmWithdrawal, { entities: [...entities] }),
  action(reviewBountyTask, { entities: [...entities] }),
  action(setAwardBlocked, { entities: [...entities] }),
  action(issueWithdrawalToken, { entities: [...entities] }),
  action(finalizeWithdrawal, { entities: [...entities] }),
  api("POST", "/epay/notify", epayNotify, { entities: [...entities], auth: false }),
  job(creditAvailableAwards, {
    executor: "PgBoss",
    schedule: { cron: "*/5 * * * *" },
    entities: [...entities],
  }),
];
