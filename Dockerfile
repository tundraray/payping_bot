# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including devDependencies for build)
# --ignore-scripts: skip prepare script (lefthook) which requires git
RUN pnpm install --frozen-lockfile --ignore-scripts

# ============================================
# Stage 2: Build
# ============================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config files
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.build.json nest-cli.json webpack.config.js ./
COPY src ./src
COPY libs ./libs
COPY drizzle ./drizzle

# Build the application
RUN pnpm run build

# Prune devDependencies for production
# --ignore-scripts: skip prepare script (lefthook) which is removed during prune
RUN pnpm prune --prod --ignore-scripts

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

# Add labels for container registry
LABEL org.opencontainers.image.source="https://github.com/tundraray/payping_bot"
LABEL org.opencontainers.image.description="PayPing Telegram Bot"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

# Copy locales for i18n support
COPY --from=builder --chown=nestjs:nodejs /app/libs/telegram/src/locales ./dist/locales

# Copy Drizzle migrations
COPY --from=builder --chown=nestjs:nodejs /app/drizzle ./drizzle

# Switch to non-root user
USER nestjs

# Set environment
ENV NODE_ENV=production
ENV PORT=8000

# Expose health check port
EXPOSE 8000

# Start the application
CMD ["node", "dist/main"]
