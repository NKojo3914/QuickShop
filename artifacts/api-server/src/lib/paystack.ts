import crypto from "node:crypto";

/**
 * Paystack helper — thin wrapper around the REST API used for the QuickShop
 * escrow flow.
 *
 * Flow:
 * 1. Buyer agrees on price in Telegram → /api/payments/init creates a
 *    Paystack transaction and returns the hosted authorization URL.
 * 2. Buyer pays on Paystack's hosted page (cards / MoMo / bank).
 * 3. Paystack POSTs to /api/webhooks/paystack → we mark the order as `paid`.
 *    Funds sit in QuickShop's Paystack balance (this IS the escrow).
 * 4. Seller marks the order shipped, then either the buyer confirms receipt
 *    OR a 48-hour timer elapses → we call `initiateTransfer` to pay the seller
 *    minus a small platform fee.
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY   — sk_test_... (test) or sk_live_... (production)
 *   PUBLIC_BASE_URL       — e.g. https://quickshop.up.railway.app
 *                           used as the callback_url after a successful pay
 *   PLATFORM_FEE_PCT      — optional, default "1" (= 1%)
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY not set");
  return key;
}

async function paystackFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json()) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || data.status !== true) {
    throw new Error(`Paystack ${path} failed: ${data.message || res.status}`);
  }
  return data.data as T;
}

// ── Transactions ─────────────────────────────────────────────────────────────

export interface PaystackInitResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Create a Paystack transaction. The buyer is redirected to `authorization_url`
 * to complete payment. Funds settle into QuickShop's Paystack balance (escrow).
 *
 * @param amount Amount in MAJOR units (e.g. 1450.00). We convert to subunits.
 * @param email  Required by Paystack for the receipt; can be a placeholder.
 * @param reference Our own unique ref so we can correlate webhooks → orders.
 * @param currency e.g. "GHS"
 * @param callbackUrl Where Paystack sends the buyer after payment success.
 * @param metadata Extra fields stored on the transaction.
 */
export async function initTransaction(opts: {
  amount: number;
  email: string;
  reference: string;
  currency: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitResponse> {
  return paystackFetch<PaystackInitResponse>("/transaction/initialize", {
    method: "POST",
    body: {
      email: opts.email,
      amount: Math.round(opts.amount * 100), // subunits (pesewas for GHS)
      reference: opts.reference,
      currency: opts.currency,
      callback_url: opts.callbackUrl,
      metadata: opts.metadata,
    },
  });
}

export interface PaystackVerifyResponse {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // subunits
  currency: string;
  paid_at: string | null;
  customer: { email: string };
  metadata?: Record<string, unknown>;
}

/**
 * Verify a transaction status. Used both as a defensive check after the
 * webhook fires and as a way to reconcile if the webhook is missed.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
  return paystackFetch<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// ── Transfer recipients (sellers) ────────────────────────────────────────────

export interface PaystackRecipient {
  recipient_code: string;
  active: boolean;
  details: {
    account_number: string;
    account_name: string | null;
    bank_code: string;
    bank_name: string;
  };
}

/**
 * Create a transfer recipient for a seller. Required before we can initiate
 * any transfer to them. Type "mobile_money" for MoMo, "ghipss" for bank.
 */
export async function createRecipient(opts: {
  type: "mobile_money" | "ghipss" | "nuban";
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}): Promise<PaystackRecipient> {
  return paystackFetch<PaystackRecipient>("/transferrecipient", {
    method: "POST",
    body: {
      type: opts.type,
      name: opts.name,
      account_number: opts.accountNumber,
      bank_code: opts.bankCode,
      currency: opts.currency,
    },
  });
}

// ── Transfers (escrow release) ───────────────────────────────────────────────

export interface PaystackTransfer {
  reference: string;
  status: string; // "success" | "pending" | "failed"
  amount: number; // subunits
  recipient: number;
}

/**
 * Initiate a transfer to a seller's recipient code. The amount should be the
 * payout AFTER deducting the platform fee. Currency comes from the recipient.
 */
export async function initiateTransfer(opts: {
  amount: number; // major units
  recipientCode: string;
  reason?: string;
  reference?: string;
}): Promise<PaystackTransfer> {
  return paystackFetch<PaystackTransfer>("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: Math.round(opts.amount * 100),
      recipient: opts.recipientCode,
      reason: opts.reason,
      reference: opts.reference,
    },
  });
}

