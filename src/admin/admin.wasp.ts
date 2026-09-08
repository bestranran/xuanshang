import { page, route, type Spec } from "@wasp.sh/spec";
import { AdminPage } from "../bounty/pages/AdminPage" with { type: "ref" };

export const adminSpec: Spec = [
  route("AdminRoute", "/admin", page(AdminPage, { authRequired: true })),
  route("AdminTasksRoute", "/admin/tasks", page(AdminPage, { authRequired: true })),
  route("AdminContestsRoute", "/admin/contests", page(AdminPage, { authRequired: true })),
  route("AdminWithdrawalsRoute", "/admin/withdrawals", page(AdminPage, { authRequired: true })),
  route("AdminAwardsRoute", "/admin/awards", page(AdminPage, { authRequired: true })),
  route("AdminUsersRoute", "/admin/users", page(AdminPage, { authRequired: true })),
  route("AdminAuditRoute", "/admin/audit", page(AdminPage, { authRequired: true })),
];
