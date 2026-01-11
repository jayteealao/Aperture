# Build stage
FROM node:20-slim AS builder

# Install Rust and build dependencies for native addon compilation
RUN apt-get update && \
    apt-get install -y curl build-essential pkg-config libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /build

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package*.json pnpm-* ./
COPY packages/worktrunk-native/package*.json packages/worktrunk-native/
COPY packages/worktrunk-native/Cargo.* packages/worktrunk-native/
COPY packages/worktrunk-native/build.rs packages/worktrunk-native/
COPY packages/worktrunk-native/src packages/worktrunk-native/src

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build native addon using workspace filter (not -C which doesn't work with workspaces)
RUN pnpm --filter @aperture/worktrunk-native build

# Copy remaining source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN pnpm build

# Production stage
FROM node:20-slim

# Install runtime dependencies (git, curl, bash) AND build tools for native modules
RUN apt-get update && \
    apt-get install -y git curl bash build-essential python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user (use UID 1001 since 1000 is taken by 'node' user)
RUN useradd -m -u 1001 -s /bin/bash app

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files for reference
COPY package*.json pnpm-* ./

# Copy pre-built node_modules from builder
COPY --from=builder /build/node_modules ./node_modules

# Rebuild native modules for the production container's architecture
# Use npm rebuild (not pnpm) because it works directly with node_modules
# without needing workspace configuration
RUN npm rebuild better-sqlite3

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
COPY --from=builder /build/packages/worktrunk-native/*.node ./packages/worktrunk-native/
COPY --from=builder /build/packages/worktrunk-native/index.d.ts ./packages/worktrunk-native/
COPY --from=builder /build/packages/worktrunk-native/index.js ./packages/worktrunk-native/

# Copy migrations to dist directory (where runtime code expects them)
COPY src/migrations ./dist/migrations

# Create necessary directories
RUN mkdir -p /app/data /app/data/db && chown -R app:app /app

# Switch to non-root user
USER app

# Create volume mounts
VOLUME ["/app/data"]

# Expose default port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

# Start the gateway
CMD ["node", "dist/index.js"]
