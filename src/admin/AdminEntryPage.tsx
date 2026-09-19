import { useLocation } from "react-router";
import { useAuth } from "wasp/client/auth";
import { AuthPageLayout } from "../auth/AuthPageLayout";
import { ChineseLoginForm } from "../auth/ChineseAuthForms";
import { AdminPage } from "../bounty/pages/AdminPage";
import { Card, CardContent } from "../client/components/ui/card";

export function AdminEntryPage() {
  const { pathname } = useLocation();
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">正在验证身份…</main>;
  }

  if (!user) {
    return <AuthPageLayout><ChineseLoginForm redirectTo={pathname} title="管理后台登录" /></AuthPageLayout>;
  }

  if (!user.isAdmin) {
    return <main className="grid min-h-screen place-items-center"><Card><CardContent className="p-10 text-center"><h1 className="text-xl font-bold">无权访问管理后台</h1></CardContent></Card></main>;
  }

  return <AdminPage user={user} />;
}
