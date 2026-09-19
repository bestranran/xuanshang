import { useEffect, useState } from "react";
import { WalletCards } from "lucide-react";
import { createRechargeOrder } from "wasp/client/operations";
import { Button } from "../../client/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../client/components/ui/dialog";
import { Input } from "../../client/components/ui/input";

export type PaymentShortfall = {
  requiredCents: number;
  availableCents: number;
  shortfallCents: number;
  itemId: string;
  kind: "task" | "contest";
};

const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

export function RechargeRequiredDialog({ value, onOpenChange }: { value: PaymentShortfall | null; onOpenChange: (open: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (value) setAmount((value.shortfallCents / 100).toFixed(2)); }, [value]);
  async function recharge() {
    if (!value) return;
    setBusy(true); setError("");
    try {
      localStorage.setItem("pendingPublish", JSON.stringify({ kind: value.kind, id: value.itemId }));
      const result: any = await createRechargeOrder({ creditCents: Math.round(Number(amount) * 100) });
      window.location.href = result.checkoutUrl;
    } catch (exception: any) {
      setError(exception?.response?.data?.message ?? exception?.message ?? "创建充值订单失败");
      setBusy(false);
    }
  }
  return <Dialog open={Boolean(value)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><div className="mb-2 grid size-11 place-items-center rounded-full bg-amber-100 text-amber-700"><WalletCards /></div><DialogTitle>余额不足，请先充值</DialogTitle><DialogDescription>内容已保存为待支付状态，充值后可以继续托管并发布。</DialogDescription></DialogHeader>{value && <div className="space-y-4"><div className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-4 text-center text-sm"><div><small className="block text-muted-foreground">需要托管</small><strong>{yuan(value.requiredCents)}</strong></div><div><small className="block text-muted-foreground">可用余额</small><strong>{yuan(value.availableCents)}</strong></div><div><small className="block text-muted-foreground">还差</small><strong className="text-amber-700">{yuan(value.shortfallCents)}</strong></div></div><label className="grid gap-2 text-sm font-medium">充值到账金额<Input type="number" min={(value.shortfallCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{error && <p className="text-sm text-destructive">{error}</p>}</div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>稍后充值</Button><Button disabled={busy || !value || Math.round(Number(amount) * 100) < value.shortfallCents} onClick={() => void recharge()}>{busy ? "正在创建订单…" : "立即充值"}</Button></DialogFooter></DialogContent></Dialog>;
}
