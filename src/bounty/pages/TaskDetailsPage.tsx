import { type ReactNode, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, MessageCircleQuestion, RotateCcw, ShieldCheck, UploadCloud, UserRound } from "lucide-react";
import { Link, useParams } from "react-router";
import { answerTaskQuestion, appealTaskRejection, askTaskQuestion, cancelBountyTask, claimBountyTask, confirmDelivery, createWorkReview, getTaskDetails, releaseTaskClaim, reviewTaskSubmission, submitBountyTask, submitDelivery, useQuery } from "wasp/client/operations";
import { useAuth } from "wasp/client/auth";
import { routes } from "wasp/client/router";
import { Button } from "../../client/components/ui/button";
import { statusLabel } from "../labels";
import { formatPublicNo } from "../../shared/publicNo";
import { BusinessFileList, BusinessFileUploader } from "../../file-upload/BusinessFileAttachments";

const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);
const formatTime = (value: string | Date) => new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function TaskDetailsPage() {
  const { id = "" } = useParams();
  const { data: user } = useAuth();
  const query = useQuery(getTaskDetails, { id });
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  if (query.isLoading) return <main className="detail-shell"><div className="market-empty">正在加载悬赏…</div></main>;
  const task = query.data as any;
  if (!task) return <main className="detail-shell"><div className="market-empty">未找到悬赏</div></main>;
  const isPublisher = user?.id === task.publisherId;
  const isWorker = user?.id === task.assignedClaim?.workerId;
  const ownReview = task.reviews.find((review: any) => review.reviewerId === user?.id);
  async function run(action: () => Promise<unknown>, clear = true) {
    setBusy(true); setError("");
    try { await action(); if (clear) { setText(""); setReason(""); } await query.refetch(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "操作失败，请稍后重试"); }
    finally { setBusy(false); }
  }

  return <main className="detail-shell">
    <Link className="back-link" to={routes.TaskListRoute.to}><ArrowLeft size={16} />返回悬赏广场</Link>
    <section className="detail-banner"><div><span className="state-pill light"><i />{statusLabel(task.status)}</span><span className="category-label light">{task.category}</span><span className="category-label light">{formatPublicNo("task", task.publicNo)}</span><h1>{task.title}</h1><Link className="publisher-link" to={task.publisher.username ? routes.PublicProfileRoute.build({ params: { username: task.publisher.username } }) : routes.TaskListRoute.to}><UserRound size={16} />{task.publisher.username ?? "匿名发布者"}</Link></div><div className="reward-block"><small>托管奖励</small><strong>{money(task.budgetCents)}</strong><span><ShieldCheck size={14} />资金已托管</span></div></section>
    <TaskTimeline status={task.status} />
    {error && <div className="detail-alert danger">{error}</div>}

    <div className="detail-columns"><div className="detail-main-column">
      <Panel title="任务说明"><div className="rich-copy">{task.description}</div></Panel>
      <Panel title="需要提交的成果"><div className="proof-callout"><UploadCloud /><p>{task.proofRequirements || "按任务说明提交可核验的成果说明或链接。"}</p></div></Panel>
      {(isPublisher || isWorker) && task.privateInstructions && <Panel title="接取后说明"><div className="private-callout"><ShieldCheck /><p>{task.privateInstructions}</p></div></Panel>}
      {task.submission && <Panel title={`成果记录 · ${task.submission.versions?.length ?? 1} 版`}>{task.submission.versions?.slice(-1).map((version: any) => <div className="submission-box" key={version.id}><p>{version.content}</p><BusinessFileList files={version.files} /><small>最近提交 {formatTime(version.createdAt)}</small></div>)}{task.submission.versions?.length > 1 && <details><summary>查看此前版本</summary>{task.submission.versions.slice(0, -1).map((version: any) => <div className="version-row" key={version.id}><b>第 {version.version} 版</b><p>{version.content}</p><BusinessFileList files={version.files} /></div>)}</details>}</Panel>}
      <QuestionBoard task={task} user={user} text={text} setText={setText} busy={busy} run={run} />
      {task.reviews.length > 0 && <Panel title="已验证评价">{task.reviews.map((review: any) => <blockquote className="review-row" key={review.id}><p>“{review.content}”</p><footer>{review.reviewer.username ?? "平台用户"} · {review.reviewerRole === "PUBLISHER" ? "发布者评价" : "接取者评价"}</footer></blockquote>)}</Panel>}
    </div>

    <aside className="action-card">
      <small>当前下一步</small><ActionSummary task={task} isPublisher={isPublisher} isWorker={isWorker} />
      {isPublisher && ["DRAFT", "PENDING_PAYMENT"].includes(task.status) && <><Button disabled={busy} onClick={() => run(() => submitBountyTask({ taskId: task.id }))}>提交审核</Button><Link to={routes.WalletRoute.to}><Button className="w-full" variant="outline">前往钱包</Button></Link><Button disabled={busy} variant="destructive" onClick={() => run(() => cancelBountyTask({ taskId: task.id }))}>取消悬赏</Button></>}
      {user && !isPublisher && task.status === "OPEN" && <Button size="lg" disabled={busy} onClick={() => run(() => claimBountyTask({ taskId: task.id }))}>立即接取</Button>}
      {!user && task.status === "OPEN" && <Link to={routes.LoginRoute.to}><Button size="lg" className="w-full">登录后接取</Button></Link>}
      {isWorker && task.status === "CLAIMED" && <><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="填写成果说明、链接或交付内容" /><BusinessFileUploader key={`task-${task.id}-${task.submission?.versions?.length ?? 0}`} targetType="TASK" targetId={task.id} onChange={setFileIds} /><Button disabled={busy || text.trim().length < 10} onClick={() => run(() => submitDelivery({ taskId: task.id, content: text, fileIds }))}>提交成果</Button><Button variant="outline" disabled={busy} onClick={() => run(() => releaseTaskClaim({ taskId: task.id }))}>放回广场</Button></>}
      {isWorker && task.status === "REVISION_REQUESTED" && <><div className="detail-alert">修改要求：{task.assignedClaim.revisionReason ?? "发布者请求一次修改，请提交最终版本。"}</div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="填写修改后的成果" /><BusinessFileUploader key={`task-${task.id}-${task.submission?.versions?.length ?? 0}`} targetType="TASK" targetId={task.id} onChange={setFileIds} /><Button disabled={busy || text.trim().length < 10} onClick={() => run(() => submitDelivery({ taskId: task.id, content: text, fileIds }))}>提交最终版本</Button></>}
      {isPublisher && task.status === "SUBMITTED" && <><Button disabled={busy} onClick={() => run(() => confirmDelivery({ taskId: task.id }))}>通过并开始结算</Button><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="修改或拒绝原因（必填）" /><Button variant="outline" disabled={busy || reason.trim().length < 3 || task.assignedClaim.revisionCount >= 1} onClick={() => run(() => reviewTaskSubmission({ taskId: task.id, decision: "REVISION", reason }))}><RotateCcw size={15} />请求一次修改</Button><Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => run(() => reviewTaskSubmission({ taskId: task.id, decision: "REJECT", reason }))}>拒绝成果</Button></>}
      {isWorker && task.status === "REJECTED_PENDING_APPEAL" && <><div className="detail-alert danger">拒绝原因：{task.assignedClaim.rejectionReason}</div><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明你认为成果应被通过的理由" /><Button disabled={busy || reason.trim().length < 10} onClick={() => run(() => appealTaskRejection({ taskId: task.id, reason }))}>提交申诉</Button></>}
      {user && task.status === "COMPLETED" && (isPublisher || isWorker) && !ownReview && <><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="留下一条基于本次合作的评价" /><Button variant="outline" disabled={busy || text.trim().length < 3} onClick={() => run(() => createWorkReview({ taskId: task.id, content: text }))}>发布评价</Button></>}
      <div className="action-meta"><div><Clock3 /><span><small>接取后时限</small><b>{task.workDurationHours} 小时</b></span></div><div><ShieldCheck /><span><small>审核规则</small><b>48 小时自动通过</b></span></div></div>
    </aside></div>
  </main>;
}

