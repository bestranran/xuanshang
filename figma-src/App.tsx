import { useState } from "react";
import {
  ArrowRight,
  Award,
  Bell,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LayoutDashboard,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

type Page = "tasks" | "task" | "contests" | "contest" | "wallet" | "admin";

const tasks = [
  { title: "品牌上线宣传片脚本", desc: "产出一份 90 秒宣传片脚本，包含分镜、旁白和拍摄建议。", amount: "¥1,200", status: "招募中", meta: "8 人报名 · 2 天后截止" },
  { title: "小程序首页体验优化", desc: "梳理新用户首次进入的关键路径，并提交可落地的交互方案。", amount: "¥3,600", status: "进行中", meta: "已选定接单者 · 5 天后交付" },
  { title: "新品发布会主视觉", desc: "围绕“重新连接”主题提供主视觉与三张社交媒体延展。", amount: "¥2,800", status: "冷却中", meta: "奖励将在 18 小时后入账" },
];

const contests = [
  { title: "首届创意方案比赛", desc: "围绕平台上线推广，提交包含核心创意、执行步骤与预期效果的完整方案。", pool: "¥6,000", status: "投稿中", entries: 32 },
  { title: "城市公益海报征集", desc: "用一张海报表达人与城市的温柔连接，作品需适合线上线下传播。", pool: "¥12,000", status: "评奖中", entries: 86 },
];

const navigation: { key: Page; label: string }[] = [
  { key: "tasks", label: "悬赏大厅" },
  { key: "contests", label: "比赛大厅" },
  { key: "wallet", label: "余额中心" },
  { key: "admin", label: "管理后台" },
];

export function App() {
  const [page, setPage] = useState<Page>("tasks");
  const [mobileOpen, setMobileOpen] = useState(false);
  const go = (next: Page) => { setPage(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => go("tasks")}><span className="brand-mark">赏</span><span>悬赏</span></button>
      <nav className="desktop-nav">{navigation.map((item) => <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => go(item.key)}>{item.label}</button>)}</nav>
      <div className="account-actions"><button className="icon-button"><Bell size={19} /></button><button className="user-pill"><span>管理员</span><span className="avatar">管</span></button><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu /></button></div>
    </header>
    {mobileOpen && <div className="mobile-panel"><button className="panel-close" onClick={() => setMobileOpen(false)}><X /></button>{navigation.map((item) => <button key={item.key} onClick={() => go(item.key)}>{item.label}<ChevronRight /></button>)}</div>}
    {page === "tasks" && <TaskHall onOpen={() => go("task")} />}
    {page === "task" && <TaskDetail onBack={() => go("tasks")} />}
    {page === "contests" && <ContestHall onOpen={() => go("contest")} />}
    {page === "contest" && <ContestDetail onBack={() => go("contests")} />}
    {page === "wallet" && <Wallet />}
    {page === "admin" && <Admin />}
  </div>;
}

function TaskHall({ onOpen }: { onOpen: () => void }) {
  return <main className="page"><Hero eyebrow="悬赏协作平台" title="把明确的成果，交给合适的人" body="资金先托管，成果再验收。让每一次协作都有清楚的目标、过程和结果。" action="发布新悬赏" />
    <section className="toolbar"><div className="search"><Search size={18} /><input placeholder="搜索悬赏、技能或关键词" /></div><div className="chips"><button className="selected">全部</button><button>设计</button><button>内容</button><button>开发</button><button>运营</button></div></section>
    <SectionHeader title="正在招募" subtitle="找到适合你的任务，用成果赢得回报" />
    <div className="card-grid">{tasks.map((task, i) => <button className="project-card" key={task.title} onClick={i === 0 ? onOpen : undefined}><div className="card-top"><Status text={task.status} tone={i === 0 ? "green" : i === 1 ? "blue" : "amber"} /><span className="amount">{task.amount}</span></div><h3>{task.title}</h3><p>{task.desc}</p><footer><span>{task.meta}</span><ArrowRight size={18} /></footer></button>)}</div>
  </main>;
}

function TaskDetail({ onBack }: { onBack: () => void }) {
  return <main className="page detail-page"><button className="back-link" onClick={onBack}>← 返回悬赏大厅</button><div className="detail-layout"><section className="detail-main"><div className="detail-heading"><Status text="招募中" tone="green" /><h1>品牌上线宣传片脚本</h1><p>发布者「夏山工作室」· 2026 年 9 月 8 日发布</p></div><Panel title="任务说明"><p>为新产品制作一份 90 秒品牌宣传片脚本。需要完整呈现品牌主张、用户痛点和产品带来的改变，语言克制但有情绪张力。</p><h4>交付内容</h4><ul><li>完整旁白与画面分镜</li><li>音乐、节奏与转场建议</li><li>两轮合理修改</li></ul></Panel><Panel title="报名者 8"><div className="applicant"><span className="avatar purple">林</span><div><strong>林小满</strong><p>品牌内容策划 · 已完成 18 个任务</p></div><button>查看方案</button></div><div className="applicant"><span className="avatar blue">陈</span><div><strong>陈屿</strong><p>导演 / 编剧 · 已完成 11 个任务</p></div><button>查看方案</button></div></Panel></section><aside className="side-card"><span>悬赏金额</span><strong>¥1,200.00</strong><div className="metric"><Clock3 /><div><small>报名截止</small><b>2 天 08 小时</b></div></div><div className="metric"><ShieldCheck /><div><small>资金状态</small><b>已托管</b></div></div><button className="primary wide">立即报名</button><p className="safe-note">平台将在验收完成后结算奖励</p></aside></div></main>;
}

function ContestHall({ onOpen }: { onOpen: () => void }) {
  return <main className="page"><Hero eyebrow="创意比赛" title="同题竞技，让好作品被看见" body="固定三个奖项，奖金提前托管。截止前安心创作，截止后公开作品并统一评奖。" action="发起比赛" contest />
    <section className="toolbar"><div className="search"><Search size={18} /><input placeholder="搜索比赛主题" /></div><div className="chips"><button className="selected">进行中</button><button>即将截止</button><button>已结束</button></div></section>
    <div className="contest-grid">{contests.map((contest, i) => <button className="contest-card" key={contest.title} onClick={i === 0 ? onOpen : undefined}><div className="contest-visual"><Trophy size={38} /><Status text={contest.status} tone={i === 0 ? "green" : "amber"} /></div><div className="contest-copy"><h3>{contest.title}</h3><p>{contest.desc}</p><div className="prizes"><span><small>一等奖</small>¥3,000</span><span><small>二等奖</small>¥2,000</span><span><small>三等奖</small>¥1,000</span></div><footer><b>总奖池 {contest.pool}</b><span>{contest.entries} 份投稿</span></footer></div></button>)}</div>
  </main>;
}

function ContestDetail({ onBack }: { onBack: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  return <main className="page detail-page"><button className="back-link" onClick={onBack}>← 返回比赛大厅</button><div className="contest-title"><div><Status text="投稿中" tone="green" /><h1>首届创意方案比赛</h1><p>投稿截止：2026 年 9 月 15 日 20:00</p></div><div className="pool"><small>总奖池</small><strong>¥6,000</strong></div></div><div className="prize-podium"><div className="second"><Award />二等奖<strong>¥2,000</strong></div><div className="first"><Trophy />一等奖<strong>¥3,000</strong></div><div className="third"><Award />三等奖<strong>¥1,000</strong></div></div><div className="detail-layout"><section className="detail-main"><Panel title="比赛说明"><p>围绕平台上线推广提交一份可执行创意方案，要求包含核心创意、执行步骤和预期效果。截止前投稿仅本人、发布者和管理员可见，截止后统一公开。</p><h4>评选标准</h4><ul><li>洞察准确，创意与真实用户需求有关</li><li>方案具备明确步骤和可执行性</li><li>能形成持续传播，而非一次性曝光</li></ul></Panel><Panel title="参赛作品"><div className="locked"><ShieldCheck /><div><strong>作品暂未公开</strong><p>比赛截止后，将公开全部投稿作品。</p></div></div></Panel></section><aside className="side-card"><h3>提交参赛作品</h3><label>方案内容<textarea placeholder="写下你的核心创意、执行步骤和预期效果…" /></label><label>作品链接<input placeholder="https://" /></label><button className="primary wide" onClick={() => setSubmitted(true)}>{submitted ? "已提交，可继续修改" : "确认投稿"}</button><p className="safe-note">每位参赛者仅保留一份最新投稿</p></aside></div></main>;
}

function Wallet() {
  return <main className="page"><div className="page-title"><div><span className="eyebrow dark">资金中心</span><h1>我的钱包</h1><p>充值用于发布，任务收益可申请提现。</p></div><button className="primary">充值余额</button></div><div className="balance-grid"><Balance icon={<WalletCards />} label="充值余额" value="¥8,420.00" note="仅用于发布悬赏或比赛" /><Balance icon={<CircleDollarSign />} label="收益余额" value="¥3,680.00" note="可申请提现" /><Balance icon={<Clock3 />} label="提现冻结" value="¥800.00" note="审核通过后发放" /></div><Panel title="资金流水"><div className="transaction-head"><span>类型</span><span>关联项目</span><span>时间</span><span>金额</span></div>{[["比赛奖金入账","首届创意方案比赛 · 一等奖","今天 10:26","+ ¥3,000"],["悬赏托管","品牌上线宣传片脚本","昨天 16:40","- ¥1,200"],["余额充值","支付宝","9 月 6 日","+ ¥5,000"]].map((row) => <div className="transaction" key={row[1]}>{row.map((cell, i) => <span className={i === 3 ? (cell.startsWith("+") ? "income" : "expense") : ""} key={cell}>{cell}</span>)}</div>)}</Panel></main>;
}

function Admin() {
  return <div className="admin-shell"><aside className="admin-side"><div className="brand light"><span className="brand-mark">赏</span><span>管理台</span></div><small>运营与资金控制中心</small>{[[LayoutDashboard,"数据概览"],[Sparkles,"悬赏管理"],[Trophy,"比赛管理"],[WalletCards,"提现管理"],[Award,"奖励冷却"],[UserRound,"用户管理"]].map(([Icon, label]: any, i) => <button className={i === 0 ? "active" : ""} key={label}><Icon size={19} />{label}{label === "奖励冷却" && <b>4</b>}</button>)}</aside><main className="admin-main"><div className="admin-title"><div><span className="eyebrow dark">实时运营数据</span><h1>数据概览</h1></div><span>最后更新：刚刚</span></div><div className="stat-grid"><Stat label="平台总用户" value="1,284" change="本周 +86" /><Stat label="悬赏总数" value="326" change="28 项进行中" /><Stat label="比赛总数" value="18" change="6 项进行中" /><Stat label="托管资金" value="¥86,420" change="安全托管中" /></div><div className="admin-columns"><Panel title="运营待办"><Todo icon={<Award />} title="4 笔奖励正在冷却" desc="管理员可随时审查并拦截异常奖励" tag="查看" /><Todo icon={<WalletCards />} title="3 笔提现等待审核" desc="申请金额合计 ¥2,460" tag="处理" /><Todo icon={<ShieldCheck />} title="2 个账号风险提醒" desc="异常登录行为需要复核" tag="复核" /></Panel><Panel title="最新比赛"><div className="admin-contest"><span className="rank-icon">01</span><div><strong>首届创意方案比赛</strong><p>32 份投稿 · 奖池 ¥6,000</p></div><Status text="投稿中" tone="green" /></div><div className="admin-contest"><span className="rank-icon">02</span><div><strong>城市公益海报征集</strong><p>86 份投稿 · 奖池 ¥12,000</p></div><Status text="评奖中" tone="amber" /></div></Panel></div></main></div>;
}

function Hero({ eyebrow, title, body, action, contest = false }: { eyebrow: string; title: string; body: string; action: string; contest?: boolean }) { return <section className={`hero ${contest ? "contest-hero" : ""}`}><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p><button className="hero-action">{action}<ArrowRight size={18} /></button></div><div className="hero-art">{contest ? <Trophy /> : <Sparkles />}</div></section>; }
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) { return <div className="section-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button>查看全部 <ArrowRight size={16} /></button></div>; }
function Status({ text, tone }: { text: string; tone: "green" | "blue" | "amber" }) { return <span className={`status ${tone}`}><i />{text}</span>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="panel"><h2>{title}</h2><div className="panel-content">{children}</div></section>; }
function Balance({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) { return <div className="balance-card"><span className="balance-icon">{icon}</span><small>{label}</small><strong>{value}</strong><p>{note}</p></div>; }
function Stat({ label, value, change }: { label: string; value: string; change: string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{change}</small></div>; }
function Todo({ icon, title, desc, tag }: { icon: React.ReactNode; title: string; desc: string; tag: string }) { return <div className="todo"><span className="todo-icon">{icon}</span><div><strong>{title}</strong><p>{desc}</p></div><button>{tag}</button></div>; }
