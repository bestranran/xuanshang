import { CheckCircle2, ClipboardCheck, Coins, ListChecks, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import type { User } from "wasp/entities";
import { closeBountyTask, closeContest, finalizeWithdrawal, getAdminOverview, getPaginatedUsers, issueWithdrawalToken, reviewBountyTask, setAwardBlocked, setContestAwardBlocked, setUserBan, updateIsUserAdminById, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { AdminLayout } from "../../admin/AdminLayout";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { statusLabel } from "../labels";
import { contestStatusLabel } from "../../contest/labels";

const yuan = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);
const dateTime = (value: string | Date) => new Date(value).toLocaleString("zh-CN", { hour12: false });

const pageMeta: Record<string, { title: string; description: string }> = {
  "/admin": { title: "数据概览", description: "查看平台运行、业务待办和资金概况" },
  "/admin/tasks": { title: "悬赏管理", description: "审核新悬赏、查看全量状态并处理异常任务" },
  "/admin/contests": { title: "比赛管理", description: "随时查看已发布比赛、投稿数量和资金状态" },
  "/admin/withdrawals": { title: "提现管理", description: "处理收益提现和支付宝红包口令" },
  "/admin/awards": { title: "奖励冷却", description: "监控或拦截冷却期内的奖励" },
  "/admin/users": { title: "用户管理", description: "查询用户、账号状态及管理员权限" },
  "/admin/audit": { title: "审计记录", description: "追踪管理员执行的敏感操作" },
};

export function AdminPage({ user }: { user: User }) {
  const { pathname } = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const usersQuery = useQuery(getPaginatedUsers, { page, pageSize: 20, emailContains: search || undefined }, { enabled: user.isAdmin });
  const overviewQuery = useQuery(getAdminOverview, undefined, { enabled: user.isAdmin });
  if (!user.isAdmin) return <main className="grid min-h-screen place-items-center"><Card><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto mb-4 size-10 text-destructive" /><h1 className="text-xl font-bold">无权访问管理后台</h1></CardContent></Card></main>;

  const overview = overviewQuery.data as any;
  const usersData = usersQuery.data as any;
  const meta = pageMeta[pathname] ?? pageMeta["/admin"];
  const refresh = async () => { await Promise.all([overviewQuery.refetch(), usersQuery.refetch()]); };
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id); setActionError("");
    try { await action(); await refresh(); return true; }
    catch (error: any) { setActionError(error?.response?.data?.message ?? error?.message ?? "操作失败，请稍后重试"); return false; }
    finally { setBusyId(""); }
  };
  const counts = { tasks: overview?.stats?.pendingTasks, withdrawals: overview?.stats?.pendingWithdrawals, awards: (overview?.stats?.coolingAwards ?? 0) + (overview?.stats?.coolingContestAwards ?? 0) };

  return <AdminLayout user={user} title={meta.title} description={meta.description} counts={counts}>
    {actionError && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{actionError}</div>}
    {overviewQuery.isLoading ? <LoadingState /> : pathname === "/admin/tasks" ? <TasksPanel items={overview?.adminTasks ?? []} busyId={busyId} act={act} />
      : pathname === "/admin/contests" ? <ContestsPanel items={overview?.adminContests ?? []} busyId={busyId} act={act} />
      : pathname === "/admin/withdrawals" ? <WithdrawalsPanel items={overview?.withdrawals ?? []} busyId={busyId} act={act} />
      : pathname === "/admin/awards" ? <AwardsPanel items={overview?.awards ?? []} contestItems={overview?.contestAwards ?? []} busyId={busyId} act={act} />
      : pathname === "/admin/users" ? <UsersPanel currentUser={user} data={usersData} query={usersQuery} search={search} setSearch={(value: string) => { setSearch(value); setPage(1); }} page={page} setPage={setPage} busyId={busyId} act={act} />
      : pathname === "/admin/audit" ? <AuditPanel items={overview?.audits ?? []} />
      : <OverviewPanel overview={overview} />}
  </AdminLayout>;
}

