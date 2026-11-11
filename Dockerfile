# ==============================================================================
# Multi-Stage Production Dockerfile for VORTEX Real-Time Meeting Suite
# ==============================================================================

# --- Stage 1: Build Frontend Client ---
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci --silent

COPY client/ ./
RUN npm run build

# --- Stage 2: Build Server & Production Dependencies ---
FROM node:20-alpine AS production-runtime
WORKDIR /app

# Install security utilities and set NODE_ENV
ENV NODE_ENV=production
ENV PORT=5000

# Install server dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --only=production --silent

# Copy built frontend assets from builder stage
COPY --from=client-builder /app/client/dist /app/client/dist

# Copy server code
COPY server/ ./

# Expose standard meeting port
EXPOSE 5000

# Container Healthcheck via /healthz probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/healthz || exit 1

# Non-root user for enterprise container security
USER node

# Start cluster manager in production or standalone server
CMD ["node", "cluster.js"]