// ── Banks list (for UI dropdown when seller adds payout details) ─────────────

export interface PaystackBank {
  name: string;
  code: string;
  type: string; // "nuban" | "mobile_money" | ...
  currency: string;
  active: boolean;
}

export async function listBanks(currency = "GHS"): Promise<PaystackBank[]> {
  return paystackFetch<PaystackBank[]>(`/bank?currency=${encodeURIComponent(currency)}`);
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify a Paystack webhook signature. Paystack signs the raw request body
 * with HMAC-SHA512 using your secret key, and sends it as the
 * `x-paystack-signature` header. Reject any request that doesn't match —
 * otherwise an attacker could call our webhook and mark orders paid for free.
 */
export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const computed = crypto
    .createHmac("sha512", secretKey())
    .update(typeof rawBody === "string" ? rawBody : rawBody)
    .digest("hex");
  // timingSafeEqual throws on length mismatch
  if (computed.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

/** QuickShop's platform fee percentage (charged to buyer on top of product price). */
export const PLATFORM_FEE_PCT = 1; // 1% — Paystack takes ~1.5%, buyer pays 2.5% total

/**
 * Calculate the platform fee on a product amount.
 * Returns fee in major units, rounded to 2 d.p.
 */
export function calcPlatformFee(productAmount: number): number {
  return Math.round(productAmount * (PLATFORM_FEE_PCT / 100) * 100) / 100;
}

/**
 * Calculate the total the buyer pays:
 *   product + deliveryFee + platformFee (1% of product)
 */
export function calcTotalCharged(productAmount: number, deliveryFee: number): {
  platformFee: number;
  totalCharged: number;
} {
  const platformFee = calcPlatformFee(productAmount);
  const totalCharged = Math.round((productAmount + deliveryFee + platformFee) * 100) / 100;
  return { platformFee, totalCharged };
}

/**
 * Calculate the vendor payout (product + delivery — QuickShop keeps platformFee).
 */
export function calcVendorPayout(productAmount: number, deliveryFee: number): number {
  return Math.round((productAmount + deliveryFee) * 100) / 100;
}

/** @deprecated Use calcPlatformFee / calcTotalCharged instead */
export function platformFeePct(): number { return PLATFORM_FEE_PCT; }

/** @deprecated Use calcPlatformFee / calcTotalCharged instead */
export function calcSplit(amount: number): { fee: number; payout: number } {
  const fee = calcPlatformFee(amount);
  const payout = Math.round((amount - fee) * 100) / 100;
  return { fee, payout };
}

/**
 * Generate a cryptographically random 6-digit delivery code.
 * The buyer receives this on payment and shares it with the delivery person
 * only when they have the item in hand. The seller enters it to release escrow.
 */
export function generateDeliveryCode(): string {
  // Use crypto to avoid Math.random() bias
  const buf = crypto.randomBytes(3); // 3 bytes = 0–16777215
  const n = buf.readUIntBE(0, 3) % 1_000_000;
  return String(n).padStart(6, "0");
}

/**
 * Generate a unique payment reference for an order. Paystack requires it to be
 * unique across your account, so we prefix with the order id and add randomness.
 */
export function generatePaymentReference(orderId: number): string {
  const rand = crypto.randomBytes(4).toString("hex");
  return `qs-${orderId}-${Date.now()}-${rand}`;
}

/**
 * Parse "Total: GHS 1450" or "Total: GHS 1,450.00" out of an order summary.
 * Returns null if no total can be parsed.
 */
export function parseTotalFromSummary(summary: string, currency: string): number | null {
  // Try "Total: <currency> <amount>" first
  const re = new RegExp(`total[:\\s]+${currency}\\s*([\\d,]+(?:\\.\\d+)?)`, "i");
  const m = summary.match(re);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  // Fallback: any "<currency> <amount>" — pick the largest (likely the total)
  const re2 = new RegExp(`${currency}\\s*([\\d,]+(?:\\.\\d+)?)`, "ig");
  let best: number | null = null;
  for (const match of summary.matchAll(re2)) {
    const n = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
}
