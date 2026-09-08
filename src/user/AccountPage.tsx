import type { User } from "wasp/entities";
import { Card, CardContent, CardHeader, CardTitle } from "../client/components/ui/card";

export function AccountPage({ user }: { user: User }) {
  return <main className="mx-auto max-w-3xl px-6 py-10">
    <Card><CardHeader><CardTitle>账号资料</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p><span className="text-muted-foreground">邮箱：</span>{user.email ?? "未设置"}</p>
      <p><span className="text-muted-foreground">用户名：</span>{user.username ?? "未设置"}</p>
      <p><span className="text-muted-foreground">账号状态：</span>{user.isBanned ? "已封禁（只读）" : "正常"}</p>
    </CardContent></Card>
  </main>;
}
