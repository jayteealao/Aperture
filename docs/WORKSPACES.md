# Workspaces & Worktree Support

Aperture now includes experimental support for git workspaces powered by a native Node.js addon built with Rust and git2-rs.

## Overview

The workspaces feature allows you to run multiple AI agents in parallel, each in their own isolated git worktree. This enables:

- **Parallel agent workflows**: Multiple agents can work on different branches simultaneously
- **Isolation**: Each agent has its own working directory
- **Git integration**: Native git worktree support via git2-rs (libgit2)

## Architecture

```
┌─────────────────────────────────────────┐
│  Aperture Gateway (TypeScript/Node.js)  │
│  ┌─────────────────────────────────┐    │
│  │  WorktreeManager Interface      │    │
│  └──────────────┬──────────────────┘    │
│                 │                        │
│  ┌──────────────▼──────────────────┐    │
│  │  @aperture/worktrunk-native     │    │
│  │  (Rust + napi-rs + git2-rs)     │    │
│  └──────────────┬──────────────────┘    │
└─────────────────┼────────────────────────┘
                  │
         ┌────────▼────────┐
         │  libgit2 (C)    │
         └─────────────────┘
```

## Native Addon

The `@aperture/worktrunk-native` package is a Node.js native addon that wraps git2-rs to provide worktree operations:

- **ensureRepoReady**: Validate a git repository
- **ensureWorktree**: Create or get a worktree for a branch (idempotent)
- **listWorktrees**: List all worktrees in a repository
- **removeWorktree**: Remove a worktree by branch name

See `packages/worktrunk-native/README.md` for detailed API documentation.

## Building the Addon

```bash
# Install dependencies
pnpm install

# Build the native addon
pnpm -C packages/worktrunk-native build

# Run tests
pnpm -C packages/worktrunk-native test
```

## Usage Example

```typescript
import { createWorktreeManager } from './src/workspaces/worktreeManager.js';

const manager = createWorktreeManager();

// Ensure repo is ready
await manager.ensureRepoReady('/path/to/repo');

// Create worktree for agent
const result = await manager.ensureWorktree({
  repoRoot: '/path/to/repo',
  branch: 'agent/alice',
  worktreeBaseDir: '/path/to/repo/.worktrees',
});

console.log('Worktree path:', result.worktreePath);
// Worktree path: /path/to/repo/.worktrees/agent/alice

// Now spawn agent with cwd = result.worktreePath
```

## Integration with Sessions

When creating a session for a workspace agent, the worktree path can be passed to the ACP session initialization:

```typescript
// In session.ts
const sessionParams: NewSessionParams = {
  cwd: this.worktreePath || process.cwd(), // Use worktree path if available
  mcpServers: [],
};
```

## Cross-Platform Support

The native addon is built for:
- **Linux**: x86_64, aarch64
- **macOS**: x86_64 (Intel), aarch64 (Apple Silicon)
- **Windows**: x86_64

## Research & Design

This implementation is based on research of:
- **Worktrunk** ([max-sixty/worktrunk](https://github.com/max-sixty/worktrunk)): CLI for git worktree management designed for AI agents
- **git2-rs** ([rust-lang/git2-rs](https://github.com/rust-lang/git2-rs)): Rust bindings to libgit2

See `docs/plans/worktrunk-addon.md` for complete research findings and design decisions.

## Why Not Use Worktrunk Directly?

After evaluating Worktrunk, we decided to use git2-rs directly because:

1. **Worktrunk is designed as a CLI tool**, not primarily as a library
2. **git2-rs provides the fundamental operations we need** (worktree_add, list, prune)
3. **More control**: We can implement our own path template logic
4. **Smaller dependency footprint**: Avoid CLI-specific dependencies
5. **Stability**: git2-rs is used by Cargo and other production systems

## Future Work

- Full workspace database schema integration
- Workspace creation/deletion API endpoints
- Automatic worktree cleanup on session end
- Web UI for workspace management
- Workspace templates and configuration

## Status

**Experimental** - The native addon is fully functional and tested, but full workspace management in the gateway is not yet implemented. The foundation is solid and ready for production use cases.

## Contributing

To add workspace functionality to existing code:

1. Import the WorktreeManager:
   ```typescript
   import { createWorktreeManager } from './workspaces/worktreeManager.js';
   ```

2. Use it to manage worktrees:
   ```typescript
   const manager = createWorktreeManager();
   const { worktreePath } = await manager.ensureWorktree({ ... });
   ```

3. Pass the worktree path to agent sessions

## License

MIT (same as Aperture)
