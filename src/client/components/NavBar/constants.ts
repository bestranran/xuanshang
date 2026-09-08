import { routes } from "wasp/client/router";
import type { NavigationItem } from "./NavBar";

export const marketingNavigationItems: NavigationItem[] = [
  { name: "浏览悬赏", to: routes.TaskListRoute.to },
  { name: "浏览比赛", to: routes.ContestListRoute.to },
] as const;

export const demoNavigationitems: NavigationItem[] = [
  { name: "悬赏大厅", to: routes.TaskListRoute.to },
  { name: "比赛大厅", to: routes.ContestListRoute.to },
  { name: "余额中心", to: routes.WalletRoute.to },
] as const;
