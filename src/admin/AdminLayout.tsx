import {
  ArrowLeft,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  ScrollText,
  ShieldAlert,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import type { User } from "wasp/entities";
import { Link, routes } from "wasp/client/router";
import { DarkModeSwitcher } from "../client/components/DarkModeSwitcher";
import logo from "../client/static/logo.svg";
import { cn } from "../client/utils";
import { UserDropdown } from "../user/UserDropdown";

type Counts = { tasks?: number; withdrawals?: number; awards?: number };

const navigation = [
  { label: "数据概览", route: routes.AdminRoute.to, icon: LayoutDashboard },
  { label: "悬赏管理", route: routes.AdminTasksRoute.to, icon: ClipboardCheck, count: "tasks" },
  { label: "比赛管理", route: routes.AdminContestsRoute.to, icon: ClipboardCheck },
  { label: "提现管理", route: routes.AdminWithdrawalsRoute.to, icon: WalletCards, count: "withdrawals" },
  { label: "奖励冷却", route: routes.AdminAwardsRoute.to, icon: ShieldAlert, count: "awards" },
  { label: "用户管理", route: routes.AdminUsersRoute.to, icon: Users },
  { label: "审计记录", route: routes.AdminAuditRoute.to, icon: ScrollText },
] as const;

export function AdminLayout({
  user,
  title,
  description,
  counts,
  children,
}: {
  user: User;
  title: string;
  description: string;
  counts: Counts;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);

  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    {open && <button className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" aria-label="关闭侧边栏遮罩" onClick={() => setOpen(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-20 items-center justify-between border-b border-slate-800 px-6">
        <Link to={routes.AdminRoute.to} className="flex items-center gap-3 font-semibold text-white">
          <img src={logo} alt="悬赏" className="size-9 rounded-lg" />
          <span><span className="block text-base">悬赏管理台</span><span className="block text-xs font-normal text-slate-400">运营与资金控制中心</span></span>
        </Link>
        <button className="lg:hidden" aria-label="关闭侧边栏" onClick={() => setOpen(false)}><X className="size-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 py-6">
        <p className="mb-3 px-3 text-xs font-semibold tracking-[0.18em] text-slate-500">管理菜单</p>
        <ul className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const count = "count" in item ? counts[item.count] : undefined;
            return <li key={item.route}><NavLink to={item.route} end className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition", isActive ? "bg-amber-400 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white")}>
              <Icon className="size-5" /><span className="flex-1">{item.label}</span>{Boolean(count) && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{count}</span>}
            </NavLink></li>;
          })}
        </ul>
        <p className="mb-3 mt-8 px-3 text-xs font-semibold tracking-[0.18em] text-slate-500">快捷入口</p>
        <Link to={routes.TaskListRoute.to} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"><ArrowLeft className="size-5" />返回悬赏大厅</Link>
      </nav>
      <div className="border-t border-slate-800 px-6 py-5 text-xs text-slate-500">悬赏平台 · 管理员专用</div>
    </aside>
    <div className="lg:pl-72">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b bg-background/95 px-5 backdrop-blur md:px-8">
        <button className="rounded-lg border p-2 lg:hidden" aria-label="打开侧边栏" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold">{title}</h1><p className="hidden truncate text-sm text-muted-foreground sm:block">{description}</p></div>
        <DarkModeSwitcher />
        <UserDropdown user={user} />
      </header>
      <main className="mx-auto max-w-7xl p-5 md:p-8">{children}</main>
    </div>
  </div>;
}
