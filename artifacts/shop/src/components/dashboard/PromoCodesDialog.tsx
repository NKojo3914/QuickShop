import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Tag,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromoCode {
  id: number;
  storeId: number;
  code: string;
  type: "percent" | "fixed";
  value: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const promoSchema = z.object({
  code: z.string().min(2, "Code must be at least 2 characters").max(20, "Max 20 characters"),
  type: z.enum(["percent", "fixed"]),
  value: z.string().min(1, "Value is required"),
  maxUses: z.string().optional(),
  expiresAt: z.string().optional(),
});
type PromoFormValues = z.infer<typeof promoSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(promo: PromoCode, currency: string) {
  const v = parseFloat(promo.value);
  return promo.type === "percent" ? `${v}% off` : `${currency} ${v.toFixed(2)} off`;
}

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return "No expiry";
  const d = new Date(expiresAt);
  const now = new Date();
  if (d < now) return "Expired";
  return `Expires ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface PromoCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: number | undefined;
  storeCurrency?: string;
}

export function PromoCodesDialog({ open, onOpenChange, storeId, storeCurrency = "GHS" }: PromoCodesDialogProps) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const form = useForm<PromoFormValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: { code: "", type: "percent", value: "", maxUses: "", expiresAt: "" },
  });

  // Load codes when dialog opens
  useEffect(() => {
    if (!open || !storeId) return;
    setLoading(true);
    fetch(`/api/stores/${storeId}/promo-codes`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: PromoCode[] | { error: string }) => {
        if (Array.isArray(data)) setCodes(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, storeId]);

  const handleCreate = async (data: PromoFormValues) => {
    if (!storeId) return;
    setCreating(true);
    try {
      const body = {
        code: data.code.trim().toUpperCase(),
        type: data.type,
        value: parseFloat(data.value),
        maxUses: data.maxUses ? parseInt(data.maxUses, 10) : null,
        expiresAt: data.expiresAt || null,
      };
      const res = await fetch(`/api/stores/${storeId}/promo-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json() as PromoCode & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to create");
      setCodes((prev) => [json, ...prev]);
      form.reset();
      setShowForm(false);
      toast({ title: `Code "${json.code}" created!` });
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't create code", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (promo: PromoCode) => {
    setTogglingId(promo.id);
    try {
      const res = await fetch(`/api/promo-codes/${promo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !promo.active }),
      });
      const json = await res.json() as PromoCode & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to update");
      setCodes((prev) => prev.map((c) => (c.id === promo.id ? json : c)));
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't update code", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (promo: PromoCode) => {
    setDeletingId(promo.id);
    try {
      const res = await fetch(`/api/promo-codes/${promo.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error || "Failed to delete");
      }
      setCodes((prev) => prev.filter((c) => c.id !== promo.id));
      toast({ title: `Code "${promo.code}" deleted` });
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't delete code", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setDeletingId(null);
    }
  };

  const copyCode = (promo: PromoCode) => {
    navigator.clipboard?.writeText(promo.code).catch(() => {});
    setCopiedId(promo.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const watchType = form.watch("type");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-serif font-bold">
            <Tag className="w-5 h-5 text-primary" />
            Promo Codes
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create discount codes for your buyers. They can use them on the Telegram bot when ordering.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4 mt-4">
          {/* ── Create button / form ── */}
          <Button
            variant={showForm ? "secondary" : "default"}
            className="w-full rounded-2xl"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {showForm ? "Cancel" : "Create New Code"}
          </Button>

          {showForm && (
            <form
              onSubmit={form.handleSubmit(handleCreate)}
              className="bg-muted/50 border rounded-2xl p-4 space-y-3"
            >
              {/* Code */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Code</label>
                <input
                  {...form.register("code")}
                  placeholder="e.g. SAVE10"
                  className="w-full px-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
                  style={{ textTransform: "uppercase" }}
                />
                {form.formState.errors.code && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.code.message}</p>
                )}
              </div>

              {/* Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Type</label>
                  <select
                    {...form.register("type")}
                    className="w-full px-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed ({storeCurrency})</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                    Value {watchType === "percent" ? "(%)" : `(${storeCurrency})`}
                  </label>
                  <input
                    {...form.register("value")}
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={watchType === "percent" ? "100" : undefined}
                    placeholder={watchType === "percent" ? "10" : "5.00"}
                    className="w-full px-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {form.formState.errors.value && (
                    <p className="text-xs text-destructive mt-1">{form.formState.errors.value.message}</p>
                  )}
                </div>
              </div>

              {/* Max uses + Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Max Uses <span className="font-normal normal-case">(optional)</span></label>
                  <input
                    {...form.register("maxUses")}
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Expires <span className="font-normal normal-case">(optional)</span></label>
                  <input
                    {...form.register("expiresAt")}
                    type="date"
                    className="w-full px-3 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full rounded-xl" disabled={creating}>
                {creating ? "Creating…" : "Create Code"}
              </Button>
            </form>
          )}

          {/* ── Code list ── */}
          {loading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
          )}

          {!loading && codes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No promo codes yet.</p>
              <p className="text-xs mt-1">Create one above to start offering discounts.</p>
            </div>
          )}

          {!loading && codes.map((promo) => {
            const expired = promo.expiresAt && new Date(promo.expiresAt) < new Date();
            const exhausted = promo.maxUses !== null && promo.usedCount >= promo.maxUses;
            const isEffectivelyDisabled = !promo.active || expired || exhausted;

            return (
              <div
                key={promo.id}
                className={`border rounded-2xl p-4 flex items-start justify-between gap-3 transition-opacity ${isEffectivelyDisabled ? "opacity-60" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => copyCode(promo)}
                      className="flex items-center gap-1.5 font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded-lg hover:bg-muted/80 transition-colors"
                      title="Copy code"
                    >
                      {promo.code}
                      {copiedId === promo.id
                        ? <Check className="w-3 h-3 text-emerald-500" />
                        : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                    <Badge
                      variant="secondary"
                      className={promo.type === "percent"
                        ? "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
                        : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"}
                    >
                      {formatValue(promo, storeCurrency)}
                    </Badge>
                    {!promo.active && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                    {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                    {exhausted && <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Used up</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {promo.maxUses !== null
                      ? `${promo.usedCount} / ${promo.maxUses} uses`
                      : `${promo.usedCount} uses`}
                    {" · "}
                    {formatExpiry(promo.expiresAt)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(promo)}
                    disabled={togglingId === promo.id}
                    title={promo.active ? "Disable" : "Enable"}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {promo.active
                      ? <PowerOff className="w-4 h-4" />
                      : <Power className="w-4 h-4 text-emerald-500" />}
                  </button>
                  <button
                    onClick={() => handleDelete(promo)}
                    disabled={deletingId === promo.id}
                    title="Delete"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
