import { action, api, job, page, query, route, type Spec } from "@wasp.sh/spec";

import { TaskDetailsPage } from "./pages/TaskDetailsPage" with { type: "ref" };
import { TaskListPage } from "./pages/TaskListPage" with { type: "ref" };
import { WalletPage } from "./pages/WalletPage" with { type: "ref" };
import { MyWorkPage } from "./pages/MyWorkPage" with { type: "ref" };
import { PublicProfilePage } from "../user/PublicProfilePage" with { type: "ref" };
import {
  answerTaskQuestion, appealTaskRejection, askTaskQuestion,
  cancelBountyTask,
  cancelWithdrawal,
  closeBountyTask,
  confirmWithdrawal,
  confirmDelivery,
  createBountyTask, createWorkReview,
  createRechargeOrder,
  createWithdrawal,
  finalizeWithdrawal,
  getAdminOverview,
  getPublicSiteSettings,
  getAdminWalletEntries,
  getMyWork, getPublicProfile, getTaskDetails,
  getTasks,
  getWallet,
  claimBountyTask, releaseTaskClaim, resolveTaskAppeal, reviewTaskSubmission,
  reviewBountyTask,
  setAwardBlocked,
  issueWithdrawalToken,
  submitBountyTask,
  submitDelivery, updateProfile,
  getSystemSettingsForAdmin, updateSystemSettings,
} from "./operations" with { type: "ref" };
import { epayNotify } from "./webhook" with { type: "ref" };
import { creditAvailableAwards } from "./awardJob" with { type: "ref" };
import { advanceTaskTimers } from "./taskTimerJob" with { type: "ref" };

const entities = [
  "User", "UserTask", "TaskClaim", "Submission", "WalletAccount", "WalletEntry",
  "RechargeOrder", "PaymentNotification", "TaskEscrow", "Award", "WithdrawalRequest",
  "FeeConfig", "TaskEvent", "RefundRecord", "AdminAuditLog",
  "Contest", "ContestPrize", "ContestEntry", "ContestEscrow", "ContestAward",
  "SubmissionVersion", "TaskQuestion", "ContestQuestion", "WorkReview",
  "SystemSetting", "File", "ContestEntryVersion",
] as const;

export const bountySpec: Spec = [
  route("TaskListRoute", "/tasks", page(TaskListPage)),
  route("TaskDetailsRoute", "/tasks/:id", page(TaskDetailsPage)),
  route("MyWorkRoute", "/work", page(MyWorkPage, { authRequired: true })),
  route("PublicProfileRoute", "/u/:username", page(PublicProfilePage)),
  route("WalletRoute", "/wallet", page(WalletPage, { authRequired: true })),
  query(getTasks, { entities: ["UserTask", "User", "Award"] }),
  query(getTaskDetails, { entities: [...entities] }),
  query(getMyWork, { entities: [...entities] }),
  query(getPublicProfile, { entities: [...entities] }),
  query(getWallet, { entities: ["WalletAccount", "WalletEntry", "RechargeOrder", "WithdrawalRequest"] }),
  query(getAdminOverview, { entities: [...entities] }),
  query(getPublicSiteSettings, { entities: ["SystemSetting"] }),
  query(getAdminWalletEntries, { entities: ["User", "WalletEntry"] }),
  query(getSystemSettingsForAdmin, { entities: [...entities] }),
  action(createBountyTask, { entities: [...entities] }),
  action(submitBountyTask, { entities: [...entities] }),
  action(cancelBountyTask, { entities: [...entities] }),
  action(submitDelivery, { entities: [...entities] }),
  action(claimBountyTask, { entities: [...entities] }),
  action(releaseTaskClaim, { entities: [...entities] }),
  action(reviewTaskSubmission, { entities: [...entities] }),
  action(appealTaskRejection, { entities: [...entities] }),
  action(resolveTaskAppeal, { entities: [...entities] }),
  action(askTaskQuestion, { entities: [...entities] }),
  action(answerTaskQuestion, { entities: [...entities] }),
  action(createWorkReview, { entities: [...entities] }),
  action(updateProfile, { entities: [...entities] }),
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
  action(updateSystemSettings, { entities: [...entities] }),
  api("POST", "/epay/notify", epayNotify, { entities: [...entities], auth: false }),
  job(creditAvailableAwards, {
    executor: "PgBoss",
    schedule: { cron: "*/5 * * * *" },
    entities: [...entities],
  }),
  job(advanceTaskTimers, {
    executor: "PgBoss",
    schedule: { cron: "*/5 * * * *" },
    entities: [...entities],
  }),
];
