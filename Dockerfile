# ==============================================================================
# HostelCare — Production Multi-Stage Container Image
# Architecture: Alpine Node.js 20 LTS, non-root execution, optimized caching
# ==============================================================================

FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create uploads directory and grant permissions to node user
RUN mkdir -p backend/uploads/complaints && chown -R node:node /app

# Switch to non-root user
USER node

# Expose internal container port
EXPOSE 5000

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Start server
CMD ["npm", "start"]
