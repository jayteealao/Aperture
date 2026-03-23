# Worktrunk Native Addon Integration Plan

**Status**: Planning Phase
**Created**: 2026-01-06
**Author**: Claude (via automated research)

## Executive Summary

This document outlines the plan to integrate git worktree functionality into Aperture by building a Node native addon. After researching [Worktrunk](https://github.com/max-sixty/worktrunk) and its ecosystem, we've determined that using [git2-rs](https://docs.rs/git2) (Rust bindings to libgit2) directly provides the most suitable approach for our needs.

## Phase 0B: Upstream Research Findings

### Worktrunk Overview

**Project**: [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk)
**License**: MIT OR Apache-2.0
**Current Version**: v0.9.4
**Crates.io**: [worktrunk](https://crates.io/crates/worktrunk)
**Documentation**: [docs.rs/worktrunk](https://docs.rs/worktrunk/latest/worktrunk/)

#### What is Worktrunk?

Worktrunk is a CLI tool for Git worktree management, designed specifically for parallel AI agent workflows. It simplifies the typically cumbersome git worktree interface by:
- Addressing worktrees by branch name rather than filesystem paths
- Automatic path computation from configurable templates
- Workflow automation via hooks (onCreate, preMerge, postMerge, etc.)
- Integration with AI agents (Claude Code, etc.)

#### Core Commands

| Task | Worktrunk | Plain git |
|------|-----------|-----------|
| Switch worktrees | `wt switch feat` | `cd ../repo.feat` |
| Create + start | `wt switch -c -x claude feat` | `git worktree add -b feat ../repo.feat && cd ../repo.feat && claude` |
| Clean up | `wt remove` | `cd ../repo && git worktree remove ../repo.feat && git branch -d feat` |
| List with status | `wt list` | `git worktree list` |

#### Library API Analysis

Worktrunk **does** expose a library API via `lib.rs` with the following public modules:
- `config` - Configuration management
- `git` - Git operations and repository management
- `path` - Path utilities
- `shell` / `shell_exec` - Shell execution
- `styling` - Terminal output styling
- `sync` - Synchronization primitives
- `utils` - General utilities

**Key Re-export**: `HookType` from the `git` module

#### Worktrunk's Repository Struct API

The `git::Repository` struct provides these worktree-related methods:

**Worktree Operations:**
- `list_worktrees()` - Returns all worktrees (filters bare entries)
- `current_worktree()` - Get current worktree
- `worktree_for_branch(branch)` - Find worktree by branch name
- `worktree_at_path(path)` - Find worktree at specific path
- `remove_worktree(path, force)` - Remove worktree
- `resolve_worktree(name)` - Resolve by name (supports "@", "-", "^")
- `resolve_worktree_name(name)` - Expand special symbols
- `worktree_root()` - Top-level working tree directory
- `worktree_base()` - Base directory for worktree creation
- `is_in_worktree()` - Check if in linked worktree
- `available_branches()` - List branches without existing worktrees

**⚠️ Critical Gap**: No explicit `create_worktree()` or `add_worktree()` method found in the public API documentation.

#### Configuration & Path Templates

From [worktrunk.dev/config](https://worktrunk.dev/config/) and the CLAUDE.md file:

- Path templates are configurable via `wt.toml` configuration files
- Supports project-level and user-level configuration
- Template variables for automatic path generation
- Hook system for automating workflows (onCreate, preMerge, etc.)

### git2-rs Analysis

**Project**: [rust-lang/git2-rs](https://github.com/rust-lang/git2-rs)
**License**: MIT OR Apache-2.0
**Documentation**: [docs.rs/git2](https://docs.rs/git2)

#### Worktree Operations in git2-rs

**Repository methods:**
- `worktree_add(name: &str, path: &Path, opts: Option<&WorktreeAddOptions>)` - **Create new worktrees** ✅
- `worktrees()` - List all worktrees
- `find_worktree(name: &str)` - Find by name
- `worktree()` - Get specific worktree
- `open_from_worktree()` - Open repository from worktree

**Worktree struct methods:**
- `name()` - Get worktree name
- `path()` - Get worktree path
- `validate()` - Validate worktree exists
- `prune(opts: Option<&mut WorktreePruneOptions>)` - Remove worktree ✅
- `is_prunable()` - Check if can be removed
- `lock(reason: Option<&str>)` / `unlock()` - Locking operations
- `is_locked()` - Check lock status

**WorktreeAddOptions:**
- `new()` - Initialize default options
- `lock(enable: bool)` - Set lock state
- `reference(branch: Option<&Branch>)` - Set HEAD reference

### Decision: Use git2-rs Directly

After thorough research, we've decided to use **git2-rs directly** rather than Worktrunk as a library OR TypeScript git libraries because:

#### Why NOT Worktrunk Library:

1. **Primary Design Intent**: Worktrunk is designed as a CLI tool, not primarily as a library
   - The crate structure prioritizes CLI user experience
   - Library API appears to be internal/implementation detail
   - Documentation at 59.41% coverage (moderate)

2. **Missing Create Operation**: Worktrunk's public API doesn't expose a clear `create_worktree()` method
   - git2-rs has `Repository::worktree_add()` which we need ✅

3. **Dependency Size**: git2-rs is a focused, lean dependency
   - Worktrunk brings CLI-specific dependencies (clap, crossterm, skim, etc.)
   - We don't need TUI/CLI features in a server addon

#### Why NOT TypeScript Git Libraries:

**Option 1: simple-git (shells out to git CLI)**
```typescript
import simpleGit from 'simple-git';
await git.raw(['worktree', 'add', '-b', branch, path]);
```

**Problems:**
- ❌ Requires `git` CLI installed on the system (deployment dependency)
- ❌ Shell injection vulnerabilities if not careful with user input
- ❌ Parsing stdout/stderr strings is fragile
- ❌ No type safety for git operations
- ❌ Cross-platform path handling issues (Windows vs Unix)
- ❌ ~50-100ms overhead per operation (process spawning)

**Option 2: nodegit (Node.js bindings to libgit2)**
```typescript
import nodegit from 'nodegit';
await nodegit.Worktree.add(...);
```

**Problems:**
- ⚠️ Less actively maintained (last major update 2+ years ago)
- ⚠️ Worktree API is incomplete/buggy in practice
- ⚠️ Callback-based API (not async/await friendly)
- ⚠️ Native compilation issues similar to what we're doing, but older tooling

**Option 3: isomorphic-git (Pure JavaScript)**
```typescript
import git from 'isomorphic-git';
// No worktree support at all ❌
```

**Problems:**
- ❌ **No worktree support** (only basic git operations)
- ❌ Performance issues for large repositories
- ❌ Not feature-complete with native git

#### Why git2-rs (Rust) is Superior:

1. **Complete Worktree API**
   - ✅ `Repository::worktree_add()` - Full worktree creation with options
   - ✅ `Worktree::prune()` - Safe removal with validation
   - ✅ `Repository::worktrees()` - Complete listing
   - ✅ All operations well-tested by Cargo and other production systems
   - ✅ Type-safe at compile time

2. **No External Dependencies**
   - ✅ libgit2 is statically linked into the addon
   - ✅ **No need for `git` CLI** to be installed
   - ✅ Consistent behavior across all platforms
   - ✅ No shell escaping or injection risks
   - ✅ Simplified deployment (one .node file)

3. **Performance**
   ```typescript
   // JS calling git CLI: ~50-100ms overhead per operation
   await simpleGit().raw(['worktree', 'add', ...]);

   // Rust calling libgit2 directly: ~1-5ms
   await nativeAddon.ensureWorktree(...); // Direct C library call
   ```
   - ✅ No process spawning overhead
   - ✅ Rust performance for intensive git operations
   - ✅ Can handle many concurrent worktree operations efficiently

4. **Better Maintained & Proven**
   | Library | Last Update | Used By | Worktree Support |
   |---------|-------------|---------|------------------|
   | **git2-rs** | Active (2025) | Cargo, rustup | Full ✅ |
   | nodegit | 2022 | Declining | Partial ⚠️ |
   | simple-git | Active | Many | CLI wrapper ⚠️ |
   | isomorphic-git | Active | Many | None ❌ |

5. **Type Safety & Error Handling**
   ```rust
   // Rust catches errors at compile time
   let worktree: Result<Worktree, Error> = repo.worktree(...);

   // TypeScript with simple-git - runtime string parsing
   const output: string = await git.raw([...]); // What format? What errors?
   ```

6. **Control & Flexibility**: Using git2-rs gives us more control
   - We can implement our own path template logic (inspired by Worktrunk)
   - We can avoid CLI-specific abstractions
   - We can optimize for our specific use case (agent isolation)

#### Real-World Comparison:

**Using simple-git (TypeScript):**
```typescript
// ❌ Shell-based, fragile, external dependency
import simpleGit from 'simple-git';

const git = simpleGit();
try {
  await git.raw(['worktree', 'add', '-b', branch, path]);
  // ❌ Parse output to verify success?
  // ❌ What if path has spaces? Special characters?
  // ❌ What if git is not installed?
  // ❌ What if git version doesn't support worktrees?
} catch (err) {
  // ❌ Parse error message string to figure out what went wrong
}
```

**Using our git2-rs addon:**
```typescript
// ✅ Native, type-safe, no external dependencies
import { ensureWorktree } from '@aperture/worktrunk-native';

try {
  const result = await ensureWorktree({
    repoRoot: '/path/to/repo',
    branch: 'agent/alice',
    worktreeBaseDir: '/path/to/.worktrees',
  });
  // ✅ Structured result, type-safe
  console.log(result.worktreePath); // string, always valid
} catch (err) {
  // ✅ Structured error with error code
  console.error(err.code); // e.g., "WORKTREE_CREATE_FAILED"
}
```

#### What We Can Learn from Worktrunk:

- **Path template approach**: Automatic path generation from branch names
- **Configuration patterns**: Hierarchical config (project + user levels)
- **Hook system design**: onCreate, preRemove events for workflow automation
- **Branch-centric model**: Each worktree maps to exactly one branch
- **Safety principles**: "Fail rather than destroy data"

#### Summary Table:

| Feature | git2-rs (our choice) | simple-git | nodegit | isomorphic-git |
|---------|---------------------|------------|---------|----------------|
| Worktree support | Full ✅ | CLI wrapper ⚠️ | Partial ⚠️ | None ❌ |
| No git CLI needed | ✅ | ❌ | ✅ | ✅ |
| Performance | Excellent (~1-5ms) | Poor (~50-100ms) | Good | Poor |
| Maintenance | Active | Active | Stale | Active |
| Type safety | Excellent | Poor | Fair | Fair |
| Error handling | Structured | String parsing | Callbacks | Structured |
| Cross-platform | Excellent | Platform-dependent | Good | Good |
| Production use | Cargo, rustup | Many | Declining | Many |
| Deployment deps | None (statically linked) | git CLI required | None | None |

## Proposed Architecture

### Native Addon: `packages/worktrunk-native`

Use **napi-rs** to build a Node native addon that wraps git2-rs:

```
packages/worktrunk-native/
├── Cargo.toml              # Rust crate manifest (depends on git2, napi, napi-derive)
├── build.rs                # napi-rs build script
├── package.json            # NPM package manifest
├── src/
│   ├── lib.rs              # napi-rs addon entry point
│   ├── worktree.rs         # Core worktree operations (git2-rs wrapper)
│   ├── config.rs           # Path template configuration
│   └── error.rs            # Error handling & conversion
├── index.ts                # TypeScript types + friendly wrapper
└── tests/
    └── integration.test.ts # Jest/Vitest integration tests
```

### Exposed TypeScript API

```typescript
// packages/worktrunk-native/index.ts

export interface EnsureRepoReadyParams {
  repoRoot: string;
}

export interface EnsureRepoReadyResult {
  defaultBranch: string | null;
  isGitRepo: boolean;
}

export interface EnsureWorktreeParams {
  repoRoot: string;
  branch: string;
  worktreeBaseDir: string;
  pathTemplate?: string; // e.g., "{repoRoot}/.worktrees/{branch}"
}

export interface EnsureWorktreeResult {
  branch: string;
  worktreePath: string;
}

export interface WorktreeInfo {
  branch: string;
  path: string;
  isMain: boolean;
  isLocked: boolean;
}

export interface ListWorktreesParams {
  repoRoot: string;
}

export interface RemoveWorktreeParams {
  repoRoot: string;
  branch: string;
}

// Async functions (backed by Rust + git2-rs)
export async function ensureRepoReady(params: EnsureRepoReadyParams): Promise<EnsureRepoReadyResult>;
export async function ensureWorktree(params: EnsureWorktreeParams): Promise<EnsureWorktreeResult>;
export async function listWorktrees(params: ListWorktreesParams): Promise<WorktreeInfo[]>;
export async function removeWorktree(params: RemoveWorktreeParams): Promise<void>;
```

### Error Handling

Define consistent error codes returned to TypeScript:

```rust
pub enum WorktreeErrorCode {
    NotAGitRepo,
    WorktreeCreateFailed,
    WorktreeNotFound,
    WorktreeRemoveFailed,
    WorktreeInUse,
    InvalidPath,
    GitError,
}
```

Map these to JavaScript errors with clear messages:

```typescript
class WorktreeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}
```

## Integration with Aperture Gateway

### Database Schema Extension

Extend the SQLite schema to support workspaces:

```sql
-- Migration: 003-add-workspaces.sql

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT -- JSON
);

CREATE TABLE workspace_agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT UNIQUE NOT NULL, -- Maps to sessions.id
  branch TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, branch)
);

CREATE INDEX idx_workspace_agents_workspace ON workspace_agents(workspace_id);
CREATE INDEX idx_workspace_agents_agent ON workspace_agents(agent_id);
```

### TypeScript Integration Layer

```typescript
// src/workspaces/worktrunk.ts

import {
  ensureRepoReady,
  ensureWorktree,
  listWorktrees,
  removeWorktree,
  type EnsureWorktreeParams,
  type WorktreeInfo,
} from '@aperture/worktrunk-native';

export interface WorktreeManager {
  ensureRepoReady(repoRoot: string): Promise<{ defaultBranch: string | null }>;
  ensureWorktree(params: EnsureWorktreeParams): Promise<{ branch: string; worktreePath: string }>;
  listWorktrees(repoRoot: string): Promise<WorktreeInfo[]>;
  removeWorktree(repoRoot: string, branch: string): Promise<void>;
}

export class WorktreeManagerNative implements WorktreeManager {
  async ensureRepoReady(repoRoot: string) {
    const result = await ensureRepoReady({ repoRoot });
    if (!result.isGitRepo) {
      throw new Error(`Not a git repository: ${repoRoot}`);
    }
    return { defaultBranch: result.defaultBranch };
  }

  async ensureWorktree(params: EnsureWorktreeParams) {
    return await ensureWorktree(params);
  }

  async listWorktrees(repoRoot: string) {
    return await listWorktrees({ repoRoot });
  }

  async removeWorktree(repoRoot: string, branch: string) {
    await removeWorktree({ repoRoot, branch });
  }
}
```

### Session Manager Integration

Modify `SessionManager.createSession()` to support workspace context:

```typescript
// src/sessionManager.ts

export interface CreateSessionOptions {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
  workspaceId?: string; // NEW: Optional workspace ID
}

async createSession(options: CreateSessionOptions = {}): Promise<Session> {
  // ... existing code ...

  let worktreePath: string | undefined;

  if (options.workspaceId) {
    // Get workspace from database
    const workspace = this.database?.getWorkspace(options.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${options.workspaceId}`);
    }

    // Generate branch name for this agent
    const branch = `agent/${id.substring(0, 8)}`;

    // Create worktree
    const worktreeResult = await this.worktreeManager.ensureWorktree({
      repoRoot: workspace.repo_root,
      branch,
      worktreeBaseDir: `${workspace.repo_root}/.worktrees`,
      pathTemplate: '{worktreeBaseDir}/{branch}',
    });

    worktreePath = worktreeResult.worktreePath;

    // Save workspace agent mapping
    this.database?.saveWorkspaceAgent({
      id: randomUUID(),
      workspace_id: options.workspaceId,
      agent_id: id,
      branch,
      worktree_path: worktreePath,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  // Create session
  const session = new Session(sessionConfig, backend, this.config, this.database, resolvedApiKey);

  // Pass worktree path to session
  if (worktreePath) {
    session.setWorktreePath(worktreePath);
  }

  // ... rest of existing code ...
}
```

### Session CWD Integration

Modify `Session.initializeAcp()` to use worktree path:

```typescript
// src/session.ts

export class Session extends EventEmitter {
  private worktreePath?: string;

  setWorktreePath(path: string): void {
    this.worktreePath = path;
  }

  private async initializeAcp(): Promise<void> {
    // ... existing init code ...

    // Create a new ACP session
    const sessionParams: NewSessionParams = {
      cwd: this.worktreePath || process.cwd(), // ← Use worktree path if available
      mcpServers: [],
    };

    // ... rest of existing code ...
  }
}
```

## Build & Packaging Strategy

### Local Development

```bash
# Install dependencies (root)
pnpm install

# Build native addon
pnpm -C packages/worktrunk-native build

# Run tests
pnpm -C packages/worktrunk-native test

# Run gateway with addon
pnpm dev
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/build.yml

name: Build & Test

on: [push, pull_request]

jobs:
  build-addon:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: dtolnay/rust-toolchain@stable
      - name: Install pnpm
        run: npm install -g pnpm
      - name: Install dependencies
        run: pnpm install
      - name: Build native addon
        run: pnpm -C packages/worktrunk-native build
      - name: Run addon tests
        run: pnpm -C packages/worktrunk-native test
      - name: Run gateway tests
        run: pnpm test

  docker:
    runs-on: ubuntu-latest
    needs: build-addon
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t aperture:test .
      - name: Test Docker image
        run: |
          docker run --rm aperture:test node --version
          docker run --rm aperture:test pnpm test
```

### Docker Build

Update `Dockerfile` to compile the native addon:

```dockerfile
# Dockerfile

FROM node:20-alpine AS builder

# Install Rust
RUN apk add --no-cache curl build-base
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-lock.yaml ./
COPY packages/worktrunk-native ./packages/worktrunk-native

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build native addon
RUN pnpm -C packages/worktrunk-native build

# Build TypeScript
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/worktrunk-native/index.node ./packages/worktrunk-native/
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Install runtime deps only
RUN apk add --no-cache git

CMD ["node", "dist/index.js"]
```

## Testing Strategy

### Unit Tests (Rust)

```rust
// packages/worktrunk-native/src/worktree.rs

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use tempfile::TempDir;

  #[test]
  fn test_ensure_worktree_creates_directory() {
    let temp = TempDir::new().unwrap();
    let repo_root = temp.path().to_str().unwrap();

    // Initialize git repo
    git2::Repository::init(repo_root).unwrap();

    // Create worktree
    let result = ensure_worktree_sync(
      repo_root,
      "test-branch",
      &format!("{}/.worktrees", repo_root),
      None,
    ).unwrap();

    assert_eq!(result.branch, "test-branch");
    assert!(PathBuf::from(&result.worktree_path).exists());
  }
}
```

### Integration Tests (TypeScript)

```typescript
// packages/worktrunk-native/tests/integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  ensureRepoReady,
  ensureWorktree,
  listWorktrees,
  removeWorktree,
} from '../index';

describe('Worktrunk Native Addon', () => {
  let tempDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'worktrunk-test-'));
    repoRoot = join(tempDir, 'repo');

    // Initialize git repo
    execSync(`git init ${repoRoot}`);
    execSync(`git config user.email "test@example.com"`, { cwd: repoRoot });
    execSync(`git config user.name "Test User"`, { cwd: repoRoot });
    execSync(`echo "# Test" > README.md`, { cwd: repoRoot });
    execSync(`git add README.md`, { cwd: repoRoot });
    execSync(`git commit -m "Initial commit"`, { cwd: repoRoot });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should ensure repo is ready', async () => {
    const result = await ensureRepoReady({ repoRoot });
    expect(result.isGitRepo).toBe(true);
    expect(result.defaultBranch).toBe('main'); // or 'master'
  });

  it('should create worktree deterministically', async () => {
    const result1 = await ensureWorktree({
      repoRoot,
      branch: 'agent/alice',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    expect(result1.branch).toBe('agent/alice');
    expect(result1.worktreePath).toContain('agent/alice');

    // Call again - should be idempotent
    const result2 = await ensureWorktree({
      repoRoot,
      branch: 'agent/alice',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    expect(result2.worktreePath).toBe(result1.worktreePath);
  });

  it('should create distinct worktrees for different branches', async () => {
    const alice = await ensureWorktree({
      repoRoot,
      branch: 'agent/alice',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    const bob = await ensureWorktree({
      repoRoot,
      branch: 'agent/bob',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    expect(alice.worktreePath).not.toBe(bob.worktreePath);
  });

  it('should list worktrees', async () => {
    await ensureWorktree({
      repoRoot,
      branch: 'agent/alice',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    await ensureWorktree({
      repoRoot,
      branch: 'agent/bob',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    const worktrees = await listWorktrees({ repoRoot });

    expect(worktrees.length).toBeGreaterThanOrEqual(2);
    expect(worktrees.some((w) => w.branch === 'agent/alice')).toBe(true);
    expect(worktrees.some((w) => w.branch === 'agent/bob')).toBe(true);
  });

  it('should remove worktree', async () => {
    await ensureWorktree({
      repoRoot,
      branch: 'agent/alice',
      worktreeBaseDir: join(repoRoot, '.worktrees'),
    });

    let worktrees = await listWorktrees({ repoRoot });
    const initialCount = worktrees.length;

    await removeWorktree({ repoRoot, branch: 'agent/alice' });

    worktrees = await listWorktrees({ repoRoot });
    expect(worktrees.length).toBe(initialCount - 1);
    expect(worktrees.some((w) => w.branch === 'agent/alice')).toBe(false);
  });

  it('should fail gracefully on non-git directory', async () => {
    const nonGitDir = join(tempDir, 'not-a-repo');
    await expect(ensureRepoReady({ repoRoot: nonGitDir })).rejects.toThrow();
  });
});
```

### Gateway Integration Tests

```typescript
// tests/workspace-session.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/sessionManager';
import { ApertureDatabase } from '../src/database';
// ... setup fixtures ...

describe('Workspace Session Integration', () => {
  let sessionManager: SessionManager;
  let database: ApertureDatabase;
  let tempRepo: string;

  beforeEach(async () => {
    // Create temp git repo
    // Initialize database
    // Create workspace
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should spawn agent in worktree directory', async () => {
    const session = await sessionManager.createSession({
      agent: 'claude_code',
      auth: { mode: 'interactive', apiKeyRef: 'none' },
      workspaceId: 'test-workspace',
    });

    // Create a test agent that prints its cwd
    // Verify it's running in the worktree directory
  });
});
```

## Update & Maintenance Workflow

### Dependency Updates

1. **git2-rs updates**: Use Dependabot or Renovate

```yaml
# .github/dependabot.yml

version: 2
updates:
  - package-ecosystem: "cargo"
    directory: "/packages/worktrunk-native"
    schedule:
      interval: "weekly"
    reviewers:
      - "aperture-maintainers"
```

2. **Manual update process**:

```bash
# Update git2-rs
cd packages/worktrunk-native
cargo update -p git2
cargo test

# Test the addon
pnpm test

# Test the gateway integration
cd ../..
pnpm test
```

### Testing After Updates

```bash
# Run full test suite
pnpm test

# Run integration tests with real git repos
pnpm test:integration

# Test Docker build
docker build -t aperture:test .
```

## Acceptance Criteria

- [ ] Native addon builds successfully on Linux, macOS, and Windows
- [ ] All unit tests pass (Rust)
- [ ] All integration tests pass (TypeScript)
- [ ] Gateway can create workspace agents with isolated worktrees
- [ ] Agent processes spawn with `cwd` set to their worktree path
- [ ] Worktrees persist across gateway restarts
- [ ] Clean error messages for all failure scenarios (not a git repo, worktree creation failed, etc.)
- [ ] CI builds and tests the addon on all platforms
- [ ] Docker image builds successfully with the addon
- [ ] Documentation exists for building, testing, and updating
- [ ] No runtime CLI dependency on `wt` or external tools

## References

**Worktrunk**:
- GitHub: https://github.com/max-sixty/worktrunk
- Documentation: https://worktrunk.dev/
- Crates.io: https://crates.io/crates/worktrunk
- API Docs: https://docs.rs/worktrunk/latest/worktrunk/

**git2-rs**:
- GitHub: https://github.com/rust-lang/git2-rs
- Documentation: https://docs.rs/git2/latest/git2/
- Repository Struct: https://docs.rs/git2/latest/git2/struct.Repository.html
- Worktree Struct: https://docs.rs/git2/latest/git2/struct.Worktree.html

**napi-rs**:
- GitHub: https://github.com/napi-rs/napi-rs
- Documentation: https://napi.rs/

**Aperture**:
- Sessions: `src/session.ts:197` (where `cwd` is set)
- SessionManager: `src/sessionManager.ts:59` (session creation)
- Database: `src/database.ts` (persistence layer)

---

**Next Steps**: Proceed to Phase 1 - Build the native addon with napi-rs.
