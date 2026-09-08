import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "wasp/client/auth";
import { createContest, getContests, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { contestStatusLabel, prizeRankLabel } from "../labels";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);

export function ContestListPage() {
  const { data: user } = useAuth();
  const [search, setSearch] = useState("");
  const query = useQuery(getContests, { search });
  const contests = (query.data ?? []) as any[];
  return <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
    <section className="rounded-3xl bg-gradient-to-br from-violet-950 via-slate-950 to-amber-950 px-8 py-12 text-white"><p className="mb-3 text-sm font-semibold tracking-[0.2em] text-amber-300">创意比赛</p><h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">同题竞技，三个奖项</h1><p className="mt-5 max-w-2xl text-slate-300">发布者设置一、二、三等奖奖金，所有参赛者直接投稿，截止后统一评奖。</p></section>
    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索比赛标题" />
    {user && <CreateContestCard onCreated={() => void query.refetch()} />}
    <section className="grid gap-4 md:grid-cols-2">{query.isLoading ? <p>正在加载…</p> : contests.map((contest) => {
      const effectiveStatus = contest.status === "OPEN" && new Date(contest.submissionDeadline) <= new Date() ? "JUDGING" : contest.status;
      return <Link key={contest.id} to={routes.ContestDetailsRoute.build({ params: { id: contest.id } })}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg"><CardHeader><CardTitle>{contest.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="line-clamp-2 text-sm text-muted-foreground">{contest.description}</p><div className="grid grid-cols-3 gap-2">{contest.prizes.map((prize: any) => <div key={prize.id} className="rounded-lg bg-muted p-2 text-center text-xs"><span className="block text-muted-foreground">{prizeRankLabel(prize.rank)}</span><strong>{money(prize.amountCents)}</strong></div>)}</div><div className="flex items-center justify-between"><strong className="text-amber-600">奖池 {money(contest.totalPrizeCents)}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">{contestStatusLabel(effectiveStatus)}</span></div>{contest.publisherId === user?.id && <p className="text-xs font-medium text-blue-600">我发布的比赛</p>}<p className="text-xs text-muted-foreground">{contest._count.entries} 份投稿 · {contest.publisher.username ?? "匿名用户"}</p></CardContent></Card></Link>;
    })}</section>
  </main>;
}

function CreateContestCard({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const deadline = toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError(""); setResult(null);
    const values = new FormData(form);
    try {
      const contest: any = await createContest({
        title: String(values.get("title")),
        description: String(values.get("description")),
        firstPrizeCents: Math.round(Number(values.get("firstPrize")) * 100),
        secondPrizeCents: Math.round(Number(values.get("secondPrize")) * 100),
        thirdPrizeCents: Math.round(Number(values.get("thirdPrize")) * 100),
        submissionDeadline: new Date(String(values.get("submissionDeadline"))),
      });
      setResult(contest); form.reset(); onCreated();
    } catch (error: any) { setError(error?.response?.data?.message ?? error?.message ?? "创建比赛失败"); }
    finally { setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>发布新比赛</CardTitle></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><Input className="md:col-span-2" name="title" placeholder="比赛标题" required minLength={3} /><label className="space-y-1 text-sm"><span className="text-muted-foreground">投稿截止时间</span><Input name="submissionDeadline" type="datetime-local" defaultValue={deadline} required /></label><Input name="firstPrize" type="number" min="0.01" step="0.01" placeholder="一等奖奖金（元）" required /><Input name="secondPrize" type="number" min="0.01" step="0.01" placeholder="二等奖奖金（元）" required /><Input name="thirdPrize" type="number" min="0.01" step="0.01" placeholder="三等奖奖金（元）" required /><textarea name="description" className="min-h-32 rounded-md border bg-transparent p-3 md:col-span-3" placeholder="比赛主题、投稿要求和评奖标准" required minLength={10} />{error && <p className="text-sm text-destructive md:col-span-3">{error}</p>}{result && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 md:col-span-3 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{result.status === "PENDING_PAYMENT" ? <><strong>比赛已保存，但奖池余额不足。</strong><p className="mt-1">充值后可在比赛详情重新提交。</p></> : <><strong>比赛已直接发布。</strong><p className="mt-1">参赛者现在就可以投稿，无需后台预审。</p></>}<Link className="mt-2 inline-block font-semibold underline" to={routes.ContestDetailsRoute.build({ params: { id: result.id } })}>查看比赛</Link></div>}<Button className="md:col-span-3" disabled={busy}>{busy ? "发布中…" : "托管奖金并直接发布"}</Button></form></CardContent></Card>;
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
