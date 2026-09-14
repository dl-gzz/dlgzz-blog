# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Tencent Cloud CVMs can time out against Alpine's overseas CDN. Use the
# Tencent mirror so initial and automated production builds remain reliable.
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.cloud.tencent.com/g' /etc/apk/repositories && \
    apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
# Copy config files needed for fumadocs-mdx postinstall
COPY source.config.ts ./
COPY content ./content

# Use China mirror first, then fallback to npmjs if mirror is unavailable
RUN pnpm config set dangerously-allow-all-builds true && \
    (pnpm config set registry https://registry.npmmirror.com && \
    pnpm i --frozen-lockfile) || \
    (pnpm config set registry https://registry.npmjs.org && \
    pnpm i --frozen-lockfile)

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Values prefixed with NEXT_PUBLIC_ are intentionally embedded into the browser
# bundle by Next.js. Runtime secrets are never passed as build arguments.
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_AI_PROVIDER
ARG NEXT_PUBLIC_CLAUDE_API_ENDPOINT
ARG NEXT_PUBLIC_AFFILIATE_AFFONSO_ID
ARG NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID
ARG NEXT_PUBLIC_AHREFS_WEBSITE_ID
ARG NEXT_PUBLIC_DATAFAST_ANALYTICS_DOMAIN
ARG NEXT_PUBLIC_DATAFAST_ANALYTICS_ID
ARG NEXT_PUBLIC_DEMO_WEBSITE
ARG NEXT_PUBLIC_DISCORD_WIDGET_CHANNEL_ID
ARG NEXT_PUBLIC_DISCORD_WIDGET_SERVER_ID
ARG NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
ARG NEXT_PUBLIC_OPENPANEL_CLIENT_ID
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ARG NEXT_PUBLIC_PLAUSIBLE_SCRIPT
ARG NEXT_PUBLIC_SELINE_TOKEN
ARG NEXT_PUBLIC_STRIPE_PRICE_LIFETIME
ARG NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY
ARG NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY
ARG NEXT_PUBLIC_TLDRAW_LICENSE_KEY
ARG NEXT_PUBLIC_UMAMI_SCRIPT
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID

ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_AI_PROVIDER=$NEXT_PUBLIC_AI_PROVIDER \
    NEXT_PUBLIC_CLAUDE_API_ENDPOINT=$NEXT_PUBLIC_CLAUDE_API_ENDPOINT \
    NEXT_PUBLIC_AFFILIATE_AFFONSO_ID=$NEXT_PUBLIC_AFFILIATE_AFFONSO_ID \
    NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID=$NEXT_PUBLIC_AFFILIATE_PROMOTEKIT_ID \
    NEXT_PUBLIC_AHREFS_WEBSITE_ID=$NEXT_PUBLIC_AHREFS_WEBSITE_ID \
    NEXT_PUBLIC_DATAFAST_ANALYTICS_DOMAIN=$NEXT_PUBLIC_DATAFAST_ANALYTICS_DOMAIN \
    NEXT_PUBLIC_DATAFAST_ANALYTICS_ID=$NEXT_PUBLIC_DATAFAST_ANALYTICS_ID \
    NEXT_PUBLIC_DEMO_WEBSITE=$NEXT_PUBLIC_DEMO_WEBSITE \
    NEXT_PUBLIC_DISCORD_WIDGET_CHANNEL_ID=$NEXT_PUBLIC_DISCORD_WIDGET_CHANNEL_ID \
    NEXT_PUBLIC_DISCORD_WIDGET_SERVER_ID=$NEXT_PUBLIC_DISCORD_WIDGET_SERVER_ID \
    NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=$NEXT_PUBLIC_GOOGLE_ANALYTICS_ID \
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID=$NEXT_PUBLIC_OPENPANEL_CLIENT_ID \
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN \
    NEXT_PUBLIC_PLAUSIBLE_SCRIPT=$NEXT_PUBLIC_PLAUSIBLE_SCRIPT \
    NEXT_PUBLIC_SELINE_TOKEN=$NEXT_PUBLIC_SELINE_TOKEN \
    NEXT_PUBLIC_STRIPE_PRICE_LIFETIME=$NEXT_PUBLIC_STRIPE_PRICE_LIFETIME \
    NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=$NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY \
    NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY=$NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY \
    NEXT_PUBLIC_TLDRAW_LICENSE_KEY=$NEXT_PUBLIC_TLDRAW_LICENSE_KEY \
    NEXT_PUBLIC_UMAMI_SCRIPT=$NEXT_PUBLIC_UMAMI_SCRIPT \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID

# Install pnpm
RUN npm install -g pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Uncomment the following line to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN DOCKER_BUILD=true pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
