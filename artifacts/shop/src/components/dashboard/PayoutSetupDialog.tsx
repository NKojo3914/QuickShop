import { useEffect, useState } from "react";
import { Loader2, Banknote, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Bank {
  name: string;
  code: string;
  type: string; // "nuban" | "mobile_money" | ...
  currency: string;
  active: boolean;
}

interface ExistingPayout {
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
  recipientCode: string | null;
}

export interface PayoutSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeSlug: string;
  storeCurrency: string;
  existing: ExistingPayout;
  onSaved: () => void;
}

export function PayoutSetupDialog({
  open,
  onOpenChange,
  storeSlug,
  storeCurrency,
  existing,
  onSaved,
}: PayoutSetupDialogProps) {
  const { toast } = useToast();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankCode, setBankCode] = useState(existing.bankCode || "");
  const [accountNumber, setAccountNumber] = useState(existing.accountNumber || "");
  const [accountName, setAccountName] = useState(existing.accountName || "");
  const [saving, setSaving] = useState(false);

  // Lazy-load banks the first time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (banks.length > 0) return;
    setLoadingBanks(true);
    fetch(`/api/payments/banks?currency=${encodeURIComponent(storeCurrency)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load banks");
        return res.json() as Promise<Bank[]>;
      })
      .then((list) => setBanks(list.filter((b) => b.active)))
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Couldn't load banks",
          description: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => setLoadingBanks(false));
  }, [open, storeCurrency, banks.length, toast]);

  async function handleSave() {
    if (!bankCode || !accountNumber.trim() || !accountName.trim()) {
      toast({
        variant: "destructive",
        title: "Missing details",
        description: "Pick a bank/MoMo provider and enter the account number and name.",
      });
      return;
    }
    const bank = banks.find((b) => b.code === bankCode);
    // Paystack accepts "mobile_money", "ghipss", or "nuban" — derive from the bank.type.
    const type =
      bank?.type === "mobile_money"
        ? "mobile_money"
        : bank?.type === "ghipss"
          ? "ghipss"
          : "nuban";

    setSaving(true);
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(storeSlug)}/payout-recipient`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          bankCode,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save payout details");
      toast({
        title: "Payout details saved",
        description: "You can now receive escrow payouts from QuickShop orders.",
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif flex items-center gap-2">
            <Banknote className="w-5 h-5" /> Payout Details
          </DialogTitle>
          <DialogDescription>
            Where should QuickShop send your money? Buyers pay into our escrow, then we
            transfer to you after delivery is confirmed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bankCode">Bank or MoMo provider</Label>
            <select
              id="bankCode"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={loadingBanks || saving}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{loadingBanks ? "Loading…" : "Select a provider"}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                  {b.type === "mobile_money" ? " (Mobile Money)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountNumber">Account or MoMo number</Label>
            <Input
              id="accountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="e.g. 0241234567"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accountName">Account name</Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="The name on the account"
              disabled={saving}
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
            <p>
              Your account details are saved with Paystack — QuickShop never stores your full
              bank credentials. A small platform fee is deducted from each payout.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingBanks}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save payout details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
