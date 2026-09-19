import { useMemo, useState } from "react";
import { ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { createBountyTask, getTasks, submitBountyTask, useQuery } from "wasp/client/operations";
import { Link } from "react-router";
import { routes } from "wasp/client/router";
import { useAuth } from "wasp/client/auth";
import { Button } from "../../client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../client/components/ui/dialog";
import { Input } from "../../client/components/ui/input";
import { statusLabel } from "../labels";
import { RechargeRequiredDialog, type PaymentShortfall } from "../components/RechargeRequiredDialog";
import { formatPublicNo } from "../../shared/publicNo";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(cents / 100);
export function TaskListPage() {
  const { data: user } = useAuth();
  const [paymentShortfall, setPaymentShortfall] = useState<PaymentShortfall | null>(null);
  const query = useQuery(getTasks, {});
  const tasks = (query.data ?? []) as any[];
  const openCount = useMemo(() => tasks.filter((task) => task.status === "OPEN").length, [tasks]);

  return <main className="market-page">
    <div className="market-page-header"><div><span className="market-eyebrow">成果悬赏</span><h1>发现悬赏</h1><p>{openCount} 个悬赏可以立即接取，奖励均由平台托管。</p></div>{user ? <CreateTaskDialog onCreated={() => void query.refetch()} onPaymentRequired={setPaymentShortfall} /> : <Link to={routes.LoginRoute.to}><Button size="lg">登录后发布</Button></Link>}</div>

    <div className="section-heading"><div><h2>悬赏广场</h2><p>{query.isLoading ? "正在更新…" : `找到 ${tasks.length} 个悬赏`}</p></div><Link to={routes.ContestListRoute.to}>想看比赛？<ArrowRight size={16} /></Link></div>
    {query.isLoading ? <div className="market-empty">正在加载悬赏…</div> : query.error ? <div className="market-empty">加载失败，请稍后重试。</div> : tasks.length === 0 ? <div className="market-empty"><strong>暂时没有可展示的悬赏</strong></div> : <section className="task-grid">{tasks.map((task) => <TaskCard key={task.id} task={task} currentUserId={user?.id} />)}</section>}
    <RechargeRequiredDialog value={paymentShortfall} onOpenChange={(open) => { if (!open) setPaymentShortfall(null); }} />
  </main>;
}

function TaskCard({ task, currentUserId }: { task: any; currentUserId?: string }) {
  const isOpen = task.status === "OPEN";
  const deadline = new Date(task.claimDeadline);
  return <Link className="task-card" to={routes.TaskDetailsRoute.build({ params: { id: task.id } })}>
    <div className="task-card-top"><span className={`state-pill ${isOpen ? "live" : ""}`}><i />{statusLabel(task.status)}</span><strong>{money(task.budgetCents)}</strong></div>
    <div><span className="category-label">{formatPublicNo("task", task.publicNo)} · {task.category}</span><h3>{task.title}</h3><p>{task.description}</p></div>
    <div className="proof-line"><ShieldCheck size={15} />{task.proofRequirements || "按任务说明提交可核验成果"}</div>
    <footer><div className="publisher-mini">{task.publisher.avatarUrl ? <img src={task.publisher.avatarUrl} alt="" /> : <span>{(task.publisher.username ?? "匿").slice(0, 1)}</span>}<div><b>{task.publisher.username ?? "匿名发布者"}</b><small>{currentUserId === task.publisherId ? "我发布的" : `${task._count.questions} 条问答`}</small></div></div><div className="deadline"><small>{isOpen ? "接取截止" : "当前状态"}</small><b>{isOpen ? deadline.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : statusLabel(task.status)}</b></div></footer>
  </Link>;
}

function CreateTaskDialog({ onCreated, onPaymentRequired }: { onCreated: () => void; onPaymentRequired: (value: PaymentShortfall) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: HTMLFormElement) {
    setBusy(true); setError("");
    const values = new FormData(form);
    try {
      const task: any = await createBountyTask({ title: String(values.get("title")), description: String(values.get("description")), category: String(values.get("category")), privateInstructions: String(values.get("privateInstructions") || "") || undefined, proofRequirements: String(values.get("proofRequirements")), workDurationHours: Number(values.get("workDurationHours")), budgetCents: Math.round(Number(values.get("budget")) * 100), claimDeadline: new Date(String(values.get("claimDeadline"))) });
      const submitted: any = await submitBountyTask({ taskId: task.id }); setOpen(false); form.reset(); onCreated();
      if (submitted.status === "PENDING_PAYMENT" && submitted.paymentShortfall) onPaymentRequired({ ...submitted.paymentShortfall, itemId: task.id, kind: "task" });
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "创建失败，请稍后重试"); }
    finally { setBusy(false); }
  }
  const deadline = toLocalInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="lg"><Plus size={18} />发布悬赏</Button></DialogTrigger><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>发布一个清楚、可立即接取的悬赏</DialogTitle></DialogHeader><form className="create-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
    <label>任务标题<Input name="title" placeholder="例如：检查新版注册流程并提交录屏" required minLength={3} maxLength={120} /></label>
    <div className="form-row"><label>分类<select name="category" defaultValue="设计"><option>设计</option><option>内容</option><option>开发</option><option>运营</option><option>调研</option><option>其他</option></select></label><label>奖励（元）<Input name="budget" type="number" min="0.01" step="0.01" required /></label></div>
    <label>公开任务说明<textarea name="description" placeholder="交代背景、要完成的动作和验收标准" required minLength={10} maxLength={20000} /></label>
    <label>成果证明<textarea name="proofRequirements" placeholder="例如：录屏链接 + 3 条问题说明" required minLength={3} maxLength={4000} /></label>
    <label>接取后可见的补充说明（选填）<textarea name="privateInstructions" placeholder="账号、测试地址等不适合公开的信息" maxLength={10000} /></label>
    <div className="form-row"><label>完成时限<select name="workDurationHours" defaultValue="48"><option value="24">24 小时</option><option value="48">48 小时</option><option value="72">3 天</option><option value="168">7 天</option></select></label><label>接取截止<Input name="claimDeadline" type="datetime-local" defaultValue={deadline} required /></label></div>
    <div className="escrow-summary"><ShieldCheck /><div><strong>发布时托管全部奖励</strong><p>审核通过后进入广场；被接取前可由管理员关闭并按原来源退款。</p></div></div>
    {error && <p className="form-error">{error}</p>}<Button disabled={busy} className="w-full" size="lg">{busy ? "正在提交…" : "确认发布并托管"}</Button>
  </form></DialogContent></Dialog>;
}

function toLocalInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
