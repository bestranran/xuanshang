import { describe, expect, it } from "vitest";
import { assertTaskTransition, canTransitionTask } from "./taskState";

describe("task state machine", () => {
  it.each([
    ["OPEN", "CLAIMED"],
    ["CLAIMED", "SUBMITTED"],
    ["SUBMITTED", "REVISION_REQUESTED"],
    ["SUBMITTED", "REJECTED_PENDING_APPEAL"],
    ["REJECTED_PENDING_APPEAL", "APPEALED"],
    ["APPEALED", "COOLING"],
    ["COOLING", "COMPLETED"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionTask(from, to)).toBe(true);
  });

  it.each([
    ["OPEN", "COMPLETED"],
    ["CLAIMED", "COOLING"],
    ["COMPLETED", "OPEN"],
    ["REFUNDED", "CLAIMED"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(() => assertTaskTransition(from, to)).toThrow("Invalid task transition");
  });
});
