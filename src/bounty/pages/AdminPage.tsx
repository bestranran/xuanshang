import { ArrowRight, CheckCircle2, ClipboardCheck, Coins, ListChecks, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import type { User } from "wasp/entities";
import { adjustUserWalletByAdmin, closeBountyTask, closeContest, createGiftCardBatch, finalizeWithdrawal, getAdminOverview, getAdminUserDetails, getAdminWalletEntries, getAnnouncementsForAdmin, getGiftCardBatchDetails, getGiftCardBatches, getPaginatedUsers, getStorageOverview, getSystemSettingsForAdmin, issueWithdrawalToken, resolveTaskAppeal, reviewBountyTask, saveAnnouncement, setAwardBlocked, setContestAwardBlocked, setGiftCardEnabled, setRechargeOrderStatusByAdmin, setUserBan, testObjectStorage, updateIsUserAdminById, updateSystemSettings, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { AdminLayout } from "../../admin/AdminLayout";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { statusLabel } from "../labels";
import { contestStatusLabel } from "../../contest/labels";
import { formatPublicNo } from "../../shared/publicNo";

const yuan = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);
const dateTime = (value: string | Date) => new Date(value).toLocaleString("zh-CN", { hour12: false });

const pageMeta: Record<string, { title: string; description: string }> = {
  [routes.AdminRoute.to]: { title: "数据概览", description: "查看平台运行、业务待办和资金概况" },
  [routes.AdminTasksRoute.to]: { title: "悬赏管理", description: "审核新悬赏、查看全量状态并处理异常任务" },
  [routes.AdminContestsRoute.to]: { title: "比赛管理", description: "随时查看已发布比赛、投稿数量和资金状态" },
  [routes.AdminWithdrawalsRoute.to]: { title: "提现管理", description: "处理收益提现和支付宝红包口令" },
  [routes.AdminAwardsRoute.to]: { title: "奖励冷却", description: "监控或拦截冷却期内的奖励" },
  [routes.AdminUsersRoute.to]: { title: "用户管理", description: "查询用户、账号状态及管理员权限" },
  [routes.AdminAuditRoute.to]: { title: "审计记录", description: "追踪管理员执行的敏感操作" },
  [routes.AdminLedgerRoute.to]: { title: "资金流水", description: "查询和导出平台钱包变动记录" },
  [routes.AdminSettingsRoute.to]: { title: "系统设置", description: "配置支付、邮件、对象存储和平台费率，无需重新部署" },
  [routes.AdminAnnouncementsRoute.to]: { title: "公告管理", description: "创建、发布、置顶或撤下平台公告" },
  [routes.AdminGiftCardsRoute.to]: { title: "礼品卡管理", description: "生成真实储值礼品卡，管理批次与兑换状态" },
};

export function AdminPage({ user }: { user: User }) {
  const { pathname } = useLocation();
  const { id: userId } = useParams();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus") ?? "";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const usersQuery = useQuery(getPaginatedUsers, { page, pageSize: 20, emailContains: search || undefined }, { enabled: user.isAdmin && !userId });
  const overviewQuery = useQuery(getAdminOverview, undefined, { enabled: user.isAdmin });
  const userDetailsQuery = useQuery(getAdminUserDetails, { id: userId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: user.isAdmin && Boolean(userId) });
  const settingsQuery = useQuery(getSystemSettingsForAdmin, undefined, { enabled: user.isAdmin && pathname === routes.AdminSettingsRoute.to });
  const announcementsQuery = useQuery(getAnnouncementsForAdmin, undefined, { enabled: user.isAdmin && pathname === routes.AdminAnnouncementsRoute.to });
  useEffect(() => {
    if (!focusId || overviewQuery.isLoading) return;
    const timer = window.setTimeout(() => document.getElementById(`admin-row-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => window.clearTimeout(timer);
  }, [focusId, overviewQuery.isLoading, pathname]);
  if (!user.isAdmin) return <main className="grid min-h-screen place-items-center"><Card><CardContent className="p-10 text-center"><ShieldCheck className="mx-auto mb-4 size-10 text-destructive" /><h1 className="text-xl font-bold">无权访问管理后台</h1></CardContent></Card></main>;

  const overview = overviewQuery.data as any;
  const usersData = usersQuery.data as any;
  const meta = userId ? { title: "用户详情", description: "查看账户、资金和全部业务记录" } : pageMeta[pathname] ?? pageMeta[routes.AdminRoute.to];
  const refresh = async () => { await Promise.all([overviewQuery.refetch(), ...(userId ? [userDetailsQuery.refetch()] : [usersQuery.refetch()])]); };
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id); setActionError("");
    try { await action(); await refresh(); return true; }
    catch (error: any) { setActionError(error?.response?.data?.message ?? error?.message ?? "操作失败，请稍后重试"); return false; }
    finally { setBusyId(""); }
  };
  const counts = { tasks: (overview?.stats?.pendingTasks ?? 0) + (overview?.stats?.pendingAppeals ?? 0), withdrawals: overview?.stats?.pendingWithdrawals, awards: overview?.stats?.blockedAwards };
  return <AdminLayout user={user} title={meta.title} description={meta.description} counts={counts}>
    {actionError && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{actionError}</div>}
    {userId ? <UserDetailsPanel currentUser={user} data={userDetailsQuery.data as any} loading={userDetailsQuery.isLoading} error={userDetailsQuery.error} busyId={busyId} act={act} />
      : overviewQuery.isLoading ? <LoadingState /> : pathname === routes.AdminTasksRoute.to ? <TasksPanel items={overview?.adminTasks ?? []} busyId={busyId} act={act} focusId={focusId} />
      : pathname === routes.AdminContestsRoute.to ? <ContestsPanel items={overview?.adminContests ?? []} busyId={busyId} act={act} focusId={focusId} />
      : pathname === routes.AdminWithdrawalsRoute.to ? <WithdrawalsPanel items={overview?.withdrawals ?? []} busyId={busyId} act={act} focusId={focusId} />
      : pathname === routes.AdminAwardsRoute.to ? <AwardsPanel items={overview?.awards ?? []} contestItems={overview?.contestAwards ?? []} busyId={busyId} act={act} focusId={focusId} />
      : pathname === routes.AdminUsersRoute.to ? <UsersPanel currentUser={user} data={usersData} query={usersQuery} search={search} setSearch={(value: string) => { setSearch(value); setPage(1); }} page={page} setPage={setPage} busyId={busyId} act={act} />
      : pathname === routes.AdminAuditRoute.to ? <AuditPanel items={overview?.audits ?? []} />
      : pathname === routes.AdminLedgerRoute.to ? <LedgerPanel />
      : pathname === routes.AdminSettingsRoute.to ? <SettingsPanel data={settingsQuery.data as any} loading={settingsQuery.isLoading} onSaved={async () => { await Promise.all([settingsQuery.refetch(), overviewQuery.refetch()]); }} />
      : pathname === routes.AdminAnnouncementsRoute.to ? <AnnouncementsPanel items={(announcementsQuery.data ?? []) as any[]} loading={announcementsQuery.isLoading} onSaved={async () => { await announcementsQuery.refetch(); }} />
      : pathname === routes.AdminGiftCardsRoute.to ? <GiftCardsPanel />
      : <OverviewPanel overview={overview} refreshing={overviewQuery.isFetching} onRefresh={() => void overviewQuery.refetch()} />}
  </AdminLayout>;
}

function GiftCardsPanel() {
  const batchesQuery = useQuery(getGiftCardBatches);
  const batches = (batchesQuery.data ?? []) as any[];
  const [selectedId, setSelectedId] = useState("");
  const detailsQuery = useQuery(getGiftCardBatchDetails, { id: selectedId || "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(selectedId) });
  const [draft, setDraft] = useState({ name: "", amount: "", quantity: "", fundingSourceNote: "", expiresAt: "" });
  const [createdCards, setCreatedCards] = useState<any[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const downloadCards = (result: any) => {
    const rows = [
      ["批次编号", "礼品卡编号", "面额（元）", "卡密", "到期时间"],
      ...result.cards.map((card: any) => [formatPublicNo("giftCardBatch", result.batch.publicNo), formatPublicNo("giftCard", card.publicNo), (result.batch.amountCents / 100).toFixed(2), card.secret, result.batch.expiresAt ? dateTime(result.batch.expiresAt) : "永久有效"]),
    ];
    const blob = new Blob(["\ufeff", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gift-cards-${formatPublicNo("giftCardBatch", result.batch.publicNo)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const create = async () => {
    setBusy("create"); setMessage(""); setCreatedCards(null);
    try {
      const result: any = await createGiftCardBatch({
        name: draft.name,
        amountCents: Math.round(Number(draft.amount) * 100),
        quantity: Number(draft.quantity),
        fundingSourceNote: draft.fundingSourceNote,
        expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : undefined,
      });
      setCreatedCards(result.cards);
      downloadCards(result);
      setDraft({ name: "", amount: "", quantity: "", fundingSourceNote: "", expiresAt: "" });
      setMessage("批次已创建，CSV 已自动下载。卡密离开本页后无法再次查看。");
      setSelectedId(result.batch.id);
      await batchesQuery.refetch();
    } catch (error: any) { setMessage(error?.response?.data?.message ?? error?.message ?? "创建失败"); }
    finally { setBusy(""); }
  };
  const toggle = async (target: "BATCH" | "CARD", id: string, enabled: boolean) => {
    setBusy(id); setMessage("");
    try {
      await setGiftCardEnabled({ target, id, enabled });
      await Promise.all([batchesQuery.refetch(), ...(selectedId ? [detailsQuery.refetch()] : [])]);
    } catch (error: any) { setMessage(error?.response?.data?.message ?? error?.message ?? "操作失败"); }
    finally { setBusy(""); }
  };
  const details = detailsQuery.data as any;
  const cardStatus = (card: any) => card.redeemedAt ? "已兑换" : card.disabled ? "已停用" : details?.disabled ? "批次停用" : details?.expiresAt && new Date(details.expiresAt) <= new Date() ? "已过期" : "可兑换";
  return <div className="space-y-6">
    <Card className="border-amber-200"><CardHeader><CardTitle>生成礼品卡批次</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Input placeholder="批次名称" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><Input type="number" min="0.01" step="0.01" placeholder="单卡面额（元）" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /><Input type="number" min="1" max="500" step="1" placeholder="数量（最多 500）" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /><Input type="date" aria-label="到期日，留空永久有效" title="留空则永久有效" value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /><Button disabled={busy === "create" || draft.name.trim().length < 2 || Number(draft.amount) <= 0 || !Number.isInteger(Number(draft.quantity)) || Number(draft.quantity) < 1 || draft.fundingSourceNote.trim().length < 3} onClick={() => void create()}>{busy === "create" ? "正在生成…" : "生成并导出 CSV"}</Button></div><Input placeholder="资金来源说明（必填，例如：线下销售订单号/企业采购合同）" value={draft.fundingSourceNote} onChange={(event) => setDraft({ ...draft, fundingSourceNote: event.target.value })} /><p className="text-xs text-muted-foreground">真实储值卡默认永久有效。数据库只保存卡密 HMAC 摘要；原始卡密仅在创建成功的这一次显示并导出，请妥善保管 CSV。</p>{message && <p className="text-sm text-amber-700 dark:text-amber-300">{message}</p>}{createdCards && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950"><div className="mb-3 flex items-center justify-between"><strong>仅本次可见的卡密（共 {createdCards.length} 张）</strong><Button size="sm" variant="outline" onClick={() => setCreatedCards(null)}>我已保存，隐藏</Button></div><textarea readOnly className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs" value={createdCards.map((card) => `${formatPublicNo("giftCard", card.publicNo)},${card.secret}`).join("\n")} /></div>}</CardContent></Card>
    <TableCard title="礼品卡批次" count={batches.length}><Table headers={["批次编号", "名称", "面额", "兑换进度", "有效期", "状态", "操作"]}>{batches.map((batch) => <tr key={batch.id} className="border-b last:border-0"><Cell><code>{formatPublicNo("giftCardBatch", batch.publicNo)}</code></Cell><Cell><strong>{batch.name}</strong><p className="max-w-56 truncate text-xs text-muted-foreground">{batch.fundingSourceNote}</p></Cell><Cell>{yuan(batch.amountCents)}</Cell><Cell>{batch.redeemedCount} / {batch.quantity}</Cell><Cell>{batch.expiresAt ? dateTime(batch.expiresAt) : "永久有效"}</Cell><Cell>{batch.disabled ? "已停用" : batch.expiresAt && new Date(batch.expiresAt) <= new Date() ? "已过期" : "启用中"}</Cell><Cell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedId(batch.id)}>查看卡片</Button><Button size="sm" variant={batch.disabled ? "default" : "destructive"} disabled={busy === batch.id} onClick={() => void toggle("BATCH", batch.id, batch.disabled)}>{batch.disabled ? "恢复" : "停用"}</Button></div></Cell></tr>)}</Table>{batchesQuery.isLoading && <LoadingState compact />}{!batchesQuery.isLoading && !batches.length && <EmptyState text="暂无礼品卡批次" />}</TableCard>
    {selectedId && <TableCard title={details ? `${formatPublicNo("giftCardBatch", details.publicNo)} · 单卡明细` : "单卡明细"}><Table headers={["礼品卡编号", "尾号", "状态", "兑换用户", "兑换时间", "操作"]}>{(details?.cards ?? []).map((card: any) => <tr key={card.id} className="border-b last:border-0"><Cell><code>{formatPublicNo("giftCard", card.publicNo)}</code></Cell><Cell><code>•••• {card.lastFour}</code></Cell><Cell>{cardStatus(card)}</Cell><Cell>{card.redeemedBy ? <><strong>{formatPublicNo("user", card.redeemedBy.publicNo)}</strong><p className="text-xs text-muted-foreground">{card.redeemedBy.username ?? card.redeemedBy.email ?? "—"}</p></> : "—"}</Cell><Cell>{card.redeemedAt ? dateTime(card.redeemedAt) : "—"}</Cell><Cell>{!card.redeemedAt ? <Button size="sm" variant={card.disabled ? "default" : "outline"} disabled={busy === card.id} onClick={() => void toggle("CARD", card.id, card.disabled)}>{card.disabled ? "恢复单卡" : "停用单卡"}</Button> : "—"}</Cell></tr>)}</Table>{detailsQuery.isLoading && <LoadingState compact />}</TableCard>}
  </div>;
}

function AnnouncementsPanel({ items, loading, onSaved }: { items: any[]; loading: boolean; onSaved: () => Promise<void> }) {
  const empty = { id: undefined as string | undefined, title: "", summary: "", content: "", status: "DRAFT" as "DRAFT" | "PUBLISHED" | "WITHDRAWN", isPinned: false, emailUsers: false };
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    try { await saveAnnouncement(draft); await onSaved(); setDraft(empty); setMessage("公告已保存"); }
    catch (error: any) { setMessage(error?.response?.data?.message ?? error?.message ?? "保存失败"); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingState />;
  return <div className="grid gap-6 xl:grid-cols-[420px_1fr]"><Card><CardHeader><CardTitle>{draft.id ? "编辑公告" : "新建公告"}</CardTitle></CardHeader><CardContent className="create-form"><label>标题<Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>摘要<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label><label>正文<textarea className="min-h-56" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label><div className="form-row"><label>状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as typeof draft.status })}><option value="DRAFT">草稿</option><option value="PUBLISHED">发布</option><option value="WITHDRAWN">撤下</option></select></label><div className="grid content-end gap-2 pb-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.isPinned} onChange={(event) => setDraft({ ...draft, isPinned: event.target.checked })} />置顶公告</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.emailUsers} disabled={draft.status !== "PUBLISHED"} onChange={(event) => setDraft({ ...draft, emailUsers: event.target.checked })} />首次发布时发送邮件</label></div></div>{message && <p className="text-sm text-muted-foreground">{message}</p>}<div className="flex gap-2"><Button disabled={busy || draft.title.trim().length < 3 || draft.summary.trim().length < 3 || draft.content.trim().length < 10} onClick={() => void save()}>{busy ? "保存中…" : "保存公告"}</Button>{draft.id && <Button variant="outline" onClick={() => setDraft(empty)}>取消编辑</Button>}</div></CardContent></Card><TableCard title="全部公告" count={items.length}><Table headers={["公告", "状态", "置顶", "发布时间", "操作"]}>{items.map((item) => <tr key={item.id} className="border-b last:border-0"><Cell><strong>{item.title}</strong><p className="max-w-md truncate text-xs text-muted-foreground">{item.summary}</p></Cell><Cell>{item.status === "PUBLISHED" ? "已发布" : item.status === "WITHDRAWN" ? "已撤下" : "草稿"}</Cell><Cell>{item.isPinned ? "是" : "—"}</Cell><Cell>{item.publishedAt ? dateTime(item.publishedAt) : "—"}</Cell><Cell><Button size="sm" variant="outline" onClick={() => setDraft({ id: item.id, title: item.title, summary: item.summary, content: item.content, status: item.status, isPinned: item.isPinned, emailUsers: false })}>编辑</Button></Cell></tr>)}</Table>{!items.length && <EmptyState text="暂无公告" />}</TableCard></div>;
}

const settingSections: Array<{ title: string; fields: Array<[string, string]> }> = [
  { title: "网站外观", fields: [["site.title", "网站标题"], ["site.logoUrl", "Logo 图片地址（留空使用默认 Logo）"]] },
  { title: "易支付", fields: [["payment.epayApiUrl", "网关地址"], ["payment.epayPid", "商户 ID"], ["payment.epayKey", "商户密钥"], ["payment.notifyUrl", "异步通知地址"], ["payment.returnUrl", "支付返回地址"]] },
  { title: "SMTP 邮件", fields: [["email.smtpHost", "SMTP 主机"], ["email.smtpPort", "端口"], ["email.smtpUser", "用户名"], ["email.smtpPassword", "密码"], ["email.fromName", "发件人名称"], ["email.fromAddress", "发件邮箱"]] },
  { title: "S3 兼容对象存储", fields: [["storage.region", "区域"], ["storage.endpoint", "自定义 Endpoint（可选）"], ["storage.accessKey", "Access Key"], ["storage.secretKey", "Secret Key"], ["storage.bucket", "Bucket"]] },
  { title: "平台费率", fields: [["platform.rechargeRateBps", "充值费率（基点，100 = 1%）"], ["platform.rechargeFixedCents", "充值固定费（分）"], ["platform.withdrawalRateBps", "提现费率（基点）"], ["platform.withdrawalFixedCents", "提现固定费（分）"]] },
];
const secretKeys = new Set<string>(["payment.epayKey", "email.smtpPassword", "storage.accessKey", "storage.secretKey"]);

function SettingsPanel({ data, loading, onSaved }: { data: any; loading: boolean; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(settingSections.flatMap((section) => section.fields).map(([key]) => [key, data?.[key] ?? ""])));
  const [message, setMessage] = useState("");
  const storageQuery = useQuery(getStorageOverview);
  useEffect(() => { if (data) setValues(Object.fromEntries(settingSections.flatMap((section) => section.fields).map(([key]) => [key, data[key] ?? ""]))); }, [data]);
  if (loading) return <LoadingState />;
  const save = async () => { if (!window.confirm("确定保存系统设置？支付密钥和平台费率会立即生效。")) return; setMessage(""); try { const fees = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("platform."))); const runtimeValues = Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith("platform."))); await updateSystemSettings({ values: runtimeValues, fees }); await onSaved(); setMessage("设置已加密保存并立即生效"); } catch (error: any) { setMessage(error?.message ?? "保存失败"); } };
  const storage = storageQuery.data as any;
  const testStorage = async () => { setMessage("正在测试对象存储…"); try { await testObjectStorage(); await storageQuery.refetch(); setMessage("对象存储读、写、删除测试通过"); } catch (error: any) { setMessage(error?.response?.data?.message ?? error?.message ?? "对象存储测试失败"); } };
  const storageStat = (label: string, value: number | string) => <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
  return <div className="space-y-6"><Card><CardContent className="p-5 text-sm text-muted-foreground">敏感值使用安装时生成的主密钥加密保存。密钥输入框留空表示保留现有值；普通字段清空会停用对应能力。</CardContent></Card>{settingSections.map((section) => <Card key={section.title}><CardHeader><CardTitle>{section.title}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{section.fields.map(([key, label]) => <label key={key} className="space-y-2 text-sm font-medium"><span>{label}{secretKeys.has(key) && data?.[`${key}Configured`] ? "（已配置，留空则保留）" : ""}</span><Input type={secretKeys.has(key) ? "password" : "text"} defaultValue={data?.[key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} autoComplete="off" /></label>)}</CardContent></Card>)}<Card><CardHeader><CardTitle>对象存储用量</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{storageStat("对象数量", storage?.totalObjects ?? 0)}{storageStat("总占用", `${((storage?.totalBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`)}{storageStat("待完成上传", storage?.pending ?? 0)}{storageStat("清理失败", storage?.failed ?? 0)}</div><Button variant="outline" onClick={() => void testStorage()}>测试 R2 读写与删除</Button><p className="text-xs text-muted-foreground">Cloudflare R2 的 Region 填 auto。Bucket CORS 需要允许本站 PUT/GET/POST，并暴露 ETag 响应头。</p></CardContent></Card><div className="flex items-center gap-4"><Button onClick={() => void save()}>保存系统设置</Button>{message && <span className="text-sm text-muted-foreground">{message}</span>}</div></div>;
}

function OverviewPanel({ overview, refreshing, onRefresh }: { overview: any; refreshing: boolean; onRefresh: () => void }) {
  const stats = overview?.stats ?? {};
  const readiness = overview?.readiness ?? {};
  const missing = [["payment", "易支付"], ["payoutEncryption", "红包口令加密"], ["fileStorage", "文件存储"], ["email", "邮件服务"]].filter(([key]) => !readiness[key]).map(([, label]) => label);
  const metrics = [
    { label: "平台用户", value: stats.totalUsers ?? 0, helper: "累计注册用户", icon: Users, color: "bg-blue-50 text-blue-600 dark:bg-blue-950" },
    { label: "悬赏 / 比赛", value: `${stats.totalTasks ?? 0} / ${stats.totalContests ?? 0}`, helper: `${stats.completedTasks ?? 0} 个悬赏已完成`, icon: ListChecks, color: "bg-violet-50 text-violet-600 dark:bg-violet-950" },
    { label: "累计充值", value: yuan(stats.paidRechargeCents ?? 0), helper: "已确认到账", icon: Coins, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950" },
    { label: "业务待办", value: overview?.todos?.length ?? 0, helper: "需要管理员处理", icon: ClipboardCheck, color: "bg-amber-50 text-amber-600 dark:bg-amber-950" },
  ];
  return <div className="space-y-7">
    {missing.length > 0 && <Card className="border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950"><CardContent className="p-5 text-sm text-amber-950 dark:text-amber-100"><strong>上线配置尚未完成</strong><p className="mt-1">待配置：{missing.join("、")}。未完成前，对应功能会安全拒绝操作，不会产生错误资金记录。</p></CardContent></Card>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, helper, icon: Icon, color }) => <Card key={label} className="border-0 shadow-sm"><CardContent className="flex items-start justify-between p-6"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-muted-foreground">{helper}</p></div><span className={`rounded-xl p-3 ${color}`}><Icon className="size-6" /></span></CardContent></Card>)}</section>
    <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <Card className="shadow-sm"><CardHeader><CardTitle className="flex items-center justify-between text-lg"><span className="flex items-center gap-2"><ClipboardCheck className="size-5 text-amber-500" />今日待办</span><Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />刷新</Button></CardTitle></CardHeader><CardContent className="space-y-2">{(overview?.todos ?? []).slice(0, 12).map((item: any) => <TodoRow key={`${item.type}-${item.id}`} item={item} />)}{!(overview?.todos?.length) && <EmptyState text="今天没有需要管理员处理的事项" />}</CardContent></Card>
      <Card className="shadow-sm"><CardHeader><CardTitle className="text-lg">最近充值订单</CardTitle></CardHeader><CardContent className="space-y-3">{(overview?.orders ?? []).slice(0, 5).map((order: any) => <div key={order.id} className="flex items-center justify-between border-b pb-3 text-sm last:border-0"><div><p className="font-medium">{formatPublicNo("recharge", order.publicNo)}</p><p className="text-xs text-muted-foreground">{dateTime(order.createdAt)}</p></div><div className="text-right"><p className="font-semibold">{yuan(order.payableCents)}</p><p className="text-xs text-muted-foreground">{statusLabel(order.status)}</p></div></div>)}{!(overview?.orders?.length) && <EmptyState text="暂无充值订单" />}</CardContent></Card>
    </section>
  </div>;
}

function TodoRow({ item }: { item: any }) {
  const isWithdrawal = item.type === "WITHDRAWAL";
  const isAward = item.type === "TASK_AWARD" || item.type === "CONTEST_AWARD";
  const route = isWithdrawal ? routes.AdminWithdrawalsRoute.to : isAward ? routes.AdminAwardsRoute.to : routes.AdminTasksRoute.to;
  const kind = isWithdrawal ? "withdrawal" : item.type === "CONTEST_AWARD" ? "contest" : "task";
  const label = ({ TASK_REVIEW: "审核悬赏", TASK_APPEAL: "处理申诉", WITHDRAWAL: "处理提现", TASK_AWARD: "复核悬赏奖励", CONTEST_AWARD: "复核比赛奖励" } as Record<string, string>)[item.type] ?? "处理事项";
  const waitingHours = Math.max(0, Math.floor((Date.now() - +new Date(item.createdAt)) / 3_600_000));
  return <Link to={`${route}?focus=${encodeURIComponent(item.id)}`} className="flex items-center gap-3 rounded-xl border p-3 transition hover:border-amber-300 hover:bg-amber-50/60 dark:hover:bg-amber-950/30"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-amber-700">{label}</span><code className="text-xs">{formatPublicNo(kind, item.publicNo)}</code></div><p className="truncate font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.user || "系统待办"} · 已等待 {waitingHours < 24 ? `${waitingHours} 小时` : `${Math.floor(waitingHours / 24)} 天`}</p></div><div className="text-right"><p className="font-semibold">{yuan(item.amountCents)}</p><ArrowRight className="ml-auto mt-1 size-4 text-muted-foreground" /></div></Link>;
}

type PanelProps = { items: any[]; busyId: string; act: (id: string, action: () => Promise<unknown>) => Promise<boolean>; focusId?: string };
const focusRowClass = (id: string, focusId?: string) => `border-b last:border-0 ${id === focusId ? "bg-amber-100/80 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/40" : ""}`;
function TasksPanel({ items, busyId, act, focusId }: PanelProps) {
  const [closingId, setClosingId] = useState("");
  const [reason, setReason] = useState("");
  const clearReason = () => { setClosingId(""); setReason(""); };
  return <TableCard title="悬赏任务" count={items.length}><Table headers={["编号", "悬赏", "发布者", "金额/接取者", "状态", "创建时间", "操作"]}>{items.map((task: any) => <tr id={`admin-row-${task.id}`} key={task.id} className={focusRowClass(task.id, focusId)}><Cell><code>{formatPublicNo("task", task.publicNo)}</code></Cell><Cell><Link className="font-medium hover:underline" to={routes.TaskDetailsRoute.build({ params: { id: task.id } })}>{task.title}</Link><p className="max-w-xs truncate text-xs text-muted-foreground">{task.description}</p></Cell><Cell>{task.publisher.username ?? task.publisher.email}</Cell><Cell><span className="font-semibold text-amber-600">{yuan(task.budgetCents)}</span><p className="text-xs text-muted-foreground">{task.assignedClaim?.worker?.username ?? "尚未接取"}</p></Cell><Cell><StatusBadge value={task.status === "COOLING" && task.award ? task.award.status : task.status} /></Cell><Cell>{dateTime(task.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2">{task.status === "PENDING_REVIEW" && <div className="flex gap-2"><Button size="sm" disabled={busyId === task.id} onClick={() => void act(task.id, () => reviewBountyTask({ taskId: task.id, approved: true }))}>通过</Button><Button size="sm" variant="destructive" disabled={busyId === task.id} onClick={() => { if (window.confirm("确定拒绝这个悬赏并退回全部托管资金？")) void act(task.id, () => reviewBountyTask({ taskId: task.id, approved: false })); }}>拒绝并退款</Button></div>}{task.status === "APPEALED" && <div className="space-y-2"><div className="max-w-64 space-y-1 rounded-lg bg-muted/60 p-2 text-xs"><p><b>发布者拒绝：</b>{task.assignedClaim?.rejectionReason ?? "未记录"}</p><p><b>接取者申诉：</b>{task.assignedClaim?.appealReason ?? "未记录"}</p></div><Input value={closingId === task.id ? reason : ""} onChange={(event) => { setClosingId(task.id); setReason(event.target.value); }} placeholder="填写申诉裁决理由" /><div className="flex gap-2"><Button size="sm" disabled={reason.trim().length < 3 || busyId === task.id} onClick={async () => { if (!window.confirm("确定裁定申诉成立并向接取者支付奖励？")) return; if (await act(task.id, () => resolveTaskAppeal({ taskId: task.id, decision: "PAY", reason }))) clearReason(); }}>判定支付</Button><Button size="sm" variant="outline" disabled={reason.trim().length < 3 || busyId === task.id} onClick={async () => { if (await act(task.id, () => resolveTaskAppeal({ taskId: task.id, decision: "REOPEN", reason }))) clearReason(); }}>重新开放</Button></div></div>}{!["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED", "APPEALED"].includes(task.status) && task.status !== "PENDING_REVIEW" && (closingId === task.id ? <InlineAction value={reason} setValue={setReason} placeholder="填写关闭原因（至少 3 个字）" confirmLabel="确认关闭" busy={busyId === task.id} onCancel={clearReason} onConfirm={async () => { if (!window.confirm("确定关闭这个悬赏？如有托管资金将执行退款。")) return; if (await act(task.id, () => closeBountyTask({ taskId: task.id, reason }))) clearReason(); }} /> : <Button size="sm" variant="destructive" disabled={Boolean(busyId)} onClick={() => { setClosingId(task.id); setReason(""); }}>关闭任务</Button>)}</div></Cell></tr>)}</Table>{!items.length && <EmptyState text="暂无悬赏任务" />}</TableCard>;
}

function ContestsPanel({ items, busyId, act, focusId }: PanelProps) {
  const [closingId, setClosingId] = useState("");
  const [reason, setReason] = useState("");
  return <TableCard title="比赛" count={items.length}><Table headers={["编号", "比赛", "发布者", "奖池/投稿", "状态", "投稿截止", "操作"]}>{items.map((contest: any) => {
    const effectiveStatus = contest.status === "OPEN" && new Date(contest.submissionDeadline) <= new Date() ? "JUDGING" : contest.status;
    return <tr id={`admin-row-${contest.id}`} key={contest.id} className={focusRowClass(contest.id, focusId)}><Cell><code>{formatPublicNo("contest", contest.publicNo)}</code></Cell><Cell><Link className="font-medium hover:underline" to={routes.ContestDetailsRoute.build({ params: { id: contest.id } })}>{contest.title}</Link><p className="max-w-xs truncate text-xs text-muted-foreground">{contest.description}</p></Cell><Cell>{contest.publisher.username ?? contest.publisher.email}</Cell><Cell><span className="font-semibold text-amber-600">{yuan(contest.totalPrizeCents)}</span><p className="text-xs text-muted-foreground">{contest._count?.entries ?? 0} 份投稿</p></Cell><Cell><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{contestStatusLabel(effectiveStatus)}</span></Cell><Cell>{dateTime(contest.submissionDeadline)}</Cell><Cell>{!["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED", "COOLING"].includes(contest.status) && (closingId === contest.id ? <InlineAction value={reason} setValue={setReason} placeholder="填写关闭原因（至少 3 个字）" confirmLabel="确认关闭" busy={busyId === contest.id} onCancel={() => { setClosingId(""); setReason(""); }} onConfirm={async () => { if (!window.confirm("确定关闭这个比赛并退回尚未发放的奖金？")) return; if (await act(contest.id, () => closeContest({ contestId: contest.id, reason }))) { setClosingId(""); setReason(""); } }} /> : <Button size="sm" variant="destructive" disabled={Boolean(busyId)} onClick={() => { setClosingId(contest.id); setReason(""); }}>关闭并退款</Button>)}</Cell></tr>;
  })}</Table>{!items.length && <EmptyState text="暂无比赛" />}</TableCard>;
}

function WithdrawalsPanel({ items, busyId, act, focusId }: PanelProps) {
  const [tokenId, setTokenId] = useState("");
  const [token, setToken] = useState("");
  return <TableCard title="待处理提现" count={items.length}><Table headers={["编号", "申请人", "申请金额", "实际发放", "状态", "申请时间", "操作"]}>{items.map((item: any) => <tr id={`admin-row-${item.id}`} key={item.id} className={focusRowClass(item.id, focusId)}><Cell><code>{formatPublicNo("withdrawal", item.publicNo)}</code></Cell><Cell><p className="font-medium">{item.user.username ?? "未设置昵称"}</p><p className="text-xs text-muted-foreground">{item.user.email}</p></Cell><Cell>{yuan(item.amountCents)}</Cell><Cell className="font-semibold text-emerald-600">{yuan(item.payoutCents)}</Cell><Cell><StatusBadge value={item.status} /></Cell><Cell>{dateTime(item.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2">{item.status === "REQUESTED" && (tokenId === item.id ? <InlineAction value={token} setValue={setToken} placeholder="输入支付宝红包口令" confirmLabel="确认录入" busy={busyId === item.id} minLength={4} onCancel={() => { setTokenId(""); setToken(""); }} onConfirm={async () => { if (await act(item.id, () => issueWithdrawalToken({ id: item.id, token }))) { setTokenId(""); setToken(""); } }} /> : <Button size="sm" disabled={Boolean(busyId)} onClick={() => { setTokenId(item.id); setToken(""); }}>录入口令</Button>)}<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busyId === item.id || item.status !== "TOKEN_ISSUED"} onClick={() => { if (window.confirm(`确定已向该用户发放 ${yuan(item.payoutCents)}？`)) void act(item.id, () => finalizeWithdrawal({ id: item.id, completed: true })); }}>标记完成</Button><Button size="sm" variant="destructive" disabled={busyId === item.id} onClick={() => { if (window.confirm("确定拒绝这笔提现并退回用户余额？")) void act(item.id, () => finalizeWithdrawal({ id: item.id, completed: false })); }}>拒绝</Button></div></div></Cell></tr>)}</Table>{!items.length && <EmptyState text="目前没有待处理提现" />}</TableCard>;
}

function AwardsPanel({ items, contestItems, busyId, act, focusId }: PanelProps & { contestItems: any[] }) {
  const [blockingId, setBlockingId] = useState("");
  const [reason, setReason] = useState("");
  const allItems = [
    ...items.map((award) => ({ ...award, source: "悬赏", title: award.task.title, rank: "" })),
    ...contestItems.map((award) => ({ ...award, source: "比赛", title: award.contest.title, rank: ({ FIRST: "一等奖", SECOND: "二等奖", THIRD: "三等奖" } as Record<string, string>)[award.prize.rank] })),
  ];
  return <TableCard title="冷却期奖励" count={allItems.length}><Table headers={["来源", "关联项目", "奖励金额", "状态", "预计入账", "操作"]}>{allItems.map((award: any) => {
    const isContest = award.source === "比赛";
    const toggle = (blocked: boolean, blockedReason?: string) => isContest ? setContestAwardBlocked({ awardId: award.id, blocked, reason: blockedReason }) : setAwardBlocked({ awardId: award.id, blocked, reason: blockedReason });
    return <tr id={`admin-row-${award.id}`} key={`${award.source}-${award.id}`} className={focusRowClass(award.id, focusId)}><Cell>{award.source}</Cell><Cell><p className="font-medium">{award.title}</p><p className="text-xs text-muted-foreground">{formatPublicNo(isContest ? "contest" : "task", isContest ? award.contest.publicNo : award.task.publicNo)}{award.rank ? ` · ${award.rank}` : ""}</p></Cell><Cell className="font-semibold">{yuan(award.amountCents)}</Cell><Cell><StatusBadge value={award.status} /></Cell><Cell>{dateTime(award.availableAt)}</Cell><Cell>{award.status === "BLOCKED" ? <div className="space-y-2"><p className="max-w-48 text-xs text-destructive">{award.blockedReason}</p><Button size="sm" variant="outline" disabled={busyId === award.id} onClick={() => void act(award.id, () => toggle(false))}>解除拦截</Button></div> : blockingId === `${award.source}-${award.id}` ? <InlineAction value={reason} setValue={setReason} placeholder="填写拦截原因（至少 3 个字）" confirmLabel="确认拦截" busy={busyId === award.id} onCancel={() => { setBlockingId(""); setReason(""); }} onConfirm={async () => { if (await act(award.id, () => toggle(true, reason))) { setBlockingId(""); setReason(""); } }} /> : <Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => { setBlockingId(`${award.source}-${award.id}`); setReason(""); }}>拦截奖励</Button>}</Cell></tr>;
  })}</Table>{!allItems.length && <EmptyState text="目前没有冷却期奖励" />}</TableCard>;
}

function UsersPanel({ currentUser, data, query, search, setSearch, page, setPage, busyId, act }: any) {
  const users = data?.users ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const [banningId, setBanningId] = useState("");
  const [reason, setReason] = useState("");
  return <div className="space-y-5"><Card className="shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">共 {data?.total ?? 0} 位用户</p><p className="text-sm text-muted-foreground">可按邮箱搜索并调整管理员权限</p></div><Input className="sm:max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索用户邮箱" /></CardContent></Card>
    <TableCard title="用户列表"><Table headers={["编号", "用户", "邮箱", "角色", "状态", "注册时间", "操作"]}>{users.map((item: any) => <tr key={item.id} className="border-b last:border-0"><Cell><Link className="font-mono font-semibold text-amber-700 hover:underline" to={routes.AdminUserDetailsRoute.build({ params: { id: item.id } })}>{formatPublicNo("user", item.publicNo)}</Link></Cell><Cell><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-slate-100 font-semibold dark:bg-slate-800">{(item.username ?? item.email ?? "用").slice(0, 1)}</span><span><Link className="block font-medium hover:underline" to={routes.AdminUserDetailsRoute.build({ params: { id: item.id } })}>{item.username ?? "未设置昵称"}</Link>{item.bannedReason && <span className="block max-w-44 truncate text-xs text-destructive">{item.bannedReason}</span>}</span></div></Cell><Cell>{item.email ?? "—"}</Cell><Cell><span className={item.isAdmin ? "font-medium text-amber-600" : "text-muted-foreground"}>{item.isAdmin ? "管理员" : "普通用户"}</span></Cell><Cell><span className={item.isBanned ? "text-destructive" : "text-emerald-600"}>{item.isBanned ? "已封禁" : "正常"}</span></Cell><Cell>{dateTime(item.createdAt)}</Cell><Cell><div className="flex min-w-52 flex-col gap-2"><div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link to={routes.AdminUserDetailsRoute.build({ params: { id: item.id } })}>查看详情</Link></Button><Button size="sm" variant="outline" disabled={busyId === item.id || item.id === currentUser.id} onClick={() => void act(item.id, () => updateIsUserAdminById({ id: item.id, isAdmin: !item.isAdmin }))}>{item.isAdmin ? "移除管理员" : "设为管理员"}</Button>{item.isBanned ? <Button size="sm" variant="outline" disabled={busyId === item.id || item.id === currentUser.id} onClick={() => void act(item.id, () => setUserBan({ id: item.id, banned: false }))}>解除封禁</Button> : <Button size="sm" variant="destructive" disabled={Boolean(busyId) || item.id === currentUser.id} onClick={() => { setBanningId(item.id); setReason(""); }}>封禁</Button>}</div>{banningId === item.id && <InlineAction value={reason} setValue={setReason} placeholder="填写封禁原因（至少 3 个字）" confirmLabel="确认封禁" busy={busyId === item.id} onCancel={() => { setBanningId(""); setReason(""); }} onConfirm={async () => { if (await act(item.id, () => setUserBan({ id: item.id, banned: true, reason }))) { setBanningId(""); setReason(""); } }} />}</div></Cell></tr>)}</Table>{query.isLoading && <LoadingState compact />}{!query.isLoading && !users.length && <EmptyState text="没有找到符合条件的用户" />}</TableCard>
    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value: number) => value - 1)}>上一页</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value: number) => value + 1)}>下一页</Button></div></div>
  </div>;
}

function UserDetailsPanel({ currentUser, data: user, loading, error, busyId, act }: any) {
  const [tab, setTab] = useState("ledger");
  const [bucket, setBucket] = useState<"RECHARGE" | "EARNINGS">("RECHARGE");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  if (loading) return <LoadingState />;
  if (error || !user) return <Card><CardContent className="p-10 text-center text-destructive">用户详情加载失败</CardContent></Card>;
  const wallet = user.wallet ?? { rechargeAvailableCents: 0, earningsAvailableCents: 0, withdrawalFrozenCents: 0 };
  const totalAvailable = wallet.rechargeAvailableCents + wallet.earningsAvailableCents;
  const tabs = [
    ["ledger", `资金流水 ${user._count.walletEntries}`], ["recharges", `充值 ${user._count.rechargeOrders}`], ["withdrawals", `提现 ${user._count.withdrawalRequests}`],
    ["publishedTasks", `发布悬赏 ${user._count.publishedTasks}`], ["workedTasks", `接取悬赏 ${user._count.taskClaims}`], ["publishedContests", `发布比赛 ${user._count.publishedContests}`], ["contestEntries", `比赛投稿 ${user._count.contestEntries}`],
  ];
  const adjust = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || reason.trim().length < 3) return;
    if (!window.confirm(`确定为 ${formatPublicNo("user", user.publicNo)} ${direction === "CREDIT" ? "增加" : "扣减"} ${yuan(amountCents)}？`)) return;
    if (await act(user.id, () => adjustUserWalletByAdmin({ userId: user.id, bucket, direction, amountCents, reason, requestId: crypto.randomUUID() }))) { setAmount(""); setReason(""); }
  };
  const orderAction = async (order: any, action: "CONFIRM_PAID" | "CLOSE" | "REFUND") => {
    const labels = { CONFIRM_PAID: "补记为已支付并增加用户充值余额", CLOSE: "关闭未支付订单", REFUND: "确认渠道退款并扣回用户充值余额" };
    const note = window.prompt(`${labels[action]}。请填写原因（至少 3 个字）：`)?.trim();
    if (!note || note.length < 3 || !window.confirm(`确定操作充值单 ${formatPublicNo("recharge", order.publicNo)}？`)) return;
    await act(order.id, () => setRechargeOrderStatusByAdmin({ id: order.id, action, reason: note }));
  };
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" asChild><Link to={routes.AdminUsersRoute.to}>← 返回用户列表</Link></Button><div className="flex gap-2"><Button variant="outline" disabled={busyId === user.id || user.id === currentUser.id} onClick={() => void act(user.id, () => updateIsUserAdminById({ id: user.id, isAdmin: !user.isAdmin }))}>{user.isAdmin ? "移除管理员" : "设为管理员"}</Button><Button variant={user.isBanned ? "outline" : "destructive"} disabled={busyId === user.id || user.id === currentUser.id} onClick={() => { if (user.isBanned) void act(user.id, () => setUserBan({ id: user.id, banned: false })); else { const note = window.prompt("填写封禁原因（至少 3 个字）：")?.trim(); if (note && note.length >= 3) void act(user.id, () => setUserBan({ id: user.id, banned: true, reason: note })); } }}>{user.isBanned ? "解除封禁" : "封禁用户"}</Button></div></div>
    <Card className="shadow-sm"><CardContent className="grid gap-5 p-6 lg:grid-cols-[1fr_2fr]"><div><div className="flex items-center gap-3"><span className="grid size-14 place-items-center rounded-full bg-amber-100 text-xl font-bold text-amber-800">{(user.username ?? user.email ?? "用").slice(0, 1)}</span><div><code className="font-semibold text-amber-700">{formatPublicNo("user", user.publicNo)}</code><h2 className="text-xl font-bold">{user.username ?? "未设置昵称"}</h2><p className="text-sm text-muted-foreground">{user.email ?? "未绑定邮箱"}</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1">{user.isAdmin ? "管理员" : "普通用户"}</span><span className={`rounded-full px-3 py-1 ${user.isBanned ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{user.isBanned ? "已封禁" : "账号正常"}</span><span className="rounded-full bg-muted px-3 py-1">注册于 {dateTime(user.createdAt)}</span></div></div><div className="grid gap-3 sm:grid-cols-4"><BalanceBox label="总可用" value={totalAvailable} /><BalanceBox label="充值余额" value={wallet.rechargeAvailableCents} /><BalanceBox label="收益余额" value={wallet.earningsAvailableCents} /><BalanceBox label="提现冻结" value={wallet.withdrawalFrozenCents} /></div></CardContent></Card>
    <Card className="border-amber-200 shadow-sm"><CardHeader><CardTitle className="text-lg">人工调账</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><select className="h-10 rounded-md border bg-background px-3" value={bucket} onChange={(event) => setBucket(event.target.value as typeof bucket)}><option value="RECHARGE">充值余额</option><option value="EARNINGS">收益余额</option></select><select className="h-10 rounded-md border bg-background px-3" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="CREDIT">增加</option><option value="DEBIT">扣减</option></select><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="金额（元）" /><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="调账原因（至少 3 个字）" /><Button disabled={busyId === user.id || Number(amount) <= 0 || reason.trim().length < 3} onClick={() => void adjust()}>确认调账</Button><p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-5">扣减不会允许余额变成负数。每次操作都会生成钱包流水、管理员审计并按用户偏好发送邮件。</p></CardContent></Card>
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(([value, label]) => <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>{label}</Button>)}</div>
    {tab === "ledger" && <TableCard title="资金流水"><Table headers={["时间", "类型", "充值变动", "收益变动", "冻结变动", "说明"]}>{user.walletEntries.map((entry: any) => <tr key={entry.id} className="border-b last:border-0"><Cell>{dateTime(entry.createdAt)}</Cell><Cell><code className="text-xs">{entry.type}</code></Cell><Cell>{signedYuan(entry.rechargeDeltaCents)}</Cell><Cell>{signedYuan(entry.earningsDeltaCents)}</Cell><Cell>{signedYuan(entry.frozenDeltaCents)}</Cell><Cell><span className="block max-w-xs text-xs text-muted-foreground">{entry.note ?? `${entry.referenceType} · ${entry.referenceId}`}</span></Cell></tr>)}</Table>{!user.walletEntries.length && <EmptyState text="暂无资金流水" />}</TableCard>}
    {tab === "recharges" && <TableCard title="充值订单"><Table headers={["编号", "网关订单号", "到账金额", "实付", "状态", "创建时间", "操作"]}>{user.rechargeOrders.map((order: any) => <tr key={order.id} className="border-b last:border-0"><Cell><code>{formatPublicNo("recharge", order.publicNo)}</code></Cell><Cell><code className="text-xs">{order.orderNo}</code></Cell><Cell>{yuan(order.creditCents)}</Cell><Cell>{yuan(order.payableCents)}</Cell><Cell><StatusBadge value={order.status} /></Cell><Cell>{dateTime(order.createdAt)}</Cell><Cell><div className="flex min-w-48 gap-2">{order.status === "CREATED" && <><Button size="sm" onClick={() => void orderAction(order, "CONFIRM_PAID")}>补记支付</Button><Button size="sm" variant="outline" onClick={() => void orderAction(order, "CLOSE")}>关闭</Button></>}{order.status === "PAID" && <Button size="sm" variant="destructive" onClick={() => void orderAction(order, "REFUND")}>确认退款</Button>}{["CLOSED", "REFUNDED"].includes(order.status) && <span className="text-xs text-muted-foreground">终态不可倒退</span>}</div></Cell></tr>)}</Table>{!user.rechargeOrders.length && <EmptyState text="暂无充值订单" />}</TableCard>}
    {tab === "withdrawals" && <TableCard title="提现订单"><Table headers={["编号", "申请金额", "实际发放", "状态", "申请时间"]}>{user.withdrawalRequests.map((item: any) => <tr key={item.id} className="border-b last:border-0"><Cell><code>{formatPublicNo("withdrawal", item.publicNo)}</code></Cell><Cell>{yuan(item.amountCents)}</Cell><Cell>{yuan(item.payoutCents)}</Cell><Cell><StatusBadge value={item.status} /></Cell><Cell>{dateTime(item.createdAt)}</Cell></tr>)}</Table>{!user.withdrawalRequests.length && <EmptyState text="暂无提现订单" />}</TableCard>}
    {tab === "publishedTasks" && <BusinessTable title="发布的悬赏" kind="task" items={user.publishedTasks} />}
    {tab === "workedTasks" && <BusinessTable title="接取的悬赏" kind="task" items={user.taskClaims.map((item: any) => ({ ...item.task, createdAt: item.claimedAt }))} />}
    {tab === "publishedContests" && <BusinessTable title="发布的比赛" kind="contest" items={user.publishedContests} />}
    {tab === "contestEntries" && <BusinessTable title="比赛投稿" kind="contest" items={user.contestEntries.map((item: any) => ({ ...item.contest, createdAt: item.submittedAt }))} />}
  </div>;
}

function BalanceBox({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{yuan(value)}</p></div>; }

function BusinessTable({ title, kind, items }: { title: string; kind: "task" | "contest"; items: any[] }) {
  return <TableCard title={title}><Table headers={["编号", "标题", "金额", "状态", "时间"]}>{items.map((item) => <tr key={item.id} className="border-b last:border-0"><Cell><code>{formatPublicNo(kind, item.publicNo)}</code></Cell><Cell><Link className="font-medium hover:underline" to={kind === "task" ? routes.TaskDetailsRoute.build({ params: { id: item.id } }) : routes.ContestDetailsRoute.build({ params: { id: item.id } })}>{item.title}</Link></Cell><Cell>{yuan(kind === "task" ? item.budgetCents : item.totalPrizeCents)}</Cell><Cell><StatusBadge value={item.status} /></Cell><Cell>{dateTime(item.createdAt)}</Cell></tr>)}</Table>{!items.length && <EmptyState text={`暂无${title}`} />}</TableCard>;
}

function InlineAction({ value, setValue, placeholder, confirmLabel, busy, onCancel, onConfirm, minLength = 3 }: { value: string; setValue: (value: string) => void; placeholder: string; confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void>; minLength?: number }) {
  return <div className="space-y-2 rounded-lg border bg-muted/40 p-2"><Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} /><div className="flex gap-2"><Button size="sm" disabled={busy || value.trim().length < minLength} onClick={() => void onConfirm()}>{confirmLabel}</Button><Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>取消</Button></div></div>;
}

type LedgerFilters = { search: string; type: string; from: string; to: string };
const emptyLedgerFilters: LedgerFilters = { search: "", type: "", from: "", to: "" };
const ledgerArgs = (filters: LedgerFilters, page: number, exportAll = false) => ({
  page,
  pageSize: exportAll ? 1_000 : 50,
  search: filters.search || undefined,
  type: filters.type || undefined,
  from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
  to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
  exportAll,
});
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function LedgerPanel() {
  const [draft, setDraft] = useState<LedgerFilters>(emptyLedgerFilters);
  const [filters, setFilters] = useState<LedgerFilters>(emptyLedgerFilters);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const query = useQuery(getAdminWalletEntries, ledgerArgs(filters, page));
  const data = query.data as any;
  const entries = data?.entries ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 50));
  const setDraftField = (key: keyof LedgerFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const apply = () => { setPage(1); setFilters({ ...draft }); };
  const reset = () => { setDraft(emptyLedgerFilters); setFilters(emptyLedgerFilters); setPage(1); };
  const exportCsv = async () => {
    setExporting(true); setExportMessage("");
    try {
      const result = await getAdminWalletEntries(ledgerArgs(filters, 1, true)) as any;
      const rows = [
        ["时间", "用户名", "邮箱", "类型", "充值变动（分）", "收益变动（分）", "冻结变动（分）", "关联类型", "关联编号"],
        ...(result.entries ?? []).map((entry: any) => [dateTime(entry.createdAt), entry.user?.username ?? "", entry.user?.email ?? "", entry.type, entry.rechargeDeltaCents, entry.earningsDeltaCents, entry.frozenDeltaCents, entry.referenceType, entry.referenceId]),
      ];
      const blob = new Blob(["\ufeff", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `wallet-ledger-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      URL.revokeObjectURL(url);
      if (result.truncated) setExportMessage("匹配记录超过 1000 条，本次只导出最新 1000 条。");
    } catch (error: any) {
      setExportMessage(error?.response?.data?.message ?? error?.message ?? "导出失败");
    } finally { setExporting(false); }
  };

  return <div className="space-y-5">
    <Card className="shadow-sm"><CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
      <Input value={draft.search} onChange={(event) => setDraftField("search", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") apply(); }} placeholder="编号、邮箱或用户名" />
      <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={draft.type} onChange={(event) => setDraftField("type", event.target.value)}><option value="">全部类型</option>{(data?.types ?? []).map((type: string) => <option key={type} value={type}>{type}</option>)}</select>
      <Input type="date" aria-label="开始日期" value={draft.from} onChange={(event) => setDraftField("from", event.target.value)} />
      <Input type="date" aria-label="结束日期" value={draft.to} onChange={(event) => setDraftField("to", event.target.value)} />
      <div className="flex gap-2"><Button onClick={apply}>查询</Button><Button variant="outline" onClick={reset}>重置</Button></div>
    </CardContent></Card>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">共 {data?.total ?? 0} 条记录</span><div className="flex items-center gap-3"><span className="text-amber-700 dark:text-amber-300">{exportMessage}</span><Button variant="outline" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? "正在导出…" : "导出 CSV"}</Button></div></div>
    <TableCard title="钱包流水"><Table headers={["时间", "用户", "类型", "充值变动", "收益变动", "冻结变动", "关联编号"]}>{entries.map((entry: any) => <tr key={entry.id} className="border-b last:border-0"><Cell>{dateTime(entry.createdAt)}</Cell><Cell><p className="font-medium">{entry.user?.username ?? "未设置昵称"}</p><p className="text-xs text-muted-foreground">{entry.user?.email ?? "—"}</p></Cell><Cell><code className="text-xs">{entry.type}</code>{entry.note && <p className="max-w-48 text-xs text-muted-foreground">{entry.note}</p>}</Cell><Cell className={entry.rechargeDeltaCents < 0 ? "text-red-600" : entry.rechargeDeltaCents > 0 ? "text-emerald-600" : "text-muted-foreground"}>{signedYuan(entry.rechargeDeltaCents)}</Cell><Cell className={entry.earningsDeltaCents < 0 ? "text-red-600" : entry.earningsDeltaCents > 0 ? "text-emerald-600" : "text-muted-foreground"}>{signedYuan(entry.earningsDeltaCents)}</Cell><Cell className={entry.frozenDeltaCents < 0 ? "text-red-600" : entry.frozenDeltaCents > 0 ? "text-emerald-600" : "text-muted-foreground"}>{signedYuan(entry.frozenDeltaCents)}</Cell><Cell><p className="text-xs text-muted-foreground">{entry.referenceType}</p><code className="text-xs">{entry.referenceId}</code></Cell></tr>)}</Table>{query.isLoading && <LoadingState compact />}{query.error && <div className="p-5 text-sm text-destructive">流水加载失败，请稍后重试</div>}{!query.isLoading && !query.error && !entries.length && <EmptyState text="没有找到符合条件的资金流水" />}</TableCard>
    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || query.isLoading} onClick={() => setPage((value) => value - 1)}>上一页</Button><Button variant="outline" disabled={page >= totalPages || query.isLoading} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
  </div>;
}

function signedYuan(cents: number) {
  if (!cents) return "—";
  return `${cents > 0 ? "+" : "-"}${yuan(Math.abs(cents))}`;
}

function AuditPanel({ items }: { items: any[] }) {
  const labels: Record<string, string> = { SYSTEM_SETTINGS_UPDATED: "更新系统设置", ANNOUNCEMENT_CREATED: "创建公告", ANNOUNCEMENT_UPDATED: "更新公告", GIFT_CARD_BATCH_CREATED: "创建礼品卡批次", GIFT_CARD_BATCH_ENABLED: "恢复礼品卡批次", GIFT_CARD_BATCH_DISABLED: "停用礼品卡批次", GIFT_CARD_ENABLED: "恢复礼品卡", GIFT_CARD_DISABLED: "停用礼品卡", AWARD_BLOCKED: "拦截奖励", AWARD_UNBLOCKED: "解除奖励拦截", CONTEST_AWARD_BLOCKED: "拦截比赛奖励", CONTEST_AWARD_UNBLOCKED: "解除比赛奖励拦截", WITHDRAWAL_TOKEN_ISSUED: "发放提现口令", WITHDRAWAL_COMPLETED: "完成提现", WITHDRAWAL_REJECTED: "拒绝提现", USER_BANNED: "封禁用户", USER_UNBANNED: "解除用户封禁", USER_ADMIN_GRANTED: "授予管理员", USER_ADMIN_REVOKED: "移除管理员", USER_BALANCE_CREDITED: "人工增加余额", USER_BALANCE_DEBITED: "人工扣减余额", RECHARGE_ORDER_CONFIRMED: "补记充值支付", RECHARGE_ORDER_CLOSED: "关闭充值订单", RECHARGE_ORDER_REFUNDED: "确认充值退款", TASK_CLOSED: "关闭任务", TASK_CLOSED_AND_REFUNDED: "关闭任务并退款", TASK_APPEAL_PAID: "申诉裁定支付", TASK_APPEAL_REOPENED: "申诉裁定重新开放", CONTEST_CLOSED: "关闭比赛", CONTEST_CLOSED_AND_REFUNDED: "关闭比赛并退款" };
  return <TableCard title="管理员操作记录" count={items.length}><Table headers={["操作", "目标类型", "目标编号", "说明", "管理员编号", "时间"]}>{items.map((item) => <tr key={item.id} className="border-b last:border-0"><Cell className="font-medium">{labels[item.action] ?? item.action}</Cell><Cell>{item.targetType}</Cell><Cell><code className="text-xs">{item.targetId}</code></Cell><Cell><span className="block max-w-64 text-xs text-muted-foreground">{item.metadata?.reason ?? item.metadata?.note ?? "—"}</span></Cell><Cell><code className="text-xs">{item.adminId}</code></Cell><Cell>{dateTime(item.createdAt)}</Cell></tr>)}</Table>{!items.length && <EmptyState text="暂无管理员操作记录" />}</TableCard>;
}

function TableCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) { return <Card className="overflow-hidden border-0 shadow-sm"><CardHeader className="border-b bg-background"><CardTitle className="flex items-center justify-between text-lg"><span>{title}</span>{count !== undefined && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{count} 项</span>}</CardTitle></CardHeader><CardContent className="p-0">{children}</CardContent></Card>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs tracking-wide text-muted-foreground dark:bg-slate-900"><tr>{headers.map((header) => <th key={header} className="px-5 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-5 py-4 align-middle ${className}`}>{children}</td>; }
function StatusBadge({ value }: { value: string }) { return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{statusLabel(value)}</span>; }
function EmptyState({ text }: { text: string }) { return <div className="grid place-items-center gap-2 px-6 py-14 text-center text-muted-foreground"><CheckCircle2 className="size-9 text-emerald-500" /><p className="text-sm">{text}</p></div>; }
function LoadingState({ compact = false }: { compact?: boolean }) { return <div className={`animate-pulse rounded-xl bg-muted ${compact ? "m-5 h-12" : "h-72"}`} aria-label="正在加载" />; }
