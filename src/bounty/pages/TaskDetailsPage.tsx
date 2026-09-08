import { useState } from "react";
import { useParams } from "react-router";
import { applyToTask, cancelBountyTask, confirmDelivery, getTaskDetails, selectApplication, submitBountyTask, submitDelivery, useQuery } from "wasp/client/operations";
import { useAuth } from "wasp/client/auth";
import { Link, routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { statusLabel } from "../labels";

export function TaskDetailsPage() {
  const { id = "" } = useParams();
  const { data: user } = useAuth();
  const { data, isLoading } = useQuery(getTaskDetails, { id });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return <main className="p-10">正在加载…</main>;
  const task = data as any;
  if (!task) return <main className="p-10">未找到任务</main>;
  const isPublisher = user?.id === task.publisherId;
  const ownApplication = task.applications.find((item: any) => item.applicantId === user?.id);
  const selected = task.applications.find((item: any) => item.status === "SELECTED");
  const isWorker = Boolean(user && selected?.applicantId === user.id);
  const displayStatus = task.award && task.status === "JUDGING" ? (task.award.status === "BLOCKED" ? "奖励已拦截" : "奖励冷却中") : statusLabel(task.status);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); location.reload(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "操作失败，请稍后重试"); setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
    <div><span className="text-sm text-amber-600">{displayStatus}</span><h1 className="mt-2 text-4xl font-bold">{task.title}</h1><p className="mt-3 text-muted-foreground">预算 ¥{(task.budgetCents / 100).toFixed(2)} · 报名截止 {new Date(task.applicationDeadline).toLocaleString("zh-CN")} · 交付截止 {new Date(task.deliveryDeadline).toLocaleString("zh-CN")}</p></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
    {isPublisher && ["DRAFT", "PENDING_PAYMENT"].includes(task.status) && <Card><CardHeader><CardTitle>{task.status === "PENDING_PAYMENT" ? "余额不足，任务尚未提交审核" : "任务尚未提交审核"}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => run(() => submitBountyTask({ taskId: task.id }))}>重新提交审核</Button><Link to={routes.WalletRoute.to}><Button variant="outline">前往余额中心</Button></Link><Button disabled={busy} variant="destructive" onClick={() => run(() => cancelBountyTask({ taskId: task.id }))}>取消任务</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle>任务说明</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap">{task.description}</CardContent></Card>
    {user && task.status === "OPEN" && !isPublisher && <Card><CardHeader><CardTitle>{ownApplication ? "我的报名" : "报名"}</CardTitle></CardHeader><CardContent className="space-y-3">{ownApplication && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><strong>报名已提交</strong><p className="mt-1 whitespace-pre-wrap">{ownApplication.message}</p></div>}<textarea className="min-h-28 w-full rounded-md border bg-transparent p-3" value={text} onChange={(e) => setText(e.target.value)} placeholder={ownApplication ? "填写新的报名说明以更新" : "说明你的方案、经验和预计完成方式"} /><Button disabled={busy} onClick={() => run(() => applyToTask({ taskId: task.id, message: text }))}>{ownApplication ? "更新报名" : "提交报名"}</Button></CardContent></Card>}
    {isPublisher && task.applications.length > 0 && <Card><CardHeader><CardTitle>报名者</CardTitle></CardHeader><CardContent className="space-y-3">{task.applications.map((item: any) => <div className="flex items-start justify-between gap-4 border-b pb-3" key={item.id}><div><strong>{item.applicant.username ?? "匿名用户"}</strong><p className="text-sm text-muted-foreground">{item.message}</p></div>{task.status === "OPEN" && <Button size="sm" onClick={() => run(() => selectApplication({ applicationId: item.id }))}>选择</Button>}</div>)}</CardContent></Card>}
    {isWorker && ["IN_PROGRESS", "JUDGING"].includes(task.status) && <Card><CardHeader><CardTitle>交付成果</CardTitle></CardHeader><CardContent className="space-y-3"><textarea className="min-h-36 w-full rounded-md border bg-transparent p-3" value={text} onChange={(e) => setText(e.target.value)} placeholder="成果说明或链接"/><Button disabled={busy} onClick={() => run(() => submitDelivery({ taskId: task.id, content: text }))}>保存交付</Button></CardContent></Card>}
    {isPublisher && task.status === "JUDGING" && task.submission && <Card><CardHeader><CardTitle>验收成果</CardTitle></CardHeader><CardContent className="space-y-4"><p className="whitespace-pre-wrap">{task.submission.content}</p>{task.award ? <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100"><strong>{task.award.status === "BLOCKED" ? "奖励已被管理员拦截" : "验收成功，奖励冷却中"}</strong><p className="mt-1">{task.award.status === "BLOCKED" ? task.award.blockedReason : `预计 ${new Date(task.award.availableAt).toLocaleString("zh-CN")} 自动入账`}</p></div> : <Button disabled={busy} onClick={() => run(() => confirmDelivery({ taskId: task.id }))}>确认并进入 24 小时冷却</Button>}</CardContent></Card>}
  </main>;
}