function ActionSummary({ task, isPublisher, isWorker }: { task: any; isPublisher: boolean; isWorker: boolean }) {
  const copy: Record<string, string> = { OPEN: "任何符合要求的用户都可以立即接取。", CLAIMED: isWorker ? `请在 ${formatTime(task.assignedClaim.dueAt)} 前提交成果。` : "接取者正在完成任务。", SUBMITTED: isPublisher ? `请在 ${formatTime(task.assignedClaim.reviewDueAt)} 前审核。` : "成果正在等待发布者审核。", REVISION_REQUESTED: isWorker ? "这是唯一一次修改机会。" : "正在等待最终版本。", REJECTED_PENDING_APPEAL: "拒绝结果处于 24 小时申诉窗口。", APPEALED: "管理员正在处理申诉。", COOLING: "成果已通过，奖励处于 24 小时安全冷却。", COMPLETED: "奖励已入账，本次协作已完成。" };
  return <h2>{copy[task.status] ?? (isPublisher ? "查看任务当前状态。" : "该任务当前无需操作。")}</h2>;
}

function TaskTimeline({ status }: { status: string }) {
  const stages = ["OPEN", "CLAIMED", "SUBMITTED", "COOLING", "COMPLETED"];
  const normalized = status === "REVISION_REQUESTED" || status === "REJECTED_PENDING_APPEAL" || status === "APPEALED" ? "SUBMITTED" : status;
  const active = Math.max(0, stages.indexOf(normalized));
  return <ol className="task-timeline">{["开放接取", "执行中", "成果审核", "奖励冷却", "已完成"].map((label, index) => <li className={index <= active ? "done" : ""} key={label}><span>{index < active ? <CheckCircle2 /> : index + 1}</span><b>{label}</b></li>)}</ol>;
}

function QuestionBoard({ task, user, text, setText, busy, run }: any) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const isPublisher = user?.id === task.publisherId;
  return <Panel title={`公开问答 · ${task.questions.length}`}><div className="question-list">{task.questions.length === 0 && <p className="muted">还没有人提问。公开问题能帮助所有接取者理解要求。</p>}{task.questions.map((item: any) => <article key={item.id}><p><b>{item.asker.username ?? "平台用户"}</b>：{item.question}</p>{item.answer ? <div className="answer"><b>发布者回答</b><p>{item.answer}</p></div> : isPublisher ? <div className="inline-answer"><input value={answers[item.id] ?? ""} onChange={(event) => setAnswers({ ...answers, [item.id]: event.target.value })} placeholder="公开回答" /><Button size="sm" disabled={busy || (answers[item.id]?.trim().length ?? 0) < 2} onClick={() => run(() => answerTaskQuestion({ questionId: item.id, answer: answers[item.id] }))}>回答</Button></div> : <small>等待发布者回答</small>}</article>)}</div>{user && !isPublisher && ["OPEN", "CLAIMED"].includes(task.status) && <div className="ask-row"><MessageCircleQuestion /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="公开询问任务要求" /><Button disabled={busy || text.trim().length < 3} onClick={() => run(() => askTaskQuestion({ taskId: task.id, question: text }))}>提问</Button></div>}</Panel>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="detail-panel"><h2>{title}</h2><div>{children}</div></section>; }
