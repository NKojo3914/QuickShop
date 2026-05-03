import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";

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

function fmtCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : amount.toFixed(0)}`;
  }
}

function pct(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

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
    <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl px-4 py-3 text-sm">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="font-bold text-foreground text-base">{fmt(revenue, currency)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {orders} order{orders !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-2xl bg-muted/40">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-xl font-bold font-serif tracking-tight leading-none">{value}</span>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Status row ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = [
  { key: "completed" as const, label: "Completed", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  { key: "confirmed" as const, label: "Confirmed",  dot: "bg-blue-500",    bar: "bg-blue-500"    },
  { key: "pending"   as const, label: "Pending",    dot: "bg-amber-400",   bar: "bg-amber-400"   },
  { key: "cancelled" as const, label: "Cancelled",  dot: "bg-rose-400",    bar: "bg-rose-400"    },
];

function StatusRow({
  label,
  count,
  total,
  dot,
  bar,
}: {
  label: string;
  count: number;
  total: number;
  dot: string;
  bar: string;
}) {
  const pctVal = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-sm text-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${bar}`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
      <span className="text-sm font-semibold tabular-nums w-6 text-right">{count}</span>
      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
        {pctVal > 0 ? `${Math.round(pctVal)}%` : "—"}
      </span>
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
        const res = await fetch(`/api/stores/${storeSlug}/analytics`, { credentials: "include" });
        const json = await res.json() as Analytics & { error?: string };
        if (!res.ok) throw new Error(json.error || "Failed to load analytics");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load analytics");
      }
    })();
  }, [open, storeSlug]);

  const currency    = data?.currency ?? "GHS";
  const weekDelta   = data ? pct(data.thisWeekRevenue, data.lastWeekRevenue) : null;
  const totalStatus = data
    ? Object.values(data.statusBreakdown).reduce((a, b) => a + b, 0)
    : 0;

  // Area chart: last 14 days
  const chartData = (data?.revenueByDay ?? []).slice(-14).map((d) => ({
    ...d,
    label: format(parseISO(d.date), "d MMM"),
  }));
  const hasRevenue = chartData.some((d) => d.revenue > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full max-h-[92dvh] overflow-y-auto rounded-3xl p-0 gap-0 [&>button]:hidden">
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-xl font-serif font-bold tracking-tight">Analytics</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Loading ── */}
        {!data && !error && (
          <div className="px-6 pb-6 space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="px-6 pb-6 text-center py-12 text-muted-foreground text-sm">
            {error}
          </div>
        )}

        {data && (
          <div className="px-6 pb-8 space-y-5">

            {/* ── Hero: total revenue ── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground">
              <p className="text-xs font-medium opacity-75 uppercase tracking-wider mb-2">Total Revenue</p>
              <p className="text-4xl font-serif font-bold tracking-tight">
                {fmt(data.totalRevenue, currency)}
              </p>
              <p className="text-sm opacity-70 mt-1">
                from {data.paidOrders} paid order{data.paidOrders !== 1 ? "s" : ""}
              </p>
              {/* week delta pill */}
              {weekDelta !== null && (
                <div
                  className={`absolute top-4 right-4 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full
                    ${weekDelta > 0
                      ? "bg-white/20 text-white"
                      : weekDelta < 0
                        ? "bg-black/20 text-white"
                        : "bg-white/10 text-white/80"}`}
                >
                  {weekDelta > 0
                    ? <TrendingUp className="w-3 h-3" />
                    : weekDelta < 0
                      ? <TrendingDown className="w-3 h-3" />
                      : <Minus className="w-3 h-3" />}
                  {weekDelta > 0 ? `+${weekDelta}%` : weekDelta < 0 ? `${weekDelta}%` : "—"} this week
                </div>
              )}
              {/* Decorative circle */}
              <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
              <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full bg-white/5" />
            </div>

            {/* ── 3 stat tiles ── */}
            <div className="grid grid-cols-3 gap-3">
              <StatTile
                label="Orders"
                value={String(data.totalOrders)}
                sub={`${data.statusBreakdown.completed} completed`}
              />
              <StatTile
                label="Avg Order"
                value={data.paidOrders > 0 ? fmtCompact(data.avgOrderValue, currency) : "—"}
                sub="per paid order"
              />
              <StatTile
                label="This Week"
                value={fmtCompact(data.thisWeekRevenue, currency)}
                sub={
                  weekDelta === null ? "no prev data" :
                  weekDelta > 0 ? <span className="text-emerald-600">+{weekDelta}% WoW</span> :
                  weekDelta < 0 ? <span className="text-rose-500">{weekDelta}% WoW</span> :
                  "flat WoW"
                }
              />
            </div>

            {/* ── Area chart ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Revenue · last 14 days
              </p>
              {!hasRevenue ? (
                <div className="h-36 flex items-center justify-center text-sm text-muted-foreground rounded-2xl bg-muted/30">
                  No paid orders yet in this period.
                </div>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                        }
                      />
                      <Tooltip
                        content={<ChartTooltip currency={currency} />}
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "4 2" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#revenueGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                      />
                      <Area dataKey="orders" name="orders" stroke="none" fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* ── Status breakdown ── */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Orders by status
              </p>
              <div className="space-y-3">
                {STATUS_CONFIG.map(({ key, label, dot, bar }) => (
                  <StatusRow
                    key={key}
                    label={label}
                    count={data.statusBreakdown[key]}
                    total={totalStatus}
                    dot={dot}
                    bar={bar}
                  />
                ))}
              </div>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
