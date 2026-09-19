import { BriefcaseBusiness, LayoutDashboard, Settings } from "lucide-react";
import { routes } from "wasp/client/router";

export const userMenuItems = [
  {
    name: "我的工作",
    to: routes.MyWorkRoute.to,
    icon: BriefcaseBusiness,
    isAdminOnly: false,
    isAuthRequired: true,
  },
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
] as const;
