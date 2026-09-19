import type { TaskStatus } from "@prisma/client";

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  DRAFT: ["PENDING_PAYMENT", "PENDING_REVIEW", "CANCELLED"],
  PENDING_PAYMENT: ["PENDING_REVIEW", "CANCELLED"],
  PENDING_REVIEW: ["OPEN", "REFUNDED", "CLOSED"],
  OPEN: ["CLAIMED", "REFUNDED", "CLOSED"],
  CLAIMED: ["OPEN", "SUBMITTED", "REFUNDED", "CLOSED"],
  SUBMITTED: ["REVISION_REQUESTED", "REJECTED_PENDING_APPEAL", "COOLING", "REFUNDED", "CLOSED"],
  REVISION_REQUESTED: ["SUBMITTED", "REFUNDED", "CLOSED"],
  REJECTED_PENDING_APPEAL: ["APPEALED", "OPEN", "REFUNDED", "CLOSED"],
  APPEALED: ["OPEN", "COOLING", "REFUNDED", "CLOSED"],
  COOLING: ["COMPLETED", "CLOSED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
  CLOSED: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) throw new Error(`Invalid task transition: ${from} -> ${to}`);
}

export const publicTaskStatuses: readonly TaskStatus[] = [
  "OPEN", "CLAIMED", "SUBMITTED", "REVISION_REQUESTED", "REJECTED_PENDING_APPEAL", "APPEALED", "COOLING", "COMPLETED",
];
