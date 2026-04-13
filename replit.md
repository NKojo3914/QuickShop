# QuickShop — WhatsApp Mini Store Platform

## Overview

A web app where sellers create mini online stores, upload products, and share a link. Customers browse items and order via WhatsApp with a pre-filled message.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Object Storage**: Google Cloud Storage (Replit sidecar auth) for product images

## Key Features

- Sellers create stores with name, slug, description, WhatsApp number
- Product management with image uploads (presigned URL flow to GCS)
- Public storefront at `/store/:slug` for customers
- "Order on WhatsApp" button with pre-filled message
- Store dashboard at `/manage/:slug` with product CRUD

## Database Schema

- **stores**: id, name, description, slug (unique), whatsapp_number, logo_url, created_at, updated_at
- **products**: id, store_id (FK→stores), name, description, price (numeric), image_url, created_at, updated_at

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
