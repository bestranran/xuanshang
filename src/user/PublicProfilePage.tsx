import { Award, CheckCircle2, ExternalLink, ShieldCheck, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { getPublicProfile, useQuery } from "wasp/client/operations";
import { formatPublicNo } from "../shared/publicNo";

export function PublicProfilePage() {
  const { username = "" } = useParams();
  const query = useQuery(getPublicProfile, { username });
  if (query.isLoading) return <main className="market-page"><div className="market-empty">正在加载个人主页…</div></main>;
  const profile = query.data as any;
  if (!profile) return <main className="market-page"><div className="market-empty">未找到用户</div></main>;
  const portfolioLinks = profile.portfolioLinks.flatMap((link: string) => {
    try {
      const url = new URL(link);
      return url.protocol === "http:" || url.protocol === "https:" ? [{ href: url.href, hostname: url.hostname }] : [];
    } catch {
      return [];
    }
  });
  return <main className="profile-page"><header className="profile-header">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile.username.slice(0, 1)}</span>}<div><small>已验证平台用户 · {formatPublicNo("user", profile.publicNo)}</small><h1>{profile.username}</h1><p>{profile.bio || "这位用户还没有填写简介。"}</p><div className="skill-list">{profile.skills.map((skill: string) => <b key={skill}>{skill}</b>)}</div></div></header>
    <section className="profile-stats"><Stat icon={<CheckCircle2 />} label="完成悬赏" value={profile.stats.completed} /><Stat icon={<ShieldCheck />} label="按时完成" value={`${profile.stats.onTimeRate}%`} /><Stat icon={<Award />} label="成果通过" value={`${profile.stats.approvalRate}%`} /><Stat icon={<Trophy />} label="比赛获奖" value={profile.stats.contestWins} /></section>
    <div className="profile-columns"><section className="detail-panel"><h2>已验证评价</h2><div>{profile.reviewsReceived.length ? profile.reviewsReceived.map((review: any) => <blockquote className="review-row" key={review.id}><p>“{review.content}”</p><footer>{review.reviewer.username ?? "平台用户"} · 来自《{review.task.title}》</footer></blockquote>) : <p className="muted">完成合作后，经过验证的评价会显示在这里。</p>}</div></section><section className="detail-panel"><h2>作品与链接</h2><div className="portfolio-list">{portfolioLinks.length ? portfolioLinks.map((link: { href: string; hostname: string }) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer"><ExternalLink />{link.hostname}</a>) : <p className="muted">暂无公开作品链接。</p>}</div></section></div>
  </main>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <div>{icon}<span>{label}</span><strong>{value}</strong></div>; }
