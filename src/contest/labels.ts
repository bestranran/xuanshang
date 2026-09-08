const labels: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_PAYMENT: "待支付",
  OPEN: "征集中",
  JUDGING: "评奖中",
  COOLING: "奖励冷却中",
  COMPLETED: "已结束",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
  CLOSED: "已关闭",
};

export const contestStatusLabel = (status: string) => labels[status] ?? status;
export const prizeRankLabel = (rank: string) => ({ FIRST: "一等奖", SECOND: "二等奖", THIRD: "三等奖" })[rank] ?? rank;
