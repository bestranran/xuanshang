export type ContestPrizeRank = "FIRST" | "SECOND" | "THIRD";

export function calculateContestPrizeTotal(prizeCents: readonly number[]) {
  if (
    prizeCents.length !== 3 ||
    prizeCents.some((amount) => !Number.isSafeInteger(amount) || amount <= 0)
  ) {
    throw new Error("contest prizes must contain three positive integer amounts");
  }
  const total = prizeCents.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error("contest prize total is unsafe");
  return total;
}

export function assertDistinctContestWinners(entryIds: readonly string[]) {
  if (entryIds.length !== 3 || new Set(entryIds).size !== 3) {
    throw new Error("contest winners must be three distinct entries");
  }
}

export function buildContestPrizeSelections(
  firstEntryId: string,
  secondEntryId: string,
  thirdEntryId: string,
): readonly (readonly [ContestPrizeRank, string])[] {
  const entryIds = [firstEntryId, secondEntryId, thirdEntryId] as const;
  assertDistinctContestWinners(entryIds);
  return [
    ["FIRST", firstEntryId],
    ["SECOND", secondEntryId],
    ["THIRD", thirdEntryId],
  ] as const;
}
