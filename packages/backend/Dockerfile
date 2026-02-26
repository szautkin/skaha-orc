FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
RUN npm ci --workspace=packages/shared --workspace=packages/backend
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN npm run build -w packages/shared && npm run build -w packages/backend

FROM node:18-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/package.json ./
COPY --from=builder /app/packages/shared/dist ./node_modules/@skaha-orc/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@skaha-orc/shared/
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
