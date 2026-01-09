# Workspace Repo Discovery and Clone Implementation Plan

> **Revision Note:** Updated based on reviewer feedback. Simplified to remove unnecessary database tables, async polling, and configuration complexity while retaining native addon clone for performance.

## A. Current Codebase Map

### Core Source Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/index.ts` | Application entrypoint, server bootstrap | Main startup logic |
| `src/config.ts` | Environment configuration parsing | `loadConfig()`, `Config` interface |
| `src/routes.ts` | Main route registration (sessions, RPC, WebSocket) | `registerRoutes()` |
| `src/routes/workspaces.ts` | Workspace CRUD API routes | `registerWorkspaceRoutes()` |
| `src/database.ts` | SQLite persistence layer | `Database` class |
| `src/workspaces/worktreeManager.ts` | TypeScript wrapper for native git ops | `WorktreeManager` class |

### Native Addon (packages/worktrunk-native)

| File | Purpose |
|------|---------|
| `packages/worktrunk-native/src/lib.rs` | Rust napi-rs entry point |
| `packages/worktrunk-native/src/worktree.rs` | Git worktree operations via git2-rs |
| `packages/worktrunk-native/index.js` | Node.js binding loader |
| `packages/worktrunk-native/index.d.ts` | TypeScript type definitions |

### Frontend (web/src)

| File | Purpose |
|------|---------|
| `web/src/pages/Workspaces.tsx` | Workspace list/management UI |
| `web/src/components/WorkspaceCard.tsx` | Individual workspace display |
| `web/src/components/CreateWorkspaceModal.tsx` | Workspace creation form |
| `web/src/lib/api.ts` | API client functions |

### Existing Database Schema

```sql
-- workspaces table (unchanged - no new columns needed)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## B. Design Goals and Non-Goals

### Goals

1. **Local Repository Discovery**
   - Scan a user-specified directory for git repositories
   - Fixed search depth of 3 levels (no configuration needed)
   - Detect regular repos (skip bare repos for simplicity)
   - Return results synchronously - discovery is fast

2. **Remote Repository Cloning**
   - Accept remote URLs (HTTPS, SSH, git://)
   - Clone via native addon for progress callbacks
   - Clone to user-specified directory
   - Return workspace when done (synchronous with WebSocket progress)

3. **Workspace Creation**
   - Create workspace from discovered or cloned repo
   - Check for duplicate `repo_path` in existing workspaces
   - Validate repository before workspace creation

4. **User Experience**
   - Progress feedback via existing WebSocket infrastructure
   - Clear error messages for invalid paths/URLs
   - Cancellation support via AbortController

### Non-Goals

1. **Persistent Discovery State** - Discovery results are ephemeral, not stored in database
2. **Job Queue for Clone** - Clone is synchronous (with streaming progress), no polling
3. **Authentication Management** - Use system credential helpers
4. **Bare Repository Support** - Skip for initial implementation
5. **Shallow Clone Configuration** - Keep it simple, always full clone

---

## C. Data Model

### No New Tables Required

Discovery results live in memory during the modal session. Clone operations complete synchronously. The existing `workspaces` table with `repo_path` is sufficient for deduplication.

### TypeScript Interfaces

```typescript
// src/types/discovery.ts

export interface DiscoveredRepo {
  path: string;
  name: string;
  remoteUrl?: string;
  hasOrigin: boolean;
}

export interface DiscoveryResult {
  repos: DiscoveredRepo[];
  scannedDirectories: number;
  errors: Array<{ path: string; error: string }>;
}

export interface CloneProgress {
  phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'done';
  current: number;
  total: number;
  percent: number;
}
```

---

## D. Repo Discovery Algorithm

### Implementation Location

New file: `src/discovery/repoDiscovery.ts`

### Simplified Algorithm

```typescript
import { readdir, stat } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { ensureRepoReady } from '../workspaces/worktreeManager';

const EXCLUDED_DIRS = ['node_modules', 'vendor', '.cache', 'target', 'dist', '.git'];
const MAX_DEPTH = 3;
const MAX_REPOS = 500;  // Memory safety limit

