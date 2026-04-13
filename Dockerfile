FROM node:20-slim AS base

# Install pnpm via npm (works reliably on official Node image)
RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Copy workspace config files first (for better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all workspace packages
COPY artifacts/ ./artifacts/
COPY lib/ ./lib/
COPY scripts/ ./scripts/

# Install dependencies (skip frozen lockfile due to Replit-specific overrides)
RUN pnpm install --no-frozen-lockfile

# Build frontend and backend
RUN PORT=3001 BASE_PATH=/ pnpm run build:prod

# ---- Runtime image ----
FROM node:20-slim AS runtime

RUN npm install -g pnpm@10.33.0

WORKDIR /app

# Copy installed node_modules and built output
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/artifacts ./artifacts
COPY --from=base /app/lib ./lib
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

ENV NODE_ENV=production

EXPOSE 3001

CMD ["pnpm", "run", "start:prod"]
