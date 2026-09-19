import { page, route, type Spec } from "@wasp.sh/spec";
import { AdminEntryPage } from "./AdminEntryPage" with { type: "ref" };

export const adminSpec: Spec = [
  route("AdminRoute", "/xg-7f3c9a", page(AdminEntryPage)),
  route("AdminTasksRoute", "/xg-7f3c9a/tasks", page(AdminEntryPage)),
  route("AdminContestsRoute", "/xg-7f3c9a/contests", page(AdminEntryPage)),
  route("AdminWithdrawalsRoute", "/xg-7f3c9a/withdrawals", page(AdminEntryPage)),
  route("AdminAwardsRoute", "/xg-7f3c9a/awards", page(AdminEntryPage)),
  route("AdminUsersRoute", "/xg-7f3c9a/users", page(AdminEntryPage)),
  route("AdminUserDetailsRoute", "/xg-7f3c9a/users/:id", page(AdminEntryPage)),
  route("AdminAuditRoute", "/xg-7f3c9a/audit", page(AdminEntryPage)),
  route("AdminLedgerRoute", "/xg-7f3c9a/ledger", page(AdminEntryPage)),
  route("AdminSettingsRoute", "/xg-7f3c9a/settings", page(AdminEntryPage)),
  route("AdminAnnouncementsRoute", "/xg-7f3c9a/announcements", page(AdminEntryPage)),
  route("AdminGiftCardsRoute", "/xg-7f3c9a/gift-cards", page(AdminEntryPage)),
];