function OverviewPanel({ overview }: { overview: any }) {
  const stats = overview?.stats ?? {};
  const readiness = overview?.readiness ?? {};
  const missing = [["payment", "易支付"], ["payoutEncryption", "红包口令加密"], ["fileStorage", "文件存储"], ["email", "邮件服务"]].filter(([key]) => !readiness[key]).map(([, label]) => label);
  const metrics = [
    { label: "平台用户", value: stats.totalUsers ?? 0, helper: "累计注册用户", icon: Users, color: "bg-blue-50 text-blue-600 dark:bg-blue-950" },
    { label: "悬赏 / 比赛", value: `${stats.totalTasks ?? 0} / ${stats.totalContests ?? 0}`, helper: `${stats.completedTasks ?? 0} 个悬赏已完成`, icon: ListChecks, color: "bg-violet-50 text-violet-600 dark:bg-violet-950" },
    { label: "累计充值", value: yuan(stats.paidRechargeCents ?? 0), helper: "已确认到账", icon: Coins, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950" },
    { label: "业务待办", value: (stats.pendingTasks ?? 0) + (stats.pendingWithdrawals ?? 0) + (stats.coolingAwards ?? 0) + (stats.coolingContestAwards ?? 0), helper: "需要关注的事项", icon: ClipboardCheck, color: "bg-amber-50 text-amber-600 dark:bg-amber-950" },
  ];
  return <div className="space-y-7">
    {missing.length > 0 && <Card className="border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950"><CardContent className="p-5 text-sm text-amber-950 dark:text-amber-100"><strong>上线配置尚未完成</strong><p className="mt-1">待配置：{missing.join("、")}。未完成前，对应功能会安全拒绝操作，不会产生错误资金记录。</p></CardContent></Card>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, helper, icon: Icon, color }) => <Card key={label} className="border-0 shadow-sm"><CardContent className="flex items-start justify-between p-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-muted-foreground">{helper}</p></div><span className={`rounded-xl p-3 ${color}`}><Icon className="size-6" /></span></CardContent></Card>)}</section>
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <Card className="shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="size-5 text-amber-500" />待办队列</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><QueueCard label="待审核悬赏" value={stats.pendingTasks ?? 0} tone="amber" /><QueueCard label="待处理提现" value={stats.pendingWithdrawals ?? 0} tone="blue" /><QueueCard label="冷却中奖励" value={(stats.coolingAwards ?? 0) + (stats.coolingContestAwards ?? 0)} tone="violet" /></CardContent></Card>
      <Card className="shadow-sm"><CardHeader><CardTitle className="text-lg">最近充值订单</CardTitle></CardHeader><CardContent className="space-y-3">{(overview?.orders ?? []).slice(0, 5).map((order: any) => <div key={order.id} className="flex items-center justify-between border-b pb-3 text-sm last:border-0"><div><p className="font-medium">{order.orderNo}</p><p className="text-xs text-muted-foreground">{dateTime(order.createdAt)}</p></div><div className="text-right"><p className="font-semibold">{yuan(order.payableCents)}</p><p className="text-xs text-muted-foreground">{statusLabel(order.status)}</p></div></div>)}{!(overview?.orders?.length) && <EmptyState text="暂无充值订单" />}</CardContent></Card>
    </section>
  </div>;
}

function QueueCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" | "violet" }) {
  const colors = { amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100", blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100", violet: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-100" };
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><p className="text-sm opacity-75">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>;
}

