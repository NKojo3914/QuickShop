import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { CheckCircle2, Loader2, XCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Buyer's redirect target after Paystack checkout. Paystack appends ?reference=…
 * to the callback URL we passed in. We:
 *   1. Verify the transaction server-side (also reconciles if the webhook missed)
 *   2. Show a friendly success / failed page
 *   3. Tell the buyer to head back to the Telegram chat
 */
export default function PayCallback() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const reference = params.get("reference") || params.get("trxref") || "";
  const [status, setStatus] = useState<"loading" | "success" | "failed" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) {
      setStatus("error");
      setMessage("No payment reference provided.");
      return;
    }
    fetch(`/api/payments/verify/${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed");
        if (data.status === "success") {
          setStatus("success");
        } else {
          setStatus("failed");
          setMessage(`Payment status: ${data.status}`);
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : String(err));
      });
  }, [reference]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm bg-card border rounded-3xl p-8 shadow-sm text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
            <h1 className="text-xl font-serif font-bold mb-1">Verifying payment…</h1>
            <p className="text-sm text-muted-foreground">Just a moment.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-xl font-serif font-bold mb-1">Payment received</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Your payment is held safely in escrow. The seller will ship your order — you'll get
              a Telegram message when it's on the way.
            </p>
            <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground text-left mb-4">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
              <p>
                Funds are only released to the seller after you confirm receipt or 48 hours pass
                without a dispute.
              </p>
            </div>
            <Link href="/">
              <Button className="w-full">Back to home</Button>
            </Link>
          </>
        )}
        {status === "failed" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-serif font-bold mb-1">Payment not completed</h1>
            <p className="text-sm text-muted-foreground mb-4">{message}</p>
            <p className="text-sm text-muted-foreground mb-4">
              No money was taken. Open the Telegram chat with the seller's bot to try again.
            </p>
            <Link href="/">
              <Button variant="outline" className="w-full">Back to home</Button>
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-xl font-serif font-bold mb-1">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-4">{message}</p>
            <Link href="/">
              <Button variant="outline" className="w-full">Back to home</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
