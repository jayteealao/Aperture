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

# Create non-root user (use UID 1001 since 1000 is taken by 'node' user)
RUN useradd -m -u 1001 -s /bin/bash app

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Install ACP agents globally
# - claude-code-acp for Claude Code agent
# - codex-acp for Codex agent (if available)
# - @openai/codex for Codex CLI
# - @google/gemini-cli for Gemini CLI (with ACP mode support)
RUN npm install -g @zed-industries/claude-code-acp && \
    npm install -g @zed-industries/codex-acp || echo "codex-acp not available, skipping" && \
    npm install -g @openai/codex || echo "codex not available, skipping" && \
    npm install -g @google/gemini-cli || echo "gemini-cli not available, skipping"

# Copy built files from builder
COPY --from=builder /build/dist ./dist

# Create directories for persisted state
# - /home/app/data for encrypted credentials
# - /home/app/.gemini for Gemini CLI OAuth cache
RUN mkdir -p /home/app/data /home/app/.gemini && \
    chown -R app:app /home/app/data /home/app/.gemini

# Change ownership to app user
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Set HOME so agents can persist config in ~/.claude, ~/.codex, ~/.gemini
ENV HOME=/home/app

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "dist/index.js"]
