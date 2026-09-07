FROM node:24.20.0-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @puk/root --filter @puk/api...

FROM dependencies AS build

COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/typescript-config packages/typescript-config
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma:generate \
  && pnpm --filter @puk/contracts build \
  && pnpm --filter @puk/api build \
  && pnpm --filter @puk/api --prod deploy /runtime

FROM node:24.20.0-bookworm-slim AS runtime

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /runtime ./

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