type PanelProps = { items: any[]; busyId: string; act: (id: string, action: () => Promise<unknown>) => Promise<boolean> };
function TasksPanel({ items, busyId, act }: PanelProps) {
  const [closingId, setClosingId] = useState("");
  const [reason, setReason] = useState("");
  return <TableCard title="悬赏任务" count={items.length}><Table headers={["悬赏", "发布者", "金额/报名", "状态", "创建时间", "操作"]}>{items.map((task: any) => <tr key={task.id} className="border-b last:border-0"><Cell><p className="font-medium">{task.title}</p><p className="max-w-xs truncate text-xs text-muted-foreground">{task.description}</p></Cell><Cell>{task.publisher.username ?? task.publisher.email}</Cell><Cell><span className="font-semibold text-amber-600">{yuan(task.budgetCents)}</span><p className="text-xs text-muted-foreground">{task._count?.applications ?? 0} 人报名</p></Cell><Cell><StatusBadge value={task.status === "JUDGING" && task.award ? task.award.status : task.status} /></Cell><Cell>{dateTime(task.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2">{task.status === "PENDING_REVIEW" && <div className="flex gap-2"><Button size="sm" disabled={busyId === task.id} onClick={() => void act(task.id, () => reviewBountyTask({ taskId: task.id, approved: true }))}>通过</Button><Button size="sm" variant="destructive" disabled={busyId === task.id} onClick={() => void act(task.id, () => reviewBountyTask({ taskId: task.id, approved: false }))}>拒绝并退款</Button></div>}{!["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED"].includes(task.status) && task.status !== "PENDING_REVIEW" && (closingId === task.id ? <InlineAction value={reason} setValue={setReason} placeholder="填写关闭原因（至少 3 个字）" confirmLabel="确认关闭" busy={busyId === task.id} onCancel={() => { setClosingId(""); setReason(""); }} onConfirm={async () => { if (await act(task.id, () => closeBountyTask({ taskId: task.id, reason }))) { setClosingId(""); setReason(""); } }} /> : <Button size="sm" variant="destructive" disabled={Boolean(busyId)} onClick={() => { setClosingId(task.id); setReason(""); }}>关闭任务</Button>)}</div></Cell></tr>)}</Table>{!items.length && <EmptyState text="暂无悬赏任务" />}</TableCard>;
}

function ContestsPanel({ items, busyId, act }: PanelProps) {
  const [closingId, setClosingId] = useState("");
  const [reason, setReason] = useState("");
  return <TableCard title="比赛" count={items.length}><Table headers={["比赛", "发布者", "奖池/投稿", "状态", "投稿截止", "操作"]}>{items.map((contest: any) => {
    const effectiveStatus = contest.status === "OPEN" && new Date(contest.submissionDeadline) <= new Date() ? "JUDGING" : contest.status;
    return <tr key={contest.id} className="border-b last:border-0"><Cell><Link className="font-medium hover:underline" to={routes.ContestDetailsRoute.build({ params: { id: contest.id } })}>{contest.title}</Link><p className="max-w-xs truncate text-xs text-muted-foreground">{contest.description}</p></Cell><Cell>{contest.publisher.username ?? contest.publisher.email}</Cell><Cell><span className="font-semibold text-amber-600">{yuan(contest.totalPrizeCents)}</span><p className="text-xs text-muted-foreground">{contest._count?.entries ?? 0} 份投稿</p></Cell><Cell><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{contestStatusLabel(effectiveStatus)}</span></Cell><Cell>{dateTime(contest.submissionDeadline)}</Cell><Cell>{!["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED", "COOLING"].includes(contest.status) && (closingId === contest.id ? <InlineAction value={reason} setValue={setReason} placeholder="填写关闭原因（至少 3 个字）" confirmLabel="确认关闭" busy={busyId === contest.id} onCancel={() => { setClosingId(""); setReason(""); }} onConfirm={async () => { if (await act(contest.id, () => closeContest({ contestId: contest.id, reason }))) { setClosingId(""); setReason(""); } }} /> : <Button size="sm" variant="destructive" disabled={Boolean(busyId)} onClick={() => { setClosingId(contest.id); setReason(""); }}>关闭并退款</Button>)}</Cell></tr>;
  })}</Table>{!items.length && <EmptyState text="暂无比赛" />}</TableCard>;
}

function WithdrawalsPanel({ items, busyId, act }: PanelProps) {
  const [tokenId, setTokenId] = useState("");
  const [token, setToken] = useState("");
  return <TableCard title="待处理提现" count={items.length}><Table headers={["申请人", "申请金额", "实际发放", "状态", "申请时间", "操作"]}>{items.map((item: any) => <tr key={item.id} className="border-b last:border-0"><Cell><p className="font-medium">{item.user.username ?? "未设置昵称"}</p><p className="text-xs text-muted-foreground">{item.user.email}</p></Cell><Cell>{yuan(item.amountCents)}</Cell><Cell className="font-semibold text-emerald-600">{yuan(item.payoutCents)}</Cell><Cell><StatusBadge value={item.status} /></Cell><Cell>{dateTime(item.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2">{item.status === "REQUESTED" && (tokenId === item.id ? <InlineAction value={token} setValue={setToken} placeholder="输入支付宝红包口令" confirmLabel="确认录入" busy={busyId === item.id} minLength={4} onCancel={() => { setTokenId(""); setToken(""); }} onConfirm={async () => { if (await act(item.id, () => issueWithdrawalToken({ id: item.id, token }))) { setTokenId(""); setToken(""); } }} /> : <Button size="sm" disabled={Boolean(busyId)} onClick={() => { setTokenId(item.id); setToken(""); }}>录入口令</Button>)}<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busyId === item.id || item.status !== "TOKEN_ISSUED"} onClick={() => void act(item.id, () => finalizeWithdrawal({ id: item.id, completed: true }))}>标记完成</Button><Button size="sm" variant="destructive" disabled={busyId === item.id} onClick={() => void act(item.id, () => finalizeWithdrawal({ id: item.id, completed: false }))}>拒绝</Button></div></div></Cell></tr>)}</Table>{!items.length && <EmptyState text="目前没有待处理提现" />}</TableCard>;
}

function AwardsPanel({ items, contestItems, busyId, act }: PanelProps & { contestItems: any[] }) {
  const [blockingId, setBlockingId] = useState("");
  const [reason, setReason] = useState("");
  const allItems = [
    ...items.map((award) => ({ ...award, source: "悬赏", title: award.task.title, rank: "" })),
    ...contestItems.map((award) => ({ ...award, source: "比赛", title: award.contest.title, rank: ({ FIRST: "一等奖", SECOND: "二等奖", THIRD: "三等奖" } as Record<string, string>)[award.prize.rank] })),
  ];
  return <TableCard title="冷却期奖励" count={allItems.length}><Table headers={["来源", "关联项目", "奖励金额", "状态", "预计入账", "操作"]}>{allItems.map((award: any) => {
    const isContest = award.source === "比赛";
    const toggle = (blocked: boolean, blockedReason?: string) => isContest ? setContestAwardBlocked({ awardId: award.id, blocked, reason: blockedReason }) : setAwardBlocked({ awardId: award.id, blocked, reason: blockedReason });
    return <tr key={`${award.source}-${award.id}`} className="border-b last:border-0"><Cell>{award.source}</Cell><Cell><p className="font-medium">{award.title}</p>{award.rank && <p className="text-xs text-muted-foreground">{award.rank}</p>}</Cell><Cell className="font-semibold">{yuan(award.amountCents)}</Cell><Cell><StatusBadge value={award.status} /></Cell><Cell>{dateTime(award.availableAt)}</Cell><Cell>{award.status === "BLOCKED" ? <div className="space-y-2"><p className="max-w-48 text-xs text-destructive">{award.blockedReason}</p><Button size="sm" variant="outline" disabled={busyId === award.id} onClick={() => void act(award.id, () => toggle(false))}>解除拦截</Button></div> : blockingId === `${award.source}-${award.id}` ? <InlineAction value={reason} setValue={setReason} placeholder="填写拦截原因（至少 3 个字）" confirmLabel="确认拦截" busy={busyId === award.id} onCancel={() => { setBlockingId(""); setReason(""); }} onConfirm={async () => { if (await act(award.id, () => toggle(true, reason))) { setBlockingId(""); setReason(""); } }} /> : <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => { setBlockingId(`${award.source}-${award.id}`); setReason(""); }}>拦截奖励</Button>}</Cell></tr>;
  })}</Table>{!allItems.length && <EmptyState text="目前没有冷却期奖励" />}</TableCard>;
}

function UsersPanel({ currentUser, data, query, search, setSearch, page, setPage, busyId, act }: any) {
  const users = data?.users ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const [banningId, setBanningId] = useState("");
  const [reason, setReason] = useState("");
  return <div className="space-y-5"><Card className="shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">共 {data?.total ?? 0} 位用户</p><p className="text-sm text-muted-foreground">可按邮箱搜索并调整管理员权限</p></div><Input className="sm:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索用户邮箱" /></CardContent></Card>
    <TableCard title="用户列表"><Table headers={["用户", "邮箱", "角色", "状态", "注册时间", "操作"]}>{users.map((item: any) => <tr key={item.id} className="border-b last:border-0"><Cell><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-slate-100 font-semibold dark:bg-slate-800">{(item.username ?? item.email ?? "用").slice(0, 1)}</span><span><span className="block font-medium">{item.username ?? "未设置昵称"}</span>{item.bannedReason && <span className="block max-w-44 truncate text-xs text-destructive">{item.bannedReason}</span>}</span></div></Cell><Cell>{item.email ?? "—"}</Cell><Cell><span className={item.isAdmin ? "font-medium text-amber-600" : "text-muted-foreground"}>{item.isAdmin ? "管理员" : "普通用户"}</span></Cell><Cell><span className={item.isBanned ? "text-destructive" : "text-emerald-600"}>{item.isBanned ? "已封禁" : "正常"}</span></Cell><Cell>{dateTime(item.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busyId === item.id || item.id === currentUser.id} onClick={() => void act(item.id, () => updateIsUserAdminById({ id: item.id, isAdmin: !item.isAdmin }))}>{item.isAdmin ? "移除管理员" : "设为管理员"}</Button>{item.isBanned ? <Button size="sm" variant="outline" disabled={busyId === item.id || item.id === currentUser.id} onClick={() => void act(item.id, () => setUserBan({ id: item.id, banned: false }))}>解除封禁</Button> : <Button size="sm" variant="destructive" disabled={Boolean(busyId) || item.id === currentUser.id} onClick={() => { setBanningId(item.id); setReason(""); }}>封禁</Button>}</div>{banningId === item.id && <InlineAction value={reason} setValue={setReason} placeholder="填写封禁原因（至少 3 个字）" confirmLabel="确认封禁" busy={busyId === item.id} onCancel={() => { setBanningId(""); setReason(""); }} onConfirm={async () => { if (await act(item.id, () => setUserBan({ id: item.id, banned: true, reason }))) { setBanningId(""); setReason(""); } }} />}</div></Cell></tr>)}</Table>{query.isLoading && <LoadingState compact />}{!query.isLoading && !users.length && <EmptyState text="没有找到符合条件的用户" />}</TableCard>
    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value: number) => value - 1)}>上一页</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value: number) => value + 1)}>下一页</Button></div></div>
  </div>;
}

function InlineAction({ value, setValue, placeholder, confirmLabel, busy, onCancel, onConfirm, minLength = 3 }: { value: string; setValue: (value: string) => void; placeholder: string; confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void>; minLength?: number }) {
  return <div className="space-y-2 rounded-lg border bg-muted/40 p-2"><Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} /><div className="flex gap-2"><Button size="sm" disabled={busy || value.trim().length < minLength} onClick={() => void onConfirm()}>{confirmLabel}</Button><Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div></div>;
}

function AuditPanel({ items }: { items: any[] }) {
  const labels: Record<string, string> = { AWARD_BLOCKED: "拦截奖励", AWARD_UNBLOCKED: "解除奖励拦截", WITHDRAWAL_TOKEN_ISSUED: "发放提现口令", WITHDRAWAL_COMPLETED: "完成提现", WITHDRAWAL_REJECTED: "拒绝提现", USER_BANNED: "封禁用户", USER_UNBANNED: "解除用户封禁", USER_ADMIN_GRANTED: "授予管理员", USER_ADMIN_REVOKED: "移除管理员", TASK_CLOSED: "关闭任务", TASK_CLOSED_AND_REFUNDED: "关闭任务并退款" };
  return <TableCard title="管理员操作记录" count={items.length}><Table headers={["操作", "目标类型", "目标编号", "管理员编号", "时间"]}>{items.map((item) => <tr key={item.id} className="border-b last:border-0"><Cell className="font-medium">{labels[item.action] ?? item.action}</Cell><Cell>{item.targetType}</Cell><Cell><code className="text-xs">{item.targetId}</code></Cell><Cell><code className="text-xs">{item.adminId}</code></Cell><Cell>{dateTime(item.createdAt)}</Cell></tr>)}</Table>{!items.length && <EmptyState text="暂无管理员操作记录" />}</TableCard>;
}

function TableCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) { return <Card className="overflow-hidden border-0 shadow-sm"><CardHeader className="border-b bg-background"><CardTitle className="flex items-center justify-between text-lg"><span>{title}</span>{count !== undefined && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{count} 项</span>}</CardTitle></CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs tracking-wide text-muted-foreground dark:bg-slate-900"><tr>{headers.map((header) => <th key={header} className="px-5 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-5 py-4 align-middle ${className}`}>{children}</td>; }
function StatusBadge({ value }: { value: string }) { return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{statusLabel(value)}</span>; }
function EmptyState({ text }: { text: string }) { return <div className="grid place-items-center gap-2 px-6 py-14 text-center text-muted-foreground"><CheckCircle2 className="size-9 text-emerald-500" /><p className="text-sm">{text}</p></div>; }
function LoadingState({ compact = false }: { compact?: boolean }) { return <div className={`animate-pulse rounded-xl bg-muted ${compact ? "m-5 h-12" : "h-72"}`} aria-label="正在加载" />; }
