import { useState } from "react";
import { createBountyTask, getTasks, submitBountyTask, useQuery } from "wasp/client/operations";
import { Link } from "react-router";
import { routes } from "wasp/client/router";
import { useAuth } from "wasp/client/auth";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { statusLabel } from "../labels";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);

export function TaskListPage() {
  const { data: user } = useAuth();
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery(getTasks, { search });
  const tasks = (data ?? []) as any[];
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <section className="rounded-3xl bg-slate-950 px-8 py-12 text-white">
        <p className="mb-3 text-sm font-semibold tracking-[0.2em] text-amber-300">悬赏平台</p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">把明确的成果，交给合适的人</h1>
        <p className="mt-5 max-w-2xl text-slate-300">单人悬赏、资金托管、交付验收。充值本金只用于发布，任务收益可累计提现。</p>
      </section>
      <div className="flex gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索悬赏标题" />
        {user && <Link to={routes.WalletRoute.to}><Button variant="outline">余额中心</Button></Link>}
      </div>
      {user && <CreateTaskCard onCreated={() => void refetch()} />}
      <section className="grid gap-4 md:grid-cols-2">
        {isLoading ? <p>正在加载…</p> : tasks.map((task) => (
          <Link key={task.id} to={routes.TaskDetailsRoute.build({ params: { id: task.id } })}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
              <CardHeader><CardTitle>{task.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                <div className="flex items-center justify-between"><strong className="text-lg text-amber-600">{money(task.budgetCents)}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">{statusLabel(task.status === "JUDGING" && task.award ? task.award.status : task.status)}</span></div>
                {task.publisherId === user?.id && <p className="text-xs font-medium text-blue-600">我发布的任务</p>}
                <p className="text-xs text-muted-foreground">{task._count.applications} 人报名 · {task.publisher.username ?? "匿名用户"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}

function CreateTaskCard({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ status: string; taskId: string } | null>(null);
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError(""); setResult(null);
    const values = new FormData(form);
    try {
      const task: any = await createBountyTask({
        title: String(values.get("title")), description: String(values.get("description")),
        budgetCents: Math.round(Number(values.get("budget")) * 100),
        applicationDeadline: new Date(String(values.get("applicationDeadline"))),
        deliveryDeadline: new Date(String(values.get("deliveryDeadline"))),
      });
      const submitted: any = await submitBountyTask({ taskId: task.id });
      setResult({ status: submitted.status, taskId: task.id });
      form.reset();
      onCreated();
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "创建失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  const now = new Date();
  const minDate = toLocalInput(new Date(now.getTime() + 5 * 60 * 1000));
  const defaultApplication = toLocalInput(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  const defaultDelivery = toLocalInput(new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000));
  return <Card><CardHeader><CardTitle>发布新悬赏</CardTitle></CardHeader><CardContent>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(e.currentTarget); }}>
      <Input name="title" placeholder="标题" required minLength={3} />
      <Input name="budget" type="number" min="0.01" step="0.01" placeholder="预算（元）" required />
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">报名截止时间</span><Input name="applicationDeadline" type="datetime-local" min={minDate} defaultValue={defaultApplication} required /></label>
      <label className="space-y-1 text-sm"><span className="text-muted-foreground">交付截止时间</span><Input name="deliveryDeadline" type="datetime-local" min={minDate} defaultValue={defaultDelivery} required /></label>
      <textarea name="description" className="min-h-28 rounded-md border bg-transparent p-3 md:col-span-2" placeholder="描述交付目标和验收标准" required minLength={10} />
      {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
      {result && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 md:col-span-2 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        {result.status === "PENDING_PAYMENT" ? <><strong>任务已保存，但余额不足。</strong><p className="mt-1">充值后回到任务详情重新提交审核。</p><Link className="mt-2 inline-block font-semibold underline" to={routes.WalletRoute.to}>前往余额中心</Link></> : <><strong>发布成功，已提交平台审核。</strong><p className="mt-1">审核通过后会出现在悬赏大厅。</p><Link className="mt-2 inline-block font-semibold underline" to={routes.TaskDetailsRoute.build({ params: { id: result.taskId } })}>查看任务</Link></>}
      </div>}
      <Button className="md:col-span-2" disabled={busy}>{busy ? "提交中…" : "创建并提交审核"}</Button>
    </form>
  </CardContent></Card>;
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
