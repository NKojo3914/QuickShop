import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Banknote,
  ReceiptText,
  CalendarDays,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface Analytics {
  currency: string;
  totalOrders: number;
  paidOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  thisWeekRevenue: number;
  lastWeekRevenue: number;
  statusBreakdown: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  };
  revenueByDay: DayPoint[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function pct(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
  color?: string;
}

function StatCard({ icon, label, value, sub, color = "bg-primary/10 text-primary" }: StatCardProps) {
  return (
    <div className="bg-card border rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`p-2 rounded-xl ${color}`}>{icon}</span>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold font-serif tracking-tight">{value}</p>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface StatusBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

function StatusBar({ label, count, total, color }: StatusBarProps) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-20 text-muted-foreground capitalize shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
      <span className="text-sm font-medium w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

// Custom recharts tooltip
function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p) => p.name === "revenue")?.value ?? 0;
  const orders = payload.find((p) => p.name === "orders")?.value ?? 0;
  return (
    <div className="bg-popover border rounded-xl shadow-lg px-3 py-2 text-sm space-y-0.5">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary font-semibold">{fmt(revenue, currency)}</p>
      <p className="text-muted-foreground">
        {orders} order{orders !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeSlug: string | undefined;
}

export function AnalyticsDialog({ open, onOpenChange, storeSlug }: AnalyticsDialogProps) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !storeSlug) return;
    setData(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/stores/${storeSlug}/analytics`, {
          credentials: "include",
        });
        const json = await res.json() as Analytics & { error?: string };
        if (!res.ok) throw new Error(json.error || "Failed to load analytics");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load analytics");
      }
    })();
  }, [open, storeSlug]);

  // Chart data — show last 14 days for clarity, label every 3rd day
  const chartData = (data?.revenueByDay ?? []).slice(-14).map((d) => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
  }));

  const weekDelta = data ? pct(data.thisWeekRevenue, data.lastWeekRevenue) : null;
  const totalStatus =
    data
      ? data.statusBreakdown.pending +
        data.statusBreakdown.confirmed +
        data.statusBreakdown.completed +
        data.statusBreakdown.cancelled
      : 0;

  const currency = data?.currency ?? "GHS";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-serif font-bold">Analytics</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `Last 30 days · ${currency}` : "Loading…"}
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6 mt-4">
          {/* ── Error ── */}
          {error && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* ── Loading skeletons ── */}
          {!data && !error && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          )}

          {data && (
            <>
              {/* ── Stat cards ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<Banknote className="w-4 h-4" />}
                  label="Revenue"
                  value={fmt(data.totalRevenue, currency)}
                  sub={`from ${data.paidOrders} paid order${data.paidOrders !== 1 ? "s" : ""}`}
                  color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                />
                <StatCard
                  icon={<ShoppingCart className="w-4 h-4" />}
                  label="Orders"
                  value={String(data.totalOrders)}
                  sub={`${data.statusBreakdown.completed} completed`}
                  color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                />
                <StatCard
                  icon={<ReceiptText className="w-4 h-4" />}
                  label="Avg Order"
                  value={data.paidOrders > 0 ? fmt(data.avgOrderValue, currency) : "—"}
                  sub="per paid order"
                  color="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400"
                />
                <StatCard
                  icon={<CalendarDays className="w-4 h-4" />}
                  label="This Week"
                  value={fmt(data.thisWeekRevenue, currency)}
                  sub={
                    weekDelta === null ? (
                      <span className="flex items-center gap-1">
                        <Minus className="w-3 h-3" /> no data last week
                      </span>
                    ) : weekDelta > 0 ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <TrendingUp className="w-3 h-3" />
                        +{weekDelta}% vs last week
                      </span>
                    ) : weekDelta < 0 ? (
                      <span className="flex items-center gap-1 text-rose-500">
                        <TrendingDown className="w-3 h-3" />
                        {weekDelta}% vs last week
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Minus className="w-3 h-3" /> same as last week
                      </span>
                    )
                  }
                  color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                />
              </div>

              {/* ── Revenue chart ── */}
              <div className="bg-card border rounded-2xl p-4">
                <h3 className="text-sm font-semibold mb-4">Revenue · last 14 days</h3>
                {chartData.every((d) => d.revenue === 0) ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    No paid orders in the last 14 days yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                        }
                      />
                      <Tooltip
                        content={<ChartTooltip currency={currency} />}
                        cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
                      />
                      <Bar
                        dataKey="revenue"
                        name="revenue"
                        radius={[6, 6, 0, 0]}
                        fill="hsl(var(--primary))"
                        maxBarSize={40}
                      />
                      {/* hidden bar so tooltip also shows orders */}
                      <Bar dataKey="orders" name="orders" hide />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Order status breakdown ── */}
              <div className="bg-card border rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-semibold mb-1">Orders by status</h3>
                <StatusBar
                  label="Completed"
                  count={data.statusBreakdown.completed}
                  total={totalStatus}
                  color="bg-emerald-500"
                />
                <StatusBar
                  label="Confirmed"
                  count={data.statusBreakdown.confirmed}
                  total={totalStatus}
                  color="bg-blue-500"
                />
                <StatusBar
                  label="Pending"
                  count={data.statusBreakdown.pending}
                  total={totalStatus}
                  color="bg-amber-400"
                />
                <StatusBar
                  label="Cancelled"
                  count={data.statusBreakdown.cancelled}
                  total={totalStatus}
                  color="bg-rose-400"
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
