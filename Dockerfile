# Build stage
FROM node:20-slim AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install curl and bash for Claude CLI installer
RUN apt-get update && \
    apt-get install -y curl bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash app

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Install claude-code-acp globally
RUN npm install -g @zed-industries/claude-code-acp

# Copy built files from builder
COPY --from=builder /build/dist ./dist

# Change ownership to app user
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Set HOME so Claude Code can persist config in ~/.claude
ENV HOME=/home/app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/index.js"]
