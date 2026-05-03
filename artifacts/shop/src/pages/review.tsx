import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Star, ShoppingBag, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface ReviewContext {
  alreadyReviewed: boolean;
  orderId?: number;
  orderRef?: string;
  summary?: string;
  customerName?: string | null;
  storeName?: string | null;
  storeSlug?: string | null;
  existing?: { id: number; rating: number; body: string | null };
}

export default function ReviewPage() {
  const [match, params] = useRoute("/review/:orderId");
  const orderIdNum = params?.orderId ? parseInt(params.orderId, 10) : NaN;
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { toast } = useToast();

  const [ctx, setCtx] = useState<ReviewContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [body, setBody] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isNaN(orderIdNum) || !token) {
      setLoadError("Invalid review link.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderIdNum}/review-context?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load review");
        setCtx(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load review");
      }
    })();
  }, [orderIdNum, token]);

  const submit = async () => {
    if (rating < 1) {
      toast({ variant: "destructive", title: "Pick a rating", description: "Tap a star from 1 to 5." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderIdNum, token, rating, body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't submit review");
      setDone(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't submit review",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!match) return null;

  // ── Error / invalid link ─────────────────────────────────────────────────────
  if (loadError) {
    return (
      <CenteredShell>
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-serif font-bold">Review link expired</h1>
          <p className="text-muted-foreground">{loadError}</p>
          <Link href="/" className="text-sm text-primary underline underline-offset-4 inline-block">
            Back to QuickShop
          </Link>
        </div>
      </CenteredShell>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!ctx) {
    return (
      <CenteredShell>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CenteredShell>
    );
  }

  // ── Already reviewed ─────────────────────────────────────────────────────────
  if (ctx.alreadyReviewed && ctx.existing) {
    return (
      <CenteredShell>
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-serif font-bold">You already left a review</h1>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <Star
                key={n}
                className={`w-6 h-6 ${n <= ctx.existing!.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
              />
            ))}
          </div>
          {ctx.existing.body && (
            <p className="text-muted-foreground italic">"{ctx.existing.body}"</p>
          )}
          {ctx.storeSlug && (
            <Link href={`/store/${ctx.storeSlug}`} className="text-sm text-primary underline underline-offset-4 inline-block">
              Back to {ctx.storeName ?? "store"}
            </Link>
          )}
        </div>
      </CenteredShell>
    );
  }

  // ── Just submitted ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <CenteredShell>
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-serif font-bold">Thanks for the feedback!</h1>
          <p className="text-muted-foreground">
            Your review helps other shoppers and rewards great sellers.
          </p>
          {ctx.storeSlug && (
            <Link href={`/store/${ctx.storeSlug}`} className="inline-block">
              <Button size="lg" className="rounded-2xl">
                Back to {ctx.storeName ?? "store"}
              </Button>
            </Link>
          )}
        </div>
      </CenteredShell>
    );
  }

  // ── Review form ──────────────────────────────────────────────────────────────
  const ratingLabels = ["", "Terrible", "Poor", "Okay", "Great", "Amazing"];
  const activeRating = hoverRating || rating;

  return (
    <CenteredShell>
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Order {ctx.orderRef}</p>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold mb-2">
            How was your order from <span className="text-primary">{ctx.storeName}</span>?
          </h1>
          {ctx.summary && (
            <p className="text-sm text-muted-foreground line-clamp-2">{ctx.summary}</p>
          )}
        </div>

        {/* Star picker */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(n)}
                className="p-1 transition-transform hover:scale-110 active:scale-95"
                aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
              >
                <Star
                  className={`w-10 h-10 sm:w-12 sm:h-12 transition-colors ${
                    n <= activeRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="text-sm font-medium text-muted-foreground h-5">
            {activeRating > 0 ? ratingLabels[activeRating] : "Tap a star to rate"}
          </p>
        </div>

        {/* Optional body */}
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Anything to add? <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 1000))}
            placeholder="Share what was great or what could be better — helps the seller and future buyers."
            rows={4}
            className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{body.length}/1000</p>
        </div>

        <Button
          size="lg"
          className="w-full rounded-2xl h-12"
          onClick={submit}
          disabled={submitting || rating < 1}
        >
          {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
          Submit Review
        </Button>
      </div>
    </CenteredShell>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-14 flex items-center max-w-2xl">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-lg">QuickShop</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-12 max-w-md">
        <div className="bg-card border rounded-3xl shadow-sm p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
