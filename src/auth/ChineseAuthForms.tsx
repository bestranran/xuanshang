import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  verifyEmail,
} from "wasp/client/auth";
import { routes } from "wasp/client/router";
import { Button } from "../client/components/ui/button";
import { Input } from "../client/components/ui/input";

function messageOf(error: unknown) {
  if (!(error instanceof Error)) return "操作失败，请稍后重试";
  const translations: Record<string, string> = {
    "Invalid credentials": "邮箱或密码错误",
    "Email is already in use": "该邮箱已被使用",
    "Failed to send email verification email.": "验证邮件发送失败，请稍后重试",
    "Failed to send password reset email.": "重置邮件发送失败，请稍后重试",
  };
  return translations[error.message] ?? error.message;
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  return <label className="grid gap-2 text-sm font-medium">{label}<Input {...props} /></label>;
}

function FormShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-6 pt-8"><h1 className="text-center text-2xl font-bold">{title}</h1>{children}</div>;
}

export function ChineseLoginForm() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await login({ email: String(data.get("email")), password: String(data.get("password")) });
      navigate(routes.TaskListRoute.to);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  return <FormShell title="登录悬赏"><form className="grid gap-4" onSubmit={submit}>
    <Field label="邮箱" name="email" type="email" autoComplete="email" required />
    <Field label="密码" name="password" type="password" autoComplete="current-password" required />
    {error && <p className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy}>{busy ? "登录中…" : "登录"}</Button>
  </form></FormShell>;
}

export function ChineseSignupForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) { setError("两次输入的密码不一致"); setBusy(false); return; }
    try {
      const email = String(data.get("email"));
      await signup({ email, password, username: email, isAdmin: false });
      setSuccess(true); event.currentTarget.reset();
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  return <FormShell title="创建账号">{success ? <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">注册成功，请前往邮箱点击验证链接后登录。</p> : <form className="grid gap-4" onSubmit={submit}>
    <Field label="邮箱" name="email" type="email" autoComplete="email" required />
    <Field label="密码" name="password" type="password" autoComplete="new-password" minLength={8} pattern="(?=.*[0-9]).{8,}" title="密码至少 8 位，并包含一个数字" required />
    <Field label="确认密码" name="confirmPassword" type="password" autoComplete="new-password" required />
    <p className="text-xs text-muted-foreground">密码至少 8 位，并包含一个数字。</p>
    {error && <p className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy}>{busy ? "注册中…" : "注册"}</Button>
  </form>}</FormShell>;
}

export function ChineseForgotPasswordForm() {
  const [state, setState] = useState({ busy: false, error: "", success: false });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ busy: true, error: "", success: false });
    const email = String(new FormData(event.currentTarget).get("email"));
    try { await requestPasswordReset({ email }); setState({ busy: false, error: "", success: true }); }
    catch (e) { setState({ busy: false, error: messageOf(e), success: false }); }
  }
  return <FormShell title="找回密码">{state.success ? <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">重置邮件已发送，请检查邮箱。</p> : <form className="grid gap-4" onSubmit={submit}><Field label="邮箱" name="email" type="email" required />{state.error && <p className="text-sm text-destructive">{state.error}</p>}<Button disabled={state.busy}>{state.busy ? "发送中…" : "发送重置邮件"}</Button></form>}</FormShell>;
}

export function ChineseResetPasswordForm() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ busy: false, error: "", success: false });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = params.get("token");
    if (!token) { setState({ busy: false, error: "链接中缺少重置凭证", success: false }); return; }
    const data = new FormData(event.currentTarget); const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) { setState({ busy: false, error: "两次输入的密码不一致", success: false }); return; }
    setState({ busy: true, error: "", success: false });
    try { await resetPassword({ token, password }); setState({ busy: false, error: "", success: true }); }
    catch (e) { setState({ busy: false, error: messageOf(e), success: false }); }
  }
  return <FormShell title="重置密码">{state.success ? <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">密码已重置，现在可以登录。</p> : <form className="grid gap-4" onSubmit={submit}><Field label="新密码" name="password" type="password" minLength={8} required /><Field label="确认新密码" name="confirmPassword" type="password" required />{state.error && <p className="text-sm text-destructive">{state.error}</p>}<Button disabled={state.busy}>{state.busy ? "提交中…" : "重置密码"}</Button></form>}</FormShell>;
}

export function ChineseVerifyEmailForm() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState("正在验证邮箱…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMessage("链接中缺少验证凭证，请检查收到的邮件。"); return; }
    void verifyEmail({ token }).then(() => setMessage("邮箱验证成功，现在可以登录。"), (e) => setMessage(messageOf(e)));
  }, [params]);
  return <FormShell title="邮箱验证"><p className="rounded-md bg-slate-50 p-4 text-sm">{message}</p></FormShell>;
}
