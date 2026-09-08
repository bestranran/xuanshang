import { ArrowRight, ShieldCheck, WalletCards, Workflow } from "lucide-react";
import { Link, routes } from "wasp/client/router";
import { Button } from "../client/components/ui/button";

export function LandingPage() {
  return <main className="overflow-hidden">
    <section className="relative bg-slate-950 px-6 py-28 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(245,158,11,.2),transparent_35%)]" />
      <div className="relative mx-auto max-w-6xl">
        <p className="mb-5 text-sm font-semibold tracking-[0.25em] text-amber-300">悬赏平台</p>
        <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">用托管资金，把想法变成可验收的成果。</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">发布者充值并托管预算，接单者报名、交付，验收后奖金进入收益余额。简单的流程，清楚的账。</p>
        <Link to={routes.TaskListRoute.to}><Button size="lg" className="mt-9 bg-amber-400 text-slate-950 hover:bg-amber-300">浏览悬赏 <ArrowRight className="ml-2 size-4" /></Button></Link>
      </div>
    </section>
    <section className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
      {[
        [WalletCards, "分桶余额", "充值本金只能发布悬赏；完成任务获得的收益可以提现。"],
        [ShieldCheck, "资金托管", "发布时锁定预算，退款按充值与收益的原始来源准确退回。"],
        [Workflow, "完整闭环", "报名、选人、交付、验收、24 小时冷却与奖励入账。"],
      ].map(([Icon, title, body]) => <article key={String(title)} className="rounded-2xl border p-7"><Icon className="mb-6 size-8 text-amber-500" /><h2 className="text-xl font-semibold">{title as string}</h2><p className="mt-3 leading-7 text-muted-foreground">{body as string}</p></article>)}
    </section>
  </main>;
}
