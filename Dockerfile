# Production image for xhostd (template "docker").
# xhostd provides env variables at run time only, so nothing secret is needed to build.

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
# xhostd tells the app which port to listen on in XHOSTD_HTTP_PORT.
CMD ["sh", "-c", "PORT=${XHOSTD_HTTP_PORT:-3000} exec node server.js"]
