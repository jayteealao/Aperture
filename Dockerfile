# Use Node 20 slim
FROM node:20-slim

# Install basic deps for Claude Code CLI and runtime
# curl/wget for installation scripts, python3/make/g++ for potential native modules (though claude-code is mostly js?)
# git is often needed.
# The prompt says: "Install runtime deps" and "npm install -g @zed-industries/claude-code-acp"
# Also need curl/bash/powershell?
# Linux: curl -fsSL https://claude.ai/install.sh | bash
# So we need curl and bash.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install app dependencies
RUN npm ci

# Install @zed-industries/claude-code-acp globally
RUN npm install -g @zed-industries/claude-code-acp

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create a non-root user 'node' (already exists in node images)
# and set up home directory for Claude persistence
# We want /home/node/.claude to be writable
RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude

# Switch to non-root
USER node

# Expose port
EXPOSE 8080

# Define env for persistence
ENV HOME=/home/node

# Start
CMD ["npm", "start"]
