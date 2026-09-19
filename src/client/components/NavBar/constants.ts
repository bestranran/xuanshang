import { routes } from "wasp/client/router";
import type { NavigationItem } from "./NavBar";

export const demoNavigationitems: NavigationItem[] = [
  { name: "发现悬赏", to: routes.TaskListRoute.to },
  { name: "创意比赛", to: routes.ContestListRoute.to },
  { name: "公告", to: routes.AnnouncementListRoute.to },
  { name: "我的工作", to: routes.MyWorkRoute.to },
  { name: "钱包", to: routes.WalletRoute.to },
] as const;
