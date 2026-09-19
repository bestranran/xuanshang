export type PublicNoKind = "user" | "task" | "contest" | "recharge" | "withdrawal" | "giftCardBatch" | "giftCard";

const prefixes: Record<PublicNoKind, string> = {
  user: "U",
  task: "B",
  contest: "C",
  recharge: "R",
  withdrawal: "W",
  giftCardBatch: "GB",
  giftCard: "GC",
};

export function formatPublicNo(kind: PublicNoKind, value: number | null | undefined) {
  return value == null ? "—" : `${prefixes[kind]}${String(value).padStart(6, "0")}`;
}
