# The games server and the static site in one image (docs/decisions/0001, decisions 8 and 11).
# Same Node version as the Control Center image. The server needs 24.2 or newer.
FROM node:24.19.0-alpine
ENV NODE_ENV=production PORT=3000 GAMES_DB=/data/games.db
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# /data is owned by the runtime user so a fresh named volume mounted there is writable.
RUN npm ci --omit=dev --omit=peer && mkdir /data && chown node:node /data
WORKDIR /app
# .dockerignore keeps docs, tests, git data and deployment files out; the server serves the rest as the site.
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
