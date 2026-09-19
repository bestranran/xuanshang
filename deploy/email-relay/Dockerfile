FROM node:24.14.1-alpine3.23
WORKDIR /relay
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
USER node
EXPOSE 2525
CMD ["node", "server.mjs"]
