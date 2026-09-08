import { LayoutDashboard, Settings, Shield } from "lucide-react";
import { routes } from "wasp/client/router";

export const userMenuItems = [
  {
    name: "悬赏大厅",
    to: routes.TaskListRoute.to,
    icon: LayoutDashboard,
    isAdminOnly: false,
    isAuthRequired: true,
  },
  {
    name: "账号设置",
    to: routes.AccountRoute.to,
    icon: Settings,
    isAuthRequired: false,
    isAdminOnly: false,
  },
  {
    name: "管理后台",
    to: routes.AdminRoute.to,
    icon: Shield,
    isAuthRequired: false,
    isAdminOnly: true,
  },
] as const;
