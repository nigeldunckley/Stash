FROM node:24.19-alpine AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN apk add g++ make python3

COPY package.json yarn.lock tsconfig.json .prettierrc .eslintrc ./
COPY packages/readabilityjs ./packages/readabilityjs
COPY packages/text-to-speech ./packages/text-to-speech
COPY packages/content-handler ./packages/content-handler
COPY packages/liqe ./packages/liqe
COPY packages/utils ./packages/utils
COPY packages/api ./packages/api
COPY packages/db/migrations ./packages/db/migrations

RUN yarn install --pure-lockfile --network-timeout=300000 && \
    yarn workspace @omnivore/utils build && \
    yarn workspace @omnivore/text-to-speech-handler build && \
    yarn workspace @omnivore/content-handler build && \
    yarn workspace @omnivore/liqe build && \
    yarn workspace @omnivore/api build && \
    yarn workspace @omnivore/api test:youtube && \
    rm -rf /app/packages/api/node_modules /app/node_modules && \
    yarn install --pure-lockfile --production --network-timeout=300000


FROM node:24.19-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/omnivore-app/omnivore"

RUN apk update && apk add netcat-openbsd && rm -rf /var/cache/apk/*

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV PORT=8080

COPY --from=builder /app/packages/api/dist /app/packages/api/dist
COPY --from=builder /app/packages/readabilityjs/ /app/packages/readabilityjs/
COPY --from=builder /app/packages/api/package.json /app/packages/api/package.json
COPY --from=builder /app/packages/api/node_modules /app/packages/api/node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/packages/text-to-speech/ /app/packages/text-to-speech/
COPY --from=builder /app/packages/content-handler/ /app/packages/content-handler/
COPY --from=builder /app/packages/liqe/ /app/packages/liqe/
COPY --from=builder /app/packages/utils/ /app/packages/utils/

EXPOSE 8080

# Which commit this image was built from, shown in Settings > Developer.
# Set last so a new commit only changes this layer.
ARG STASH_COMMIT=""
ARG STASH_COMMIT_SUBJECT=""
ARG STASH_COMMIT_BODY=""
ARG STASH_COMMITTED_AT=""
ARG STASH_BUILT_AT=""
ENV STASH_COMMIT=$STASH_COMMIT \
    STASH_COMMIT_SUBJECT=$STASH_COMMIT_SUBJECT \
    STASH_COMMIT_BODY=$STASH_COMMIT_BODY \
    STASH_COMMITTED_AT=$STASH_COMMITTED_AT \
    STASH_BUILT_AT=$STASH_BUILT_AT

CMD ["yarn", "workspace", "@omnivore/api", "start"]
