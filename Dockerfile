FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV ATG_DATA_ROOT=/data

RUN addgroup -S nodejs && adduser -S atg -G nodejs
COPY --from=builder --chown=atg:nodejs /app ./
RUN mkdir -p /data && chown -R atg:nodejs /data

USER atg
EXPOSE 3000
CMD ["node", "server.mjs"]
