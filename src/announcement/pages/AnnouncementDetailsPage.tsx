import { ArrowLeft, Pin } from "lucide-react";
import { Link, useParams } from "react-router";
import { getAnnouncement, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";

export function AnnouncementDetailsPage() {
  const { id = "" } = useParams();
  const query = useQuery(getAnnouncement, { id });
  const item = query.data as any;
  if (query.isLoading) return <main className="market-page"><div className="market-empty">正在加载公告…</div></main>;
  if (!item) return <main className="market-page"><div className="market-empty">公告不存在或已撤下。</div></main>;
  return <main className="market-page announcement-detail"><Link className="back-link" to={routes.AnnouncementListRoute.to}><ArrowLeft size={16} />返回公告列表</Link><article><div>{item.isPinned && <span className="announcement-pin"><Pin size={12} />置顶</span>}<h1>{item.title}</h1><p>{item.summary}</p><small>{new Date(item.publishedAt).toLocaleString("zh-CN", { hour12: false })}</small></div><div className="announcement-content">{item.content}</div></article></main>;
}
