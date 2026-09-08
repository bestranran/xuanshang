import { useState } from "react";
import { useParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { cancelContest, getContestDetails, selectContestWinners, submitContest, submitContestEntry, useQuery } from "wasp/client/operations";
import { Link, routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { contestStatusLabel, prizeRankLabel } from "../labels";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);

export function ContestDetailsPage() {
  const { id = "" } = useParams();
  const { data: user } = useAuth();
  const query = useQuery(getContestDetails, { id });
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [winners, setWinners] = useState({ firstEntryId: "", secondEntryId: "", thirdEntryId: "" });
  if (query.isLoading) return <main className="p-10">正在加载…</main>;
  const contest = query.data as any;
  if (!contest) return <main className="p-10">未找到比赛</main>;
  const isPublisher = user?.id === contest.publisherId;
  const deadlinePassed = new Date(contest.submissionDeadline) <= new Date();
  const effectiveStatus = contest.status === "OPEN" && deadlinePassed ? "JUDGING" : contest.status;
  const ownEntry = contest.entries.find((entry: any) => entry.entrantId === user?.id);
  const hasAwards = contest.prizes.some((prize: any) => prize.award);
  const selectedWinnerIds = Object.values(winners).filter(Boolean);
  const winnersAreDistinct = new Set(selectedWinnerIds).size === selectedWinnerIds.length;
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await query.refetch(); }
    catch (error: any) { setError(error?.response?.data?.message ?? error?.message ?? "操作失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
    <div><span className="text-sm font-medium text-violet-600">{contestStatusLabel(effectiveStatus)}</span><h1 className="mt-2 text-4xl font-bold">{contest.title}</h1><p className="mt-3 text-muted-foreground">总奖池 {money(contest.totalPrizeCents)} · 投稿截止 {new Date(contest.submissionDeadline).toLocaleString("zh-CN")}</p></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
    {isPublisher && contest.status === "PENDING_PAYMENT" && <Card><CardHeader><CardTitle>奖池余额不足</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void run(() => submitContest({ contestId: contest.id }))}>重新托管并发布</Button><Link to={routes.WalletRoute.to}><Button variant="outline">前往余额中心</Button></Link><Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelContest({ contestId: contest.id }))}>取消比赛</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>比赛说明</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap">{contest.description}</CardContent></Card>
    <Card><CardHeader><CardTitle>奖金设置</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{contest.prizes.map((prize: any) => <div key={prize.id} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{prizeRankLabel(prize.rank)}</p><p className="mt-1 text-2xl font-bold text-amber-600">{money(prize.amountCents)}</p>{prize.winner && <div className="mt-3 text-sm"><strong>{prize.winner.entrant.username ?? "匿名参赛者"}</strong><p className="text-xs text-muted-foreground">{prize.award?.status === "CREDITED" ? "奖金已入账" : prize.award?.status === "BLOCKED" ? "奖励已拦截" : "奖励冷却中"}</p></div>}</div>)}</CardContent></Card>
    {user && !isPublisher && contest.status === "OPEN" && !deadlinePassed && <Card><CardHeader><CardTitle>{ownEntry ? "更新我的投稿" : "参加比赛"}</CardTitle></CardHeader><CardContent className="space-y-3">{ownEntry && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><strong>投稿已保存</strong><p className="mt-1 whitespace-pre-wrap">{ownEntry.content}</p></div>}<textarea className="min-h-40 w-full rounded-md border bg-transparent p-3" value={content} onChange={(event) => setContent(event.target.value)} placeholder="填写作品说明、链接或交付内容" /><Button disabled={busy || content.trim().length < 10} onClick={() => void run(() => submitContestEntry({ contestId: contest.id, content }))}>{ownEntry ? "更新投稿" : "提交作品"}</Button></CardContent></Card>}
    {(isPublisher || deadlinePassed) && contest.entries.length > 0 && <Card><CardHeader><CardTitle>参赛作品（{contest.entries.length}）</CardTitle></CardHeader><CardContent className="space-y-3">{contest.entries.map((entry: any) => <div key={entry.id} className="rounded-xl border p-4"><strong>{entry.entrant.username ?? "匿名参赛者"}</strong><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p></div>)}</CardContent></Card>}
    {isPublisher && deadlinePassed && ["OPEN", "JUDGING"].includes(contest.status) && !hasAwards && <Card><CardHeader><CardTitle>评选获奖者</CardTitle></CardHeader><CardContent className="space-y-4">{contest.entries.length < 3 ? <p className="text-sm text-amber-700">至少需要 3 位不同参赛者，才能分别评出一、二、三等奖。</p> : <><div className="grid gap-3 sm:grid-cols-3">{(["firstEntryId", "secondEntryId", "thirdEntryId"] as const).map((key, index) => <label key={key} className="space-y-1 text-sm"><span>{["一等奖", "二等奖", "三等奖"][index]}</span><select className="h-10 w-full rounded-md border bg-background px-3" value={winners[key]} onChange={(event) => setWinners((value) => ({ ...value, [key]: event.target.value }))}><option value="">选择参赛者</option>{contest.entries.map((entry: any) => <option key={entry.id} value={entry.id}>{entry.entrant.username ?? entry.id.slice(0, 8)}</option>)}</select></label>)}</div><p className={`text-xs ${winnersAreDistinct ? "text-muted-foreground" : "text-destructive"}`}>{winnersAreDistinct ? "每个奖项只能有一位获奖者，同一参赛者不能重复获奖。确认后进入 24 小时奖励冷却。" : "同一参赛者不能重复获得多个奖项，请重新选择。"}</p><Button disabled={busy || !winners.firstEntryId || !winners.secondEntryId || !winners.thirdEntryId || !winnersAreDistinct} onClick={() => void run(() => selectContestWinners({ contestId: contest.id, ...winners }))}>确认全部获奖者</Button></>}</CardContent></Card>}
  </main>;
}
