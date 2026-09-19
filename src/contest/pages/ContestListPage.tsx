import { useState } from "react";
import { Award, Plus, Trophy } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "wasp/client/auth";
import { createContest, getContests, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../client/components/ui/dialog";
import { Input } from "../../client/components/ui/input";
import { RechargeRequiredDialog, type PaymentShortfall } from "../../bounty/components/RechargeRequiredDialog";
import { contestStatusLabel, prizeRankLabel } from "../labels";
import { formatPublicNo } from "../../shared/publicNo";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(cents / 100);
export function ContestListPage() {
  const { data: user } = useAuth();
  const [paymentShortfall, setPaymentShortfall] = useState<PaymentShortfall | null>(null);
  const query = useQuery(getContests, {});
  const now = new Date();
  const contests = ((query.data ?? []) as any[]).map((contest) => ({ ...contest, effectiveStatus: contest.status === "OPEN" && new Date(contest.submissionDeadline) <= now ? "JUDGING" : contest.status }));
  const openCount = contests.filter((contest) => contest.effectiveStatus === "OPEN").length;
  return <main className="market-page">
    <div className="market-page-header"><div><span className="market-eyebrow">创意比赛</span><h1>发现比赛</h1><p>{openCount} 个比赛正在征集作品，奖金均已提前托管。</p></div>{user ? <CreateContestDialog onCreated={() => void query.refetch()} onPaymentRequired={setPaymentShortfall} /> : <Link to={routes.LoginRoute.to}><Button size="lg">登录后发布</Button></Link>}</div>
    <div className="section-heading"><div><h2>比赛广场</h2><p>{query.isLoading ? "正在更新…" : `找到 ${contests.length} 个比赛`}</p></div><Link to={routes.TaskListRoute.to}>想看悬赏？</Link></div>
    {query.isLoading ? <div className="market-empty">正在加载比赛…</div> : query.error ? <div className="market-empty">加载失败，请稍后重试。</div> : !contests.length ? <div className="market-empty"><strong>暂时没有可展示的比赛</strong></div> : <section className="task-grid">{contests.map((contest) => <ContestCard key={contest.id} contest={contest} currentUserId={user?.id} />)}</section>}
    <RechargeRequiredDialog value={paymentShortfall} onOpenChange={(open) => { if (!open) setPaymentShortfall(null); }} />
  </main>;
}

function ContestCard({ contest, currentUserId }: { contest: any; currentUserId?: string }) {
  const isOpen = contest.effectiveStatus === "OPEN";
  return <Link className="task-card contest-card" to={routes.ContestDetailsRoute.build({ params: { id: contest.id } })}><div className="task-card-top"><span className={`state-pill ${isOpen ? "live" : ""}`}><i />{contestStatusLabel(contest.effectiveStatus)}</span><strong>{money(contest.totalPrizeCents)}</strong></div><div><span className="category-label">{formatPublicNo("contest", contest.publicNo)} · {contest.prizes.length} 个奖项</span><h3>{contest.title}</h3><p>{contest.description}</p></div><div className="contest-prizes">{contest.prizes.map((prize: any) => <span key={prize.id}><small>{prizeRankLabel(prize.rank)}</small><b>{money(prize.amountCents)}</b></span>)}</div><footer><div className="publisher-mini"><span>{(contest.publisher.username ?? "匿").slice(0, 1)}</span><div><b>{contest.publisher.username ?? "匿名发布者"}</b><small>{currentUserId === contest.publisherId ? "我发布的" : `${contest._count.entries} 份投稿`}</small></div></div><div className="deadline"><small>{isOpen ? "投稿截止" : "当前状态"}</small><b>{isOpen ? new Date(contest.submissionDeadline).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : contestStatusLabel(contest.effectiveStatus)}</b></div></footer></Link>;
}

function CreateContestDialog({ onCreated, onPaymentRequired }: { onCreated: () => void; onPaymentRequired: (value: PaymentShortfall) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deadline = toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError("");
    const values = new FormData(form);
    try {
      const contest: any = await createContest({ title: String(values.get("title")), description: String(values.get("description")), firstPrizeCents: Math.round(Number(values.get("firstPrize")) * 100), secondPrizeCents: optionalCents(values.get("secondPrize")), thirdPrizeCents: optionalCents(values.get("thirdPrize")), submissionDeadline: new Date(String(values.get("submissionDeadline"))) });
      setOpen(false); form.reset(); onCreated();
      if (contest.status === "PENDING_PAYMENT" && contest.paymentShortfall) onPaymentRequired({ ...contest.paymentShortfall, itemId: contest.id, kind: "contest" });
    } catch (exception: any) { setError(exception?.response?.data?.message ?? exception?.message ?? "创建比赛失败"); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus size={18} />发布比赛</Button></DialogTrigger><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>发布一个创意比赛</DialogTitle></DialogHeader><form className="create-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label>比赛标题<Input name="title" placeholder="例如：为新产品设计一句中文口号" required minLength={3} maxLength={120} /></label><label>比赛说明<textarea name="description" placeholder="说明主题、投稿要求和评选标准" required minLength={10} maxLength={20_000} /></label><div className="form-row"><label>一等奖（元）<Input name="firstPrize" type="number" min="0.01" step="0.01" required /></label><label>投稿截止<Input name="submissionDeadline" type="datetime-local" defaultValue={deadline} required /></label></div><div className="form-row"><label>二等奖（选填）<Input name="secondPrize" type="number" min="0.01" step="0.01" /></label><label>三等奖（选填）<Input name="thirdPrize" type="number" min="0.01" step="0.01" /></label></div><div className="escrow-summary"><Award /><div><strong>发布时托管全部奖池</strong><p>余额不足时会保存比赛并引导充值，不会丢失内容。</p></div></div>{error && <p className="form-error">{error}</p>}<Button className="w-full" size="lg" disabled={busy}><Trophy size={18} />{busy ? "发布中…" : "托管奖金并发布"}</Button></form></DialogContent></Dialog>;
}

function optionalCents(value: FormDataEntryValue | null) { const amount = Number(value); return amount > 0 ? Math.round(amount * 100) : undefined; }
function toLocalInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
