import { useEffect, useState } from "react";
import type { User } from "wasp/entities";
import { getNotificationPreferences, updateNotificationPreferences, updateProfile, useQuery } from "wasp/client/operations";
import { Button } from "../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../client/components/ui/card";
import { Input } from "../client/components/ui/input";
import { Switch } from "../client/components/ui/switch";
import { formatPublicNo } from "../shared/publicNo";

export function AccountPage({ user }: { user: User }) {
  const profile = user as User & { bio?: string | null; skills?: string[]; portfolioLinks?: string[]; avatarUrl?: string | null };
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const preferencesQuery = useQuery(getNotificationPreferences);
  async function submit(form: HTMLFormElement) {
    setBusy(true); setMessage(""); const values = new FormData(form);
    try { await updateProfile({ bio: String(values.get("bio") || "") || undefined, avatarUrl: String(values.get("avatarUrl") || "") || undefined, skills: String(values.get("skills") || "").split(/[，,]/).map((item) => item.trim()).filter(Boolean), portfolioLinks: String(values.get("portfolioLinks") || "").split(/\n/).map((item) => item.trim()).filter(Boolean) }); setMessage("个人资料已保存"); }
    catch (error: any) { setMessage(error?.response?.data?.message ?? error?.message ?? "保存失败"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10"><div className="page-heading"><h1>账号与公开资料</h1><p>用户编号 {formatPublicNo("user", (user as any).publicNo)} · 管理公开资料和你希望收到的邮件。</p></div><Card><CardHeader><CardTitle>基本资料</CardTitle></CardHeader><CardContent><form className="create-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><div className="form-row"><label>用户名<Input value={user.username ?? ""} disabled /></label><label>邮箱<Input value={user.email ?? ""} disabled /></label></div><label>头像网址<Input name="avatarUrl" type="url" defaultValue={profile.avatarUrl ?? ""} placeholder="https://" /></label><label>个人简介<textarea name="bio" defaultValue={profile.bio ?? ""} maxLength={1000} placeholder="介绍你的经验、工作方式和擅长解决的问题" /></label><label>技能标签<Input name="skills" defaultValue={(profile.skills ?? []).join("，")} placeholder="设计，文案，React" /></label><label>作品链接（每行一个）<textarea name="portfolioLinks" defaultValue={(profile.portfolioLinks ?? []).join("\n")} placeholder="https://example.com/portfolio" /></label><div className="escrow-summary"><div><strong>账号状态：{user.isBanned ? "只读" : "正常"}</strong><p>完成数、按时率、通过率和经过验证的评价由平台自动生成。</p></div></div>{message && <p className="form-help">{message}</p>}<Button disabled={busy || user.isBanned}>{busy ? "保存中…" : "保存公开资料"}</Button></form></CardContent></Card><EmailPreferences data={preferencesQuery.data as any} loading={preferencesQuery.isLoading} /></main>;
}

function EmailPreferences({ data, loading }: { data: any; loading: boolean }) {
  const [values, setValues] = useState({ taskEmails: true, contestEmails: true, walletEmails: true, announcementEmails: true });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (data) setValues({ taskEmails: data.taskEmails, contestEmails: data.contestEmails, walletEmails: data.walletEmails, announcementEmails: data.announcementEmails }); }, [data]);
  if (loading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">正在加载邮件设置…</CardContent></Card>;
  const items = [["taskEmails", "悬赏动态", "接取、交付、验收和审核结果"], ["contestEmails", "比赛动态", "投稿、评选和获奖结果"], ["walletEmails", "资金动态", "充值到账、奖励到账和提现状态"], ["announcementEmails", "平台公告", "功能更新、规则调整和运营通知"]] as const;
  async function save() { setSaving(true); setMessage(""); try { await updateNotificationPreferences(values); setMessage("邮件设置已保存"); } catch (error: any) { setMessage(error?.message ?? "保存失败"); } finally { setSaving(false); } }
  return <Card><CardHeader><CardTitle>邮件通知</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">安全验证和密码重置邮件始终发送，不受以下设置影响。</p>{items.map(([key, title, description]) => <div key={key} className="flex items-center justify-between gap-6 rounded-xl border p-4"><div><strong className="block text-sm">{title}</strong><span className="text-xs text-muted-foreground">{description}</span></div><Switch checked={values[key]} onCheckedChange={(checked) => setValues((current) => ({ ...current, [key]: checked }))} aria-label={title} /></div>)}<div className="flex items-center gap-4"><Button disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存邮件设置"}</Button>{message && <span className="text-sm text-muted-foreground">{message}</span>}</div></CardContent></Card>;
}
