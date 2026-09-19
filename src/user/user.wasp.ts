import { action, page, query, route, type Spec } from "@wasp.sh/spec";

import { AccountPage } from "./AccountPage" with { type: "ref" };
import {
  getPaginatedUsers,
  getAdminUserDetails,
  adjustUserWalletByAdmin,
  setRechargeOrderStatusByAdmin,
  setUserBan,
  updateIsUserAdminById,
} from "./operations" with { type: "ref" };

export const userSpec: Spec = [
  route("AccountRoute", "/account", page(AccountPage, { authRequired: true })),
  query(getPaginatedUsers, { entities: ["User"] }),
  query(getAdminUserDetails, { entities: ["User", "WalletAccount", "WalletEntry", "RechargeOrder", "WithdrawalRequest", "UserTask", "TaskClaim", "Contest", "ContestEntry"] }),
  action(adjustUserWalletByAdmin, { entities: ["User", "WalletAccount", "WalletEntry", "AdminAuditLog"] }),
  action(setRechargeOrderStatusByAdmin, { entities: ["User", "WalletAccount", "WalletEntry", "RechargeOrder", "AdminAuditLog"] }),
  action(updateIsUserAdminById, { entities: ["User", "AdminAuditLog"] }),
  action(setUserBan, { entities: ["User", "AdminAuditLog"] }),
];
