import { action, page, query, route, type Spec } from "@wasp.sh/spec";

import { ContestDetailsPage } from "./pages/ContestDetailsPage" with { type: "ref" };
import { ContestListPage } from "./pages/ContestListPage" with { type: "ref" };
import {
  cancelContest,
  closeContest,
  createContest,
  getContestDetails,
  getContests,
  selectContestWinners,
  setContestAwardBlocked,
  submitContest,
  submitContestEntry,
} from "./operations" with { type: "ref" };

const entities = ["User", "Contest", "ContestPrize", "ContestEntry", "ContestEscrow", "ContestAward", "WalletAccount", "WalletEntry", "AdminAuditLog"] as const;

export const contestSpec: Spec = [
  route("ContestListRoute", "/contests", page(ContestListPage)),
  route("ContestDetailsRoute", "/contests/:id", page(ContestDetailsPage)),
  query(getContests, { entities: [...entities] }),
  query(getContestDetails, { entities: [...entities] }),
  action(createContest, { entities: [...entities] }),
  action(submitContest, { entities: [...entities] }),
  action(cancelContest, { entities: [...entities] }),
  action(submitContestEntry, { entities: [...entities] }),
  action(selectContestWinners, { entities: [...entities] }),
  action(closeContest, { entities: [...entities] }),
  action(setContestAwardBlocked, { entities: [...entities] }),
];
