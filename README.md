# QuickShop

QuickShop is a lightweight storefront platform for informal sellers who sell primarily through WhatsApp. It lets sellers create a public product catalog, manage products and orders, and connect a Telegram bot to help customers browse and order.

## Features

- Create and manage a store with a custom slug
- Add, edit, and remove products
- Public storefront pages for each store
- “Order on WhatsApp” links that open a pre-filled message
- Order tracking and dashboard management
- Optional Telegram AI bot integration for customer support and order handling
- Product image uploads with Google Cloud Storage in production and local fallback in development

## Tech stack

- TypeScript
- Express API
- PostgreSQL + Drizzle ORM
- React/TypeScript frontend app (workspace package structure)
- Google Cloud Storage for media uploads
- Telegram and Gemini integrations

## Repository layout

- `artifacts/api-server` — backend API and server startup
- `artifacts/shop` — storefront frontend/application UI
- `packages` / workspace packages — shared logic and schemas
- `scripts` — helper scripts
- `drizzle` or database config — database migrations and schema setup

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create an environment file based on the app requirements for local development.

3. Start the app:

   ```bash
   pnpm run build
   pnpm run start:prod
   ```

   Or run the server package in dev mode when needed:

   ```bash
   pnpm --filter @workspace/api-server run dev
   ```

## Required environment variables

The server requires a `PORT` value before it will start. Other environment variables may also be needed depending on the backend integrations enabled in your environment, such as:

- `PORT`
- database connection variables
- Google Cloud credentials / bucket config
- Telegram bot token(s)
- Gemini / AI provider keys

## Scripts

From the root:

```bash
pnpm run build
pnpm run build:prod
pnpm run start:prod
pnpm run typecheck
```

## Notes

This project is designed for deployment on a host that can provide a web process and environment variables. It also includes Replit-oriented behavior for service configuration and image storage.

## License

This project is currently unlicensed unless otherwise specified by the repository owner.
