# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /usr/src/app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS test
COPY tsconfig.json tsconfig.test.json ./
COPY vitest.config.ts ./
COPY src ./src
RUN pnpm test

FROM test AS build
RUN pnpm build

FROM deps AS prune
RUN pnpm prune --prod

FROM node:20-alpine AS runtime
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

ARG APP_VERSION
LABEL org.opencontainers.image.version=${APP_VERSION}
ENV APP_VERSION=${APP_VERSION}

COPY package.json pnpm-lock.yaml ./
COPY .version ./
COPY --from=prune /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
CMD ["node", "dist/index.js"]
