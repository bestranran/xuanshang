import { useState } from "react";
import { useParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { answerContestQuestion, askContestQuestion, cancelContest, getContestDetails, selectContestWinners, setContestEntryFeedback, submitContest, submitContestEntry, useQuery } from "wasp/client/operations";
import { Link, routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { contestStatusLabel, prizeRankLabel } from "../labels";
import { formatPublicNo } from "../../shared/publicNo";
import { BusinessFileList, BusinessFileUploader } from "../../file-upload/BusinessFileAttachments";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);

export function ContestDetailsPage() {
  const { id = "" } = useParams();
  const { data: user } = useAuth();
  const query = useQuery(getContestDetails, { id });
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [winners, setWinners] = useState({ firstEntryId: "", secondEntryId: "", thirdEntryId: "" });
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [fileIds, setFileIds] = useState<string[]>([]);
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
  const winnerKeyByRank = { FIRST: "firstEntryId", SECOND: "secondEntryId", THIRD: "thirdEntryId" } as const;
  const configuredKeys = contest.prizes.map((prize: any) => winnerKeyByRank[prize.rank as keyof typeof winnerKeyByRank]);
  const allConfiguredWinnersSelected = configuredKeys.every((key: keyof typeof winners) => winners[key]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await query.refetch(); }
    catch (error: any) { setError(error?.response?.data?.message ?? error?.message ?? "操作失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
    <div><span className="text-sm font-medium text-violet-600">{contestStatusLabel(effectiveStatus)} · {formatPublicNo("contest", contest.publicNo)}</span><h1 className="mt-2 text-4xl font-bold">{contest.title}</h1><p className="mt-3 text-muted-foreground">总奖池 {money(contest.totalPrizeCents)} · 投稿截止 {new Date(contest.submissionDeadline).toLocaleString("zh-CN")}</p></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
    {isPublisher && contest.status === "PENDING_PAYMENT" && <Card><CardHeader><CardTitle>奖池余额不足</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void run(() => submitContest({ contestId: contest.id }))}>重新托管并发布</Button><Link to={routes.WalletRoute.to}><Button variant="outline">前往余额中心</Button></Link><Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelContest({ contestId: contest.id }))}>取消比赛</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>比赛说明</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap">{contest.description}</CardContent></Card>
    <Card><CardHeader><CardTitle>奖金设置</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{contest.prizes.map((prize: any) => <div key={prize.id} className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">{prizeRankLabel(prize.rank)}</p><p className="mt-1 text-2xl font-bold text-amber-600">{money(prize.amountCents)}</p>{prize.winner && <div className="mt-3 text-sm"><strong>{prize.winner.entrant.username ?? "匿名参赛者"}</strong><p className="text-xs text-muted-foreground">{prize.award?.status === "CREDITED" ? "奖金已入账" : prize.award?.status === "BLOCKED" ? "奖励已拦截" : "奖励冷却中"}</p></div>}</div>)}</CardContent></Card>
    {user && !isPublisher && contest.status === "OPEN" && !deadlinePassed && <Card><CardHeader><CardTitle>{ownEntry ? "更新我的投稿" : "参加比赛"}</CardTitle></CardHeader><CardContent className="space-y-3">{ownEntry && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><strong>投稿已保存</strong><p className="mt-1 whitespace-pre-wrap">{ownEntry.content}</p><BusinessFileList files={ownEntry.versions?.slice(-1)[0]?.files ?? []} /></div>}<textarea className="min-h-40 w-full rounded-md border bg-transparent p-3" value={content} onChange={(event) => setContent(event.target.value)} placeholder="填写作品说明、链接或交付内容" /><BusinessFileUploader key={`contest-${contest.id}-${ownEntry?.versions?.length ?? 0}`} targetType="CONTEST" targetId={contest.id} onChange={setFileIds} /><Button disabled={busy || content.trim().length < 10} onClick={() => void run(() => submitContestEntry({ contestId: contest.id, content, fileIds }))}>{ownEntry ? "更新投稿" : "提交作品"}</Button></CardContent></Card>}
    {(isPublisher || ["COOLING", "COMPLETED"].includes(contest.status)) && contest.entries.length > 0 && <Card><CardHeader><CardTitle>{["COOLING", "COMPLETED"].includes(contest.status) ? "公开作品墙" : `评审作品（${contest.entries.length}）`}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{contest.entries.map((entry: any) => <div key={entry.id} className={`rounded-xl border p-4 ${entry.shortlisted ? "border-amber-400 bg-amber-50/60" : ""}`}><div className="flex items-center justify-between"><strong>{entry.entrant.username ?? "匿名参赛者"}</strong>{entry.shortlisted && <span className="text-xs font-semibold text-amber-700">入围</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p><BusinessFileList files={entry.versions?.slice(-1)[0]?.files ?? []} />{(isPublisher || ["COOLING", "COMPLETED"].includes(contest.status)) && entry.privateFeedback && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">发布者反馈：{entry.privateFeedback}</p>}{isPublisher && deadlinePassed && !hasAwards && <div className="mt-3 space-y-2"><Input value={feedbackDrafts[entry.id] ?? entry.privateFeedback ?? ""} onChange={(event) => setFeedbackDrafts((drafts) => ({ ...drafts, [entry.id]: event.target.value }))} placeholder="给参赛者的反馈（获奖后公开）" /><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void run(() => setContestEntryFeedback({ entryId: entry.id, shortlisted: !entry.shortlisted, feedback: feedbackDrafts[entry.id] ?? entry.privateFeedback ?? undefined }))}>{entry.shortlisted ? "取消入围" : "加入入围"}</Button><Button size="sm" variant="outline" onClick={() => void run(() => setContestEntryFeedback({ entryId: entry.id, shortlisted: entry.shortlisted, feedback: feedbackDrafts[entry.id] || undefined }))}>保存反馈</Button></div></div>}</div>)}</CardContent></Card>}
    <Card><CardHeader><CardTitle>公开问答（{contest.questions.length}）</CardTitle></CardHeader><CardContent className="space-y-4">{contest.questions.map((item: any) => <div key={item.id} className="border-b pb-3"><p><strong>{item.asker.username ?? "平台用户"}</strong>：{item.question}</p>{item.answer ? <p className="mt-2 text-sm text-muted-foreground">发布者回答：{item.answer}</p> : isPublisher ? <div className="mt-2 flex gap-2"><Input value={answers[item.id] ?? ""} onChange={(event) => setAnswers({ ...answers, [item.id]: event.target.value })} placeholder="公开回答" /><Button disabled={(answers[item.id]?.trim().length ?? 0) < 2} onClick={() => void run(() => answerContestQuestion({ questionId: item.id, answer: answers[item.id] }))}>回答</Button></div> : <small className="text-muted-foreground">等待回答</small>}</div>)}{user && !isPublisher && contest.status === "OPEN" && !deadlinePassed && <div className="flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="公开询问比赛要求" /><Button disabled={question.trim().length < 3} onClick={() => void run(async () => { await askContestQuestion({ contestId: contest.id, question }); setQuestion(""); })}>提问</Button></div>}</CardContent></Card>
    {isPublisher && deadlinePassed && ["OPEN", "JUDGING"].includes(contest.status) && !hasAwards && <Card><CardHeader><CardTitle>评选获奖者</CardTitle></CardHeader><CardContent className="space-y-4">{contest.entries.length < contest.prizes.length ? <p className="text-sm text-amber-700">参赛作品数量不足以分配全部奖项。</p> : <><div className="grid gap-3 sm:grid-cols-3">{configuredKeys.map((key: keyof typeof winners) => { const index = ["firstEntryId", "secondEntryId", "thirdEntryId"].indexOf(key); return <label key={key} className="space-y-1 text-sm"><span>{["一等奖", "二等奖", "三等奖"][index]}</span><select className="h-10 w-full rounded-md border bg-background px-3" value={winners[key]} onChange={(event) => setWinners((value) => ({ ...value, [key]: event.target.value }))}><option value="">选择参赛者</option>{contest.entries.map((entry: any) => <option key={entry.id} value={entry.id}>{entry.shortlisted ? "★ " : ""}{entry.entrant.username ?? entry.id.slice(0, 8)}</option>)}</select></label>; })}</div><p className={`text-xs ${winnersAreDistinct ? "text-muted-foreground" : "text-destructive"}`}>{winnersAreDistinct ? "每个奖项对应一位不同获奖者。确认后进入 24 小时奖励冷却。" : "同一参赛者不能重复获奖。"}</p><Button disabled={busy || !allConfiguredWinnersSelected || !winnersAreDistinct} onClick={() => void run(() => selectContestWinners({ contestId: contest.id, firstEntryId: winners.firstEntryId, secondEntryId: winners.secondEntryId || undefined, thirdEntryId: winners.thirdEntryId || undefined }))}>确认全部获奖者</Button></>}</CardContent></Card>}
  </main>;
}
