FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter @neon21/server...

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN pnpm --filter @neon21/shared build
RUN pnpm --filter @neon21/server build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/packages/shared ./packages/shared
RUN sed -i 's/\r$//' /app/apps/server/docker-entrypoint.sh && chmod +x /app/apps/server/docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/app/apps/server/docker-entrypoint.sh"]
