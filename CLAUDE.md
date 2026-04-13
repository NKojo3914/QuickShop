# QuickShop

A lightweight storefront platform for informal sellers who use WhatsApp as their primary sales channel. Sellers get a shareable product page in seconds — no account required — and customers can browse products and order via WhatsApp or a Telegram AI bot.

---

## Functional Requirements

### FR-1: Store Creation
- A seller must be able to create a store by providing: store name, URL slug, WhatsApp number, and optional description.
- The slug must be unique across all stores.
- On creation, the seller is redirected to their store dashboard at `/manage/:slug`.
- No account or login is required to create a store.

### FR-2: Store Management (Dashboard)
- The seller must be able to update store details: name, WhatsApp number, description, and logo.
- The dashboard must display a summary (e.g. product count).
- The dashboard must be accessible via a bookmarkable URL (`/manage/:slug`).

### FR-3: Product Management
- The seller must be able to add products with: name, price, optional description, and optional image.
- The seller must be able to edit and delete their products.
- Product images must be uploadable and stored (GCS in production, local filesystem fallback).
- Products must be listed on the dashboard and on the public storefront.

### FR-4: Public Storefront
- A public storefront at `/store/:slug` must display all products for that store.
- Each product card must show name, price, image (if available), and an "Order on WhatsApp" button.
- The "Order on WhatsApp" button must open `wa.me/<whatsapp_number>` with a pre-filled message referencing the product.
- The storefront must be viewable by anyone without authentication.

### FR-5: Telegram AI Bot (Optional Integration)
- A seller must be able to connect a Telegram bot by providing a bot token on the dashboard.
- Once connected, customers must be able to chat with the bot to browse products and ask questions.
- The bot must be powered by an AI model (Gemini) and have access to the store's product catalogue.
- Customers must be able to confirm an order via the Telegram bot.
- On order confirmation, the order must be saved to the database and the seller notified via Telegram.

### FR-6: Order Management
- The dashboard must display orders placed via the Telegram bot.
- Each order must show: customer info, product/summary, status, and timestamp.
- The seller must be able to update an order's status: `pending` → `confirmed` → `completed`.

### FR-7: Image / File Storage
- Product images must be served via a stable public URL.
- On Replit: use Google Cloud Storage.
- On local / non-Replit: fall back to local filesystem storage.
- Uploaded images must be accessible from the frontend.

### FR-8: API
- All store, product, order, and storage operations must be exposed via a REST API (`/api/*`).
- The API must validate request bodies using Zod schemas generated from the OpenAPI spec.
- The API must return consistent JSON error responses.

---

## Out of Scope (Current Version)
- Seller authentication / accounts
- WhatsApp-native order capture (orders via WhatsApp are not saved to the DB)
- Payment processing
- Multi-currency support
- Analytics beyond product count
