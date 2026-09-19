import { Bell, ChevronRight, Pin } from "lucide-react";
import { Link } from "react-router";
import { getAnnouncements, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";

export function AnnouncementListPage() {
  const query = useQuery(getAnnouncements);
  const items = (query.data ?? []) as any[];
  return <main className="market-page">
    <div className="page-heading"><span className="market-eyebrow"><Bell size={15} />平台动态</span><h1>公告</h1><p>查看平台规则、功能更新和重要运营通知。</p></div>
    {query.isLoading ? <div className="market-empty">正在加载公告…</div> : query.error ? <div className="market-empty">公告加载失败，请稍后重试。</div> : !items.length ? <div className="market-empty"><Bell /><strong>暂时没有公告</strong></div> : <section className="announcement-list">{items.map((item) => <Link key={item.id} className="announcement-row" to={routes.AnnouncementDetailsRoute.build({ params: { id: item.id } })}><div>{item.isPinned && <span className="announcement-pin"><Pin size={12} />置顶</span>}<h2>{item.title}</h2><p>{item.summary}</p><small>{new Date(item.publishedAt).toLocaleString("zh-CN", { hour12: false })}</small></div><ChevronRight /></Link>)}</section>}
  </main>;
}
