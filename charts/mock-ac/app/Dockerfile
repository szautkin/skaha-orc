FROM node:20-alpine

# Create non-root user first
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy package files and set ownership
COPY --chown=nodejs:nodejs package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application code with proper ownership
COPY --chown=nodejs:nodejs src/ ./src/

USER nodejs

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
