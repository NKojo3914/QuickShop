# QuickShop Escrow Payments (Paystack)

This document covers how the Paystack escrow integration works, how to set it
up, and the flow each party (buyer / seller / QuickShop) sees.

## How it works

1. **Buyer agrees on price** in the seller's Telegram bot.
2. After collecting the buyer's phone number, the bot creates a Paystack
   transaction and sends the buyer a **secure payment link**.
3. The buyer pays on Paystack's hosted page (cards, Mobile Money, bank, USSD).
   Funds settle into **QuickShop's** Paystack balance — this IS the escrow.
4. Paystack POSTs to `/api/webhooks/paystack`. We verify the HMAC signature,
   mark the order **paid**, bump its status to **confirmed**, and notify the
   seller on Telegram.
5. Seller ships the item and clicks **Mark Shipped** in the dashboard. The
   buyer gets a Telegram message telling them to reply *received* (or wait
   48 h) to release the funds.
6. Seller (or buyer, or auto-release cron) clicks **Release Funds**. We
   initiate a Paystack transfer to the seller's saved recipient
   (bank or MoMo) for `amount − platform_fee`. The order is marked
   **completed**.

## Setup

### 1. Run the SQL migration

```bash
psql $DATABASE_URL -f lib/db/migrations/2026-04-22-paystack-escrow.sql
```

(Or paste the file contents into Railway's web SQL console.)

### 2. Set environment variables

| Var | Required | Notes |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | yes | `sk_test_…` for testing, `sk_live_…` in production. |
| `PUBLIC_BASE_URL` | yes | e.g. `https://quickshop.up.railway.app`. Used as the Paystack callback URL. |
| `PLATFORM_FEE_PCT` | no | Default `1` (= 1%). Set to `0` to disable the platform cut. |

### 3. Configure the Paystack webhook

In Paystack Dashboard → Settings → API Keys & Webhooks, set:

- **Webhook URL**: `https://<PUBLIC_BASE_URL>/api/webhooks/paystack`
- **Events**: `charge.success`, `transfer.success`, `transfer.failed`

QuickShop verifies the `x-paystack-signature` header on every request — any
unsigned or wrongly-signed request is rejected with 401.

### 4. Each seller adds their payout details

Dashboard → Store dropdown → **Payout Details**. They pick a bank or MoMo
provider, enter the account number and account name. We register a transfer
recipient with Paystack and store the recipient code on the store row.
Without this step, the **Release Funds** button is disabled.

## What gets installed

### New routes
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/payments/banks?currency=GHS` | seller | Bank/MoMo dropdown |
| POST | `/api/stores/:slug/payout-recipient` | seller | Save bank/MoMo |
| POST | `/api/payments/init` | public (buyer) | Create transaction |
| GET | `/api/payments/verify/:reference` | public | Verify after redirect |
| POST | `/api/webhooks/paystack` | HMAC | Async payment events |
| POST | `/api/orders/:id/ship` | seller | Mark shipped |
| POST | `/api/orders/:id/release` | seller | Release escrow |

### New columns

`orders`: `amount`, `currency`, `payment_reference`, `payment_status`,
`paid_at`, `shipped_at`, `shipped_photo_url`, `received_at`, `released_at`,
`payout_reference`, `payout_status`, `dispute_raised_at`, `platform_fee`

`stores`: `paystack_bank_code`, `paystack_account_number`,
`paystack_account_name`, `paystack_recipient_code`

### New UI

- `PayoutSetupDialog` — seller's bank/MoMo setup
- Payment status badges + **Mark Shipped** / **Release Funds** buttons in
  `OrdersSidebar`
- `/pay/callback` — buyer's redirect target after Paystack checkout

### Telegram bot changes

- After collecting the buyer's phone, if `PAYSTACK_SECRET_KEY` is set AND a
  total can be parsed from the order summary, the bot offers a Paystack
  payment link instead of the legacy "seller will contact you" message.
- The seller's order notification mentions whether escrow is in use.

## Backwards compatibility

If `PAYSTACK_SECRET_KEY` is NOT set, the bot falls back to the original flow
(seller arranges payment off-platform). Existing stores keep working.

## What's NOT done yet

- 48-hour auto-release cron (the column + endpoint exist, but no scheduled
  task fires the release. Add one with e.g. Railway cron or `node-cron`).
- Buyer "received" command in Telegram to manually release funds early.
- Dispute resolution UI — the `dispute_raised_at` column is populated by
  nothing yet.
- Refund flow when the seller cancels a paid order — currently cancellation
  doesn't refund. Add a `/orders/:id/refund` endpoint that calls
  `/refund` on Paystack.
