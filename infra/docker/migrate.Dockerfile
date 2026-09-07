FROM node:24.20.0-bookworm-slim AS runtime

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm-migrate,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod=false --filter @puk/api...

COPY prisma prisma
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/typescript-config packages/typescript-config

RUN cd apps/api \
  && DATABASE_URL=postgresql://build:build@localhost:5432/build \
  pnpm exec prisma generate --config ../../prisma.config.ts

CMD ["/bin/sh", "-c", "cd apps/api && pnpm exec prisma migrate deploy --config ../../prisma.config.ts && pnpm exec tsx ../../prisma/seed.ts"]
