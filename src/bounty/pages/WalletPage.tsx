import { useState } from "react";
import { cancelWithdrawal, confirmWithdrawal, createRechargeOrder, createWithdrawal, getWallet, redeemGiftCard, useQuery } from "wasp/client/operations";
import { Button } from "../../client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../client/components/ui/card";
import { Input } from "../../client/components/ui/input";
import { entryTypeLabel, statusLabel } from "../labels";
import { formatPublicNo } from "../../shared/publicNo";

const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
export function WalletPage() {
  const walletQuery = useQuery(getWallet);
  const { data, isLoading } = walletQuery;
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [giftCardSecret, setGiftCardSecret] = useState("");
  const [giftCardMessage, setGiftCardMessage] = useState("");
  if (isLoading || !data) return <main className="p-10">正在加载…</main>;
  const { wallet, entries, orders, withdrawals } = data as any;
  async function run(action: () => Promise<unknown>, reload = true) { setBusy(true); setError(""); try { await action(); if (reload) location.reload(); } catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "操作失败，请稍后重试"); setBusy(false); } }
  async function recharge() { await run(async () => { const result: any = await createRechargeOrder({ creditCents: Math.round(Number(amount) * 100) }); location.href = result.checkoutUrl; }, false); }
  async function withdraw() { await run(() => createWithdrawal({ amountCents: Math.round(Number(amount) * 100) })); }
  async function redeem() {
    setBusy(true); setError(""); setGiftCardMessage("");
    try {
      const result: any = await redeemGiftCard({ secret: giftCardSecret });
      setGiftCardSecret("");
      setGiftCardMessage(`兑换成功，¥${(result.amountCents / 100).toFixed(2)} 已进入充值余额。`);
      await walletQuery.refetch();
    } catch (e: any) { setError(e?.response?.data?.message ?? e?.message ?? "兑换失败，请检查卡密"); setBusy(false); }
  }
  return <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
    <h1 className="text-4xl font-bold">余额中心</h1>
    <section className="grid gap-4 md:grid-cols-3">{[["充值余额", wallet.rechargeAvailableCents], ["收益余额", wallet.earningsAvailableCents], ["提现冻结", wallet.withdrawalFrozenCents]].map(([label, value]) => <Card key={String(label)}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{yuan(Number(value))}</CardContent></Card>)}</section>
    <Card><CardHeader><CardTitle>充值或提现</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-3"><Input className="max-w-xs" type="number" min="0.01" step="0.01" placeholder="金额（元）" value={amount} onChange={(e) => setAmount(e.target.value)} /><Button disabled={busy || !(Number(amount) > 0)} onClick={recharge}>易支付充值</Button><Button disabled={busy || !(Number(amount) > 0)} variant="outline" onClick={withdraw}>从收益余额提现</Button></div>{error && <p className="text-sm text-destructive">{error}</p>}<p className="text-xs text-muted-foreground">充值余额只能用于发布悬赏；收益余额可以发布悬赏或申请提现。</p></CardContent></Card>
    <Card><CardHeader><CardTitle>兑换礼品卡</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-3"><Input className="max-w-lg font-mono uppercase" autoComplete="off" placeholder="GC-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={giftCardSecret} onChange={(event) => setGiftCardSecret(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && giftCardSecret.trim()) void redeem(); }} /><Button disabled={busy || !giftCardSecret.trim()} onClick={() => void redeem()}>立即兑换</Button></div>{giftCardMessage && <p className="text-sm text-emerald-600">{giftCardMessage}</p>}<p className="text-xs text-muted-foreground">每张礼品卡只能兑换一次，金额进入充值余额，可用于发布悬赏和比赛，不可提现。</p></CardContent></Card>
    <Card><CardHeader><CardTitle>资金流水</CardTitle></CardHeader><CardContent className="space-y-2">{entries.map((entry: any) => <div key={entry.id} className="grid gap-2 border-b py-2 text-sm md:grid-cols-4"><span>{entryTypeLabel(entry.type)}{entry.note && <small className="block text-muted-foreground">{entry.note}</small>}</span><span>充值 {entry.rechargeDeltaCents >= 0 ? "+" : ""}{yuan(entry.rechargeDeltaCents)}</span><span>收益 {entry.earningsDeltaCents >= 0 ? "+" : ""}{yuan(entry.earningsDeltaCents)}</span><time className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString("zh-CN")}</time></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>充值订单</CardTitle></CardHeader><CardContent className="space-y-3">{orders.map((order: any) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><strong>{formatPublicNo("recharge", order.publicNo)}</strong><p className="text-muted-foreground">到账 {yuan(order.creditCents)} · 实付 {yuan(order.payableCents)}</p></div><span>{statusLabel(order.status)}</span></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>提现申请</CardTitle></CardHeader><CardContent className="space-y-3">{withdrawals.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><strong>{formatPublicNo("withdrawal", item.publicNo)} · {yuan(item.amountCents)}</strong><p className="text-muted-foreground">实际红包 {yuan(item.payoutCents)} · {statusLabel(item.status)}</p>{item.payoutToken && <p className="mt-2 rounded bg-amber-50 p-2 font-mono text-amber-900">红包口令：{item.payoutToken}</p>}</div><div className="flex gap-2">{item.status === "REQUESTED" && <Button disabled={busy} size="sm" variant="outline" onClick={() => void run(() => cancelWithdrawal({ id: item.id }))}>取消申请</Button>}{item.status === "TOKEN_ISSUED" && <Button disabled={busy} size="sm" onClick={() => void run(() => confirmWithdrawal({ id: item.id }))}>确认已兑换</Button>}</div></div>)}</CardContent></Card>
  </main>;
}
