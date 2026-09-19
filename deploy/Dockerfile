FROM node:24.14.1-bookworm-slim AS generator
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils git python3 build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY . .
RUN npm exec --yes @wasp.sh/wasp-cli@0.25.0 -- install \
 && npm exec --yes @wasp.sh/wasp-cli@0.25.0 -- build

FROM generator AS web-builder
ARG WASP_SERVER_URL
ENV REACT_APP_API_URL=${WASP_SERVER_URL}
WORKDIR /source
# Wasp 0.25 generates the client through its root Vite plugin. `wasp build`
# prepares the SDK; this command creates .wasp/out/web-app/build.
RUN npm exec -- vite build

FROM node:24.14.1-alpine3.23 AS server-builder
RUN apk add --no-cache openssl python3 build-base libtool autoconf automake
WORKDIR /app
COPY --from=generator /source/src ./src
COPY --from=generator /source/package.json /source/package-lock.json /source/tsconfig*.json ./
COPY --from=generator /source/.wasp/out/server .wasp/out/server
COPY --from=generator /source/.wasp/out/sdk .wasp/out/sdk
COPY --from=generator /source/.wasp/out/libs .wasp/out/libs
COPY --from=generator /source/.wasp/out/db .wasp/out/db
RUN npm install && cd .wasp/out/server && npm install && npx prisma generate --schema=../db/schema.prisma && npm run bundle

FROM node:24.14.1-alpine3.23 AS app
RUN apk add --no-cache openssl python3
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/.wasp/out/server/node_modules .wasp/out/server/node_modules
COPY --from=server-builder /app/.wasp/out/server/bundle .wasp/out/server/bundle
COPY --from=server-builder /app/.wasp/out/server/package*.json .wasp/out/server/
COPY --from=server-builder /app/.wasp/out/db .wasp/out/db
WORKDIR /app/.wasp/out/server
EXPOSE 3001
ENTRYPOINT ["npm", "run"]
CMD ["start"]

FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-builder /source/.wasp/out/web-app/build /srv
