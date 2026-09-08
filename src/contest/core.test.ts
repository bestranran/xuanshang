import { describe, expect, it } from "vitest";
import {
  assertDistinctContestWinners,
  buildContestPrizeSelections,
  calculateContestPrizeTotal,
} from "./core";

describe("contest prize rules", () => {
  it("adds the three prize amounts", () => {
    expect(calculateContestPrizeTotal([300, 200, 100])).toBe(600);
  });

  it.each([[[300, 200]], [[300, 0, 100]], [[300, 10.5, 100]]])(
    "rejects an invalid prize configuration: %j",
    (amounts) => {
      expect(() => calculateContestPrizeTotal(amounts)).toThrow();
    },
  );

  it("requires three different winning entries", () => {
    expect(() => assertDistinctContestWinners(["entry-a", "entry-b", "entry-a"])).toThrow(
      "three distinct entries",
    );
    expect(() => assertDistinctContestWinners(["entry-a", "entry-b", "entry-c"])).not.toThrow();
  });

  it("maps each winner to exactly one fixed rank", () => {
    expect(buildContestPrizeSelections("entry-a", "entry-b", "entry-c")).toEqual([
      ["FIRST", "entry-a"],
      ["SECOND", "entry-b"],
      ["THIRD", "entry-c"],
    ]);
  });
});
