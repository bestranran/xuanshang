import daBoiAvatar from "../client/static/da-boi.webp";
import kivo from "../client/static/examples/kivo.webp";
import messync from "../client/static/examples/messync.webp";
import microinfluencerClub from "../client/static/examples/microinfluencers.webp";
import promptpanda from "../client/static/examples/promptpanda.webp";
import reviewradar from "../client/static/examples/reviewradar.webp";
import scribeist from "../client/static/examples/scribeist.webp";
import searchcraft from "../client/static/examples/searchcraft.webp";
import { BlogUrl, DocsUrl } from "../shared/common";
import type { GridFeature } from "./components/FeaturesGrid";

export const features: GridFeature[] = [
  {
    name: "便捷报名",
    description: "快速提交接单申请",
    emoji: "🤝",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "账号安全",
    description: "可靠的身份验证机制",
    emoji: "🔐",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "资金分桶",
    description: "充值余额与收益余额独立管理",
    emoji: "🥞",
    href: DocsUrl,
    size: "medium",
  },
  {
    name: "资金托管",
    description: "发布悬赏时自动锁定任务预算",
    emoji: "💸",
    href: DocsUrl,
    size: "large",
  },
  {
    name: "交付验收",
    description: "成果提交与发布者验收完整闭环",
    emoji: "💼",
    href: DocsUrl,
    size: "large",
  },
  {
    name: "清晰账目",
    description: "每笔资金变动均有记录",
    emoji: "📈",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "邮件通知",
    description: "重要账号操作及时通知",
    emoji: "📧",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "自动结算",
    description: "冷却期结束后奖励自动入账",
    emoji: "🤖",
    href: DocsUrl,
    size: "medium",
  },
  {
    name: "高效发布",
    description: "几步即可创建并提交悬赏",
    emoji: "🚀",
    href: DocsUrl,
    size: "medium",
  },
];

export const testimonials = [
  {
    name: "小瓦",
    role: "平台体验官",
    avatarSrc: daBoiAvatar,
    socialUrl: "https://twitter.com/wasplang",
    quote: "任务要求和资金去向都很清楚。",
  },
  {
    name: "林先生",
    role: "创业者",
    avatarSrc: daBoiAvatar,
    socialUrl: "",
    quote: "从发布到验收，整个流程简单省心。",
  },
  {
    name: "佳敏",
    role: "自由职业者",
    avatarSrc: daBoiAvatar,
    socialUrl: "#",
    quote: "交付完成后，收益入账一目了然。",
  },
];

export const faqs = [
  {
    id: 1,
    question: "悬赏资金如何保障？",
    answer: "发布时锁定预算，验收并结束冷却期后才向接单者结算。",
    href: "https://en.wikipedia.org/wiki/42_(number)",
  },
];

export const footerNavigation = {
  app: [
    { name: "使用文档", href: DocsUrl },
    { name: "博客", href: BlogUrl },
  ],
  company: [
    { name: "关于我们", href: "https://wasp.sh" },
    { name: "隐私政策", href: "#" },
    { name: "服务条款", href: "#" },
  ],
};

export const examples = [
  {
    name: "案例一",
    description: "悬赏案例展示。",
    imageSrc: kivo,
    href: "#",
  },
  {
    name: "案例二",
    description: "悬赏案例展示。",
    imageSrc: messync,
    href: "#",
  },
  {
    name: "案例三",
    description: "悬赏案例展示。",
    imageSrc: microinfluencerClub,
    href: "#",
  },
  {
    name: "案例四",
    description: "悬赏案例展示。",
    imageSrc: promptpanda,
    href: "#",
  },
  {
    name: "案例五",
    description: "悬赏案例展示。",
    imageSrc: reviewradar,
    href: "#",
  },
  {
    name: "案例六",
    description: "悬赏案例展示。",
    imageSrc: scribeist,
    href: "#",
  },
  {
    name: "案例七",
    description: "悬赏案例展示。",
    imageSrc: searchcraft,
    href: "#",
  },
];
