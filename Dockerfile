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

# Install ACP agents globally
# - claude-code-acp for Claude Code agent
# - codex-acp for Codex agent (if available)
# - @openai/codex for Codex CLI
RUN npm install -g @zed-industries/claude-code-acp && \
    npm install -g @zed-industries/codex-acp || echo "codex-acp not available, skipping" && \
    npm install -g @openai/codex || echo "codex not available, skipping"

# Copy built files from builder
COPY --from=builder /build/dist ./dist

# Create data directory for encrypted credentials
RUN mkdir -p /home/app/data && chown app:app /home/app/data

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
