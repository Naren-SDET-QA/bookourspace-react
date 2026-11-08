# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# BookOurSpace API + web bundle
# Build args are PUBLIC Vite values only. Never pass database passwords, HMAC
# secrets or Supabase service-role/secret keys as build args.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci --include=dev --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ENABLE_DEMO_DATA=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ENABLE_DEMO_DATA=$VITE_ENABLE_DEMO_DATA
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    HOME=/home/nodejs \
    NPM_CONFIG_CACHE=/home/nodejs/.npm
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home nodejs \
 && mkdir -p /app /home/nodejs/.npm \
 && chown -R nodejs:nodejs /app /home/nodejs
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/src ./src
COPY --from=build --chown=nodejs:nodejs /app/public ./public
COPY --from=build --chown=nodejs:nodejs /app/server.ts /app/tsconfig.json ./
# tsx is a devDependency and the production start command. Keep it, drop
# Playwright so Artifact Registry storage stays small.
RUN rm -rf node_modules/playwright node_modules/playwright-core \
      node_modules/@playwright node_modules/@playwright/test
USER nodejs
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Startup command used by Cloud Run. PORT is injected by Cloud Run (8080).
CMD ["node_modules/.bin/tsx", "server.ts"]
