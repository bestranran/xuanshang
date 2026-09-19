import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, Trophy } from "lucide-react";
import { Link } from "react-router";
import { getMyWork, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import { statusLabel } from "../labels";
import { formatPublicNo } from "../../shared/publicNo";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);

export function MyWorkPage() {
  const query = useQuery(getMyWork);
  if (query.isLoading) return <main className="market-page"><div className="market-empty">正在加载我的工作…</div></main>;
  const data = query.data as any;
  const needsAction = [
    ...data.published.filter((task: any) => ["SUBMITTED", "PENDING_PAYMENT"].includes(task.status)).map((task: any) => ({ ...task, kind: "发布的悬赏" })),
    ...data.claims.filter((item: any) => !item.outcome && ["CLAIMED", "REVISION_REQUESTED", "REJECTED_PENDING_APPEAL"].includes(item.task.status)).map((item: any) => ({ ...item.task, kind: "接取的悬赏" })),
  ];
  return <main className="market-page"><div className="page-heading"><span className="market-eyebrow"><BriefcaseBusiness size={15} /> 我的工作</span><h1>今天需要推进什么？</h1><p>发布、接取、审核和参赛记录都在这里。</p></div>
    {needsAction.length > 0 && <section><div className="section-heading"><div><h2>等待你处理</h2><p>{needsAction.length} 项需要操作</p></div></div><div className="work-list">{needsAction.map((item: any) => <WorkRow key={`${item.kind}-${item.id}`} item={item} kind={item.kind} />)}</div></section>}
    <div className="work-columns"><section><div className="section-heading"><div><h2>我发布的</h2><p>{data.published.length} 个悬赏</p></div></div><div className="work-list">{data.published.length ? data.published.map((item: any) => <WorkRow key={item.id} item={item} kind="发布" />) : <Empty />}</div></section><section><div className="section-heading"><div><h2>我接取的</h2><p>{data.claims.length} 条记录</p></div></div><div className="work-list">{data.claims.length ? data.claims.map((claim: any) => <WorkRow key={claim.id} item={claim.task} kind="接取" />) : <Empty />}</div></section></div>
    <section><div className="section-heading"><div><h2>我参加的比赛</h2><p>{data.contests.length} 份作品</p></div><Link to={routes.ContestListRoute.to}>浏览比赛 <ArrowRight size={16} /></Link></div><div className="work-list">{data.contests.length ? data.contests.map((entry: any) => <Link className="work-row" key={entry.id} to={routes.ContestDetailsRoute.build({ params: { id: entry.contest.id } })}><span className="work-icon"><Trophy /></span><div><b>{entry.contest.title}</b><small>{formatPublicNo("contest", entry.contest.publicNo)} · {statusLabel(entry.contest.status)} · {entry.contest.prizes.length} 个奖项</small></div><ArrowRight /></Link>) : <Empty />}</div></section>
  </main>;
}

function WorkRow({ item, kind }: { item: any; kind: string }) { const done = item.status === "COMPLETED"; return <Link className="work-row" to={routes.TaskDetailsRoute.build({ params: { id: item.id } })}><span className="work-icon">{done ? <CheckCircle2 /> : <Clock3 />}</span><div><b>{item.title}</b><small>{formatPublicNo("task", item.publicNo)} · {kind} · {statusLabel(item.status)}</small></div><strong>{money(item.budgetCents)}</strong><ArrowRight /></Link>; }
function Empty() { return <div className="work-empty">暂无记录</div>; }