export async function discoverRepositories(
  rootPath: string,
  abortSignal?: AbortSignal
): Promise<DiscoveryResult> {
  const repos: DiscoveredRepo[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  let scannedCount = 0;

  // Normalize and validate path (Windows-safe)
  const normalizedRoot = resolve(rootPath);

  const queue: Array<{ path: string; depth: number }> = [
    { path: normalizedRoot, depth: 0 }
  ];

  while (queue.length > 0 && repos.length < MAX_REPOS) {
    if (abortSignal?.aborted) break;

    const { path: currentPath, depth } = queue.shift()!;
    scannedCount++;

    if (depth > MAX_DEPTH) continue;

    try {
      // Check if this is a git repo using existing native function
      const repoInfo = await ensureRepoReady({ repoRoot: currentPath })
        .catch(() => null);

      if (repoInfo?.isGitRepo) {
        repos.push({
          path: currentPath,
          name: basename(currentPath),
          remoteUrl: repoInfo.remoteUrl,
          hasOrigin: !!repoInfo.remoteUrl,
        });
        continue; // Don't descend into repos
      }

      // List subdirectories
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (EXCLUDED_DIRS.includes(entry.name)) continue;

        queue.push({
          path: join(currentPath, entry.name),
          depth: depth + 1
        });
      }
    } catch (err) {
      errors.push({
        path: currentPath,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  return { repos, scannedDirectories: scannedCount, errors };
}
```

### Edge Cases Handled

1. **Symlink cycles** - `readdir` with `withFileTypes` doesn't follow symlinks by default
2. **Permission denied** - Caught and recorded in errors array
3. **Git worktrees** - `ensureRepoReady` handles worktree detection correctly
4. **Windows paths** - Using `path.join()` and `path.resolve()` throughout
5. **Memory limits** - `MAX_REPOS` prevents unbounded growth

---

## E. Clone via Native Addon

### Implementation Location

Add to `packages/worktrunk-native/src/lib.rs`

### Native Addon Clone Function

```rust
use napi::{bindgen_prelude::*, threadsafe_function::*};
use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks, Progress};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[napi(object)]
pub struct CloneProgress {
  pub phase: String,
  pub current: u32,
  pub total: u32,
  pub percent: u32,
}

#[napi]
pub fn clone_repository(
  url: String,
  target_path: String,
  #[napi(ts_arg_type = "(progress: CloneProgress) => void")]
  progress_callback: JsFunction,
) -> Result<String> {
  // Create threadsafe callback
  let tsfn: ThreadsafeFunction<CloneProgress, ErrorStrategy::Fatal> =
    progress_callback.create_threadsafe_function(0, |ctx| {
      Ok(vec![ctx.value])
    })?;

  let cancelled = Arc::new(AtomicBool::new(false));

  // Set up progress callbacks
  let mut callbacks = RemoteCallbacks::new();
  let tsfn_clone = tsfn.clone();

  callbacks.transfer_progress(move |progress: Progress| {
    let percent = if progress.total_objects() > 0 {
      ((progress.received_objects() as f64 / progress.total_objects() as f64) * 100.0) as u32
    } else {
      0
    };

    let phase = if progress.received_objects() < progress.total_objects() {
      "receiving"
    } else if progress.indexed_deltas() < progress.total_deltas() {
      "resolving"
    } else {
      "done"
    };

    let _ = tsfn_clone.call(
      CloneProgress {
        phase: phase.to_string(),
        current: progress.received_objects() as u32,
        total: progress.total_objects() as u32,
        percent,
      },
      ThreadsafeFunctionCallMode::NonBlocking,
    );

    true // Continue operation
  });

  // Configure fetch options
  let mut fetch_opts = FetchOptions::new();
  fetch_opts.remote_callbacks(callbacks);

  // Build and execute clone
  let mut builder = RepoBuilder::new();
  builder.fetch_options(fetch_opts);

  let repo = builder.clone(&url, Path::new(&target_path))
    .map_err(|e| Error::new(Status::GenericFailure, format!("Clone failed: {}", e)))?;

  // Return the actual path (normalized)
  let workdir = repo.workdir()
    .ok_or_else(|| Error::new(Status::GenericFailure, "No workdir"))?;

  Ok(workdir.to_string_lossy().to_string())
}
```

### TypeScript Wrapper

```typescript
// src/discovery/repoCloner.ts
import { cloneRepository as nativeClone, CloneProgress } from 'worktrunk-native';
import { join, basename, resolve } from 'path';
import { existsSync } from 'fs';

export interface CloneOptions {
  remoteUrl: string;
  targetDirectory: string;
  onProgress?: (progress: CloneProgress) => void;
}

export async function cloneRepository(options: CloneOptions): Promise<string> {
  const { remoteUrl, targetDirectory, onProgress } = options;

  // Extract repo name from URL
  const repoName = extractRepoName(remoteUrl);
  let targetPath = join(resolve(targetDirectory), repoName);

  // Handle existing directory
  if (existsSync(targetPath)) {
    targetPath = findAvailablePath(targetDirectory, repoName);
  }

  // Execute clone with progress
  const resultPath = await nativeClone(
    remoteUrl,
    targetPath,
    onProgress ?? (() => {})
  );

  return resultPath;
}

function extractRepoName(url: string): string {
  // Handle various URL formats
  const match = url.match(/\/([^\/]+?)(\.git)?$/);
  return match?.[1] ?? 'repository';
}

function findAvailablePath(dir: string, baseName: string): string {
  let counter = 1;
  let candidate = join(dir, `${baseName}-${counter}`);
  while (existsSync(candidate)) {
    counter++;
    candidate = join(dir, `${baseName}-${counter}`);
  }
  return candidate;
}
```

---

## F. API Endpoints

### Two Simple Endpoints

#### POST /v1/discovery/scan

Synchronous directory scan - returns results immediately.

**Request:**
```json
{
  "path": "C:/Users/jayte/Documents/dev"
}
```

**Response (200):**
```json
{
  "repos": [
    {
      "path": "C:/Users/jayte/Documents/dev/Aperture",
      "name": "Aperture",
      "remoteUrl": "https://github.com/user/aperture.git",
      "hasOrigin": true
    }
  ],
  "scannedDirectories": 423,
  "errors": []
}
```

**Error Response (400):**
```json
{
  "error": "INVALID_PATH",
  "message": "Path does not exist: C:/invalid/path"
}
```

#### POST /v1/workspaces/clone

Clone and create workspace in one operation. Progress sent via WebSocket.

**Request:**
```json
{
  "remoteUrl": "https://github.com/anthropics/claude-code.git",
  "targetDirectory": "C:/Users/jayte/Documents/dev",
  "name": "Claude Code"
}
```

**Response (201):**
```json
{
  "workspace": {
    "id": "ws_abc123",
    "name": "Claude Code",
    "repoPath": "C:/Users/jayte/Documents/dev/claude-code"
  }
}
```

**WebSocket Progress Events:**
```json
{
  "type": "clone_progress",
  "data": {
    "phase": "receiving",
    "current": 1500,
    "total": 3000,
    "percent": 50
  }
}
```

**Error Response (400):**
```json
{
  "error": "INVALID_GIT_URL",
  "message": "Invalid git URL format"
}
```

**Error Response (409):**
```json
{
  "error": "DUPLICATE_WORKSPACE",
  "message": "Workspace already exists for this repository"
}
```

---

## G. Frontend Integration

### Extend Existing Modal (No New Page)

Modify `web/src/components/CreateWorkspaceModal.tsx` to add tabs:

```tsx
// Add to CreateWorkspaceModal.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';

function CreateWorkspaceModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'local' | 'clone'>('local');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="local">Browse Local</TabsTrigger>
            <TabsTrigger value="clone">Clone from URL</TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <LocalRepoSelector onSelect={handleLocalSelect} />
          </TabsContent>

          <TabsContent value="clone">
            <CloneForm onSubmit={handleClone} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LocalRepoSelector({ onSelect }) {
  const [scanPath, setScanPath] = useState('');
  const [repos, setRepos] = useState<DiscoveredRepo[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await api.discoverRepos(scanPath);
      setRepos(result.repos);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="C:/Users/you/dev"
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
        />
        <Button onClick={handleScan} disabled={isScanning}>
          {isScanning ? 'Scanning...' : 'Scan'}
        </Button>
      </div>

      {repos.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2">
          {repos.map((repo) => (
            <div
              key={repo.path}
              className="p-2 border rounded cursor-pointer hover:bg-muted"
              onClick={() => onSelect(repo)}
            >
              <div className="font-medium">{repo.name}</div>
              <div className="text-sm text-muted-foreground">{repo.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CloneForm({ onSubmit }) {
  const [url, setUrl] = useState('');
  const [targetDir, setTargetDir] = useState('');
  const [progress, setProgress] = useState<CloneProgress | null>(null);

  // Subscribe to WebSocket for progress
  useEffect(() => {
    const unsubscribe = wsClient.on('clone_progress', setProgress);
    return unsubscribe;
  }, []);

  return (
    <div className="space-y-4">
      <Input
        placeholder="https://github.com/user/repo.git"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Input
        placeholder="Target directory"
        value={targetDir}
        onChange={(e) => setTargetDir(e.target.value)}
      />

      {progress && (
        <div className="space-y-1">
          <div className="text-sm">{progress.phase}: {progress.percent}%</div>
          <Progress value={progress.percent} />
        </div>
      )}

      <Button onClick={() => onSubmit({ url, targetDir })}>
        Clone & Create Workspace
      </Button>
    </div>
  );
}
```

---

## H. Error Handling

### Error Scenarios

| Scenario | HTTP Status | Error Code | User Message |
|----------|-------------|------------|--------------|
| Path does not exist | 400 | `INVALID_PATH` | "Path does not exist: {path}" |
| Permission denied | 400 | `PERMISSION_DENIED` | "Cannot access path: {path}" |
| Invalid git URL | 400 | `INVALID_GIT_URL` | "Invalid git URL format" |
| Clone failed | 500 | `CLONE_FAILED` | "Clone failed: {details}" |
| Auth required | 401 | `AUTH_REQUIRED` | "Authentication required for this repository" |
| Repo not found | 404 | `REPO_NOT_FOUND` | "Repository not found: {url}" |
| Workspace exists | 409 | `DUPLICATE_WORKSPACE` | "Workspace already exists for this repository" |

### Path Validation

```typescript
// src/discovery/pathValidation.ts
import { resolve, isAbsolute } from 'path';
import { access } from 'fs/promises';

export function validatePath(inputPath: string): string {
  // Must be absolute
  if (!isAbsolute(inputPath)) {
    throw new Error(`Path must be absolute: ${inputPath}`);
  }

  // Normalize (handles .. and Windows path separators)
  const normalized = resolve(inputPath);

  // On Windows, verify it starts with a drive letter
  if (process.platform === 'win32') {
    if (!/^[a-zA-Z]:/.test(normalized)) {
      throw new Error(`Invalid Windows path: ${inputPath}`);
    }
  }

  return normalized;
}

export async function validatePathExists(inputPath: string): Promise<string> {
  const normalized = validatePath(inputPath);
  await access(normalized); // Throws if not accessible
  return normalized;
}
```

---

## I. Test Plan

### Unit Tests

#### Discovery Tests (`src/discovery/__tests__/repoDiscovery.test.ts`)

```typescript
describe('discoverRepositories', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    await createGitRepo(join(tempDir, 'project-a'));
    await createGitRepo(join(tempDir, 'project-b'));
    await createDirectory(join(tempDir, 'not-a-repo'));
  });

  it('discovers git repositories', async () => {
    const result = await discoverRepositories(tempDir);
    expect(result.repos).toHaveLength(2);
    expect(result.repos.map(r => r.name)).toContain('project-a');
  });

  it('excludes node_modules', async () => {
    await createGitRepo(join(tempDir, 'node_modules/some-pkg'));
    const result = await discoverRepositories(tempDir);
    expect(result.repos.map(r => r.name)).not.toContain('some-pkg');
  });

  it('handles permission denied gracefully', async () => {
    // Create unreadable directory
    const result = await discoverRepositories(tempDir);
    expect(result.errors).toBeDefined();
  });

  it('respects MAX_REPOS limit', async () => {
    // Create 600 repos
    for (let i = 0; i < 600; i++) {
      await createGitRepo(join(tempDir, `repo-${i}`));
    }
    const result = await discoverRepositories(tempDir);
    expect(result.repos.length).toBeLessThanOrEqual(500);
  });

  it('supports cancellation', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const result = await discoverRepositories(tempDir, controller.signal);
    // Should complete without error, may have partial results
  });
});
```

#### Path Validation Tests

```typescript
describe('validatePath', () => {
  it('accepts absolute paths', () => {
    expect(validatePath('C:/Users/test')).toBe('C:\\Users\\test');
  });

  it('rejects relative paths', () => {
    expect(() => validatePath('./relative')).toThrow();
  });

  it('normalizes path separators on Windows', () => {
    const result = validatePath('C:/Users/test/path');
    expect(result).toMatch(/^C:\\/);
  });
});
```

### Integration Tests

#### Clone Tests (`src/discovery/__tests__/repoCloner.integration.test.ts`)

```typescript
describe('cloneRepository', () => {
  it('clones a public repository', async () => {
    const progressEvents: CloneProgress[] = [];

    const resultPath = await cloneRepository({
      remoteUrl: 'https://github.com/octocat/Hello-World.git',
      targetDirectory: tempDir,
      onProgress: (p) => progressEvents.push(p),
    });

    expect(existsSync(join(resultPath, '.git'))).toBe(true);
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1].phase).toBe('done');
  });

  it('handles naming conflicts', async () => {
    // Clone same repo twice
    await cloneRepository({
      remoteUrl: 'https://github.com/octocat/Hello-World.git',
      targetDirectory: tempDir,
    });

    const secondPath = await cloneRepository({
      remoteUrl: 'https://github.com/octocat/Hello-World.git',
      targetDirectory: tempDir,
    });

    expect(secondPath).toContain('Hello-World-1');
  });
});
```

### API Tests

```typescript
describe('POST /v1/discovery/scan', () => {
  it('returns discovered repos', async () => {
    const response = await request(app)
      .post('/v1/discovery/scan')
      .send({ path: testRepoDir });

    expect(response.status).toBe(200);
    expect(response.body.repos).toBeInstanceOf(Array);
  });

  it('rejects invalid paths', async () => {
    const response = await request(app)
      .post('/v1/discovery/scan')
      .send({ path: '/nonexistent/path' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_PATH');
  });
});

describe('POST /v1/workspaces/clone', () => {
  it('clones and creates workspace', async () => {
    const response = await request(app)
      .post('/v1/workspaces/clone')
      .send({
        remoteUrl: 'https://github.com/octocat/Hello-World.git',
        targetDirectory: tempDir,
        name: 'Hello World',
      });

    expect(response.status).toBe(201);
    expect(response.body.workspace.id).toBeDefined();
    expect(response.body.workspace.repoPath).toContain('Hello-World');
  });

  it('prevents duplicate workspaces', async () => {
    // Create first workspace
    await request(app)
      .post('/v1/workspaces/clone')
      .send({
        remoteUrl: 'https://github.com/octocat/Hello-World.git',
        targetDirectory: tempDir,
      });

    // Try to clone same URL with different target - should still detect duplicate
    const response = await request(app)
      .post('/v1/workspaces/clone')
      .send({
        remoteUrl: 'https://github.com/octocat/Hello-World.git',
        targetDirectory: join(tempDir, 'other'),
      });

    // Note: This would NOT fail since it's a different path
    // Duplicate detection is by repo_path, not URL
    expect(response.status).toBe(201);
  });
});
```

---

## J. Implementation Milestones

### Milestone 1: Core Discovery & Clone

**Files to create:**
- `src/types/discovery.ts` - Minimal type definitions
- `src/discovery/repoDiscovery.ts` - Discovery logic
- `src/discovery/repoCloner.ts` - TypeScript clone wrapper
- `src/discovery/pathValidation.ts` - Path validation utilities

**Files to modify:**
- `packages/worktrunk-native/src/lib.rs` - Add `clone_repository` function
- `packages/worktrunk-native/index.d.ts` - TypeScript types for clone

**Deliverable:** Core functionality with unit tests.

### Milestone 2: API & Frontend

**Files to create:**
- `src/routes/discovery.ts` - Discovery endpoint

**Files to modify:**
- `src/routes.ts` - Register discovery route
- `src/routes/workspaces.ts` - Add clone endpoint
- `web/src/components/CreateWorkspaceModal.tsx` - Add tabs for browse/clone
- `web/src/lib/api.ts` - API client functions

**Deliverable:** End-to-end functionality.

### Milestone 3: Polish

**Tasks:**
- WebSocket progress integration
- Error message polish
- Cross-platform testing (Windows focus)

**Deliverable:** Production-ready feature.

---

## K. What Was Removed (Per Reviewer Feedback)

Based on feedback from DHH, Kieran, and Code Simplicity reviewers:

1. **`discovered_repos` table** - Discovery results are ephemeral, stored in memory
2. **`clone_operations` table** - Clone is synchronous, no job tracking needed
3. **`source_type`/`source_id` columns** - No provenance tracking
4. **Async polling endpoints** - Synchronous is sufficient for these operations
5. **URL normalization subsystem** - Dedup by `repo_path`, not normalized URL
6. **6 configuration options** - Hard-coded sensible defaults
7. **Separate Discovery page** - Extended existing modal instead
8. **Rate limiting per operation** - Existing limits are sufficient

## L. What Was Kept (Per User Request)

- **Native addon clone function** - Provides reliable progress callbacks via git2-rs, handles auth via system credential helpers, consistent with existing native addon patterns
