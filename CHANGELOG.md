# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-25

### Added
- Claude Agent SDK integration (`claude_sdk` agent type) for direct SDK-based sessions
- SDK session management with full feature support:
  - Model selection with default models available before first prompt
  - Permission mode configuration (default, acceptEdits, bypassPermissions, plan, dontAsk)
  - MCP server management
  - File checkpointing and rewind capabilities
  - Session resumption and forking
  - Usage and cost tracking
- Frontend SDK components:
  - `SdkSessionHeader` - Model selector, permission mode, interrupt button
  - `SdkSessionSidebar` - Full session controls and info display
  - `SdkPermissionDialog` - Enhanced permission request UI
- WebSocket message forwarding for SDK session events
- Debug logging for SDK model loading flow

### Fixed
- SDK model selector now shows default models immediately on session creation
- Fixed `modelsNeedPrompt` conditional to properly show dropdown when models are available
- Fixed top-level await in worktrunk-native for CJS compatibility

### Changed
- Updated session store to initialize SDK models with defaults for SDK sessions
- Enhanced permission handling with SDK suggestions and context

## [1.0.0] - Initial Release

### Added
- WebSocket + HTTP gateway for Claude Code ACP
- Session management with SQLite persistence
- Multi-agent support (claude_acp, codex, gemini)
- Workspace and worktree management
- Authentication modes (interactive, api_key, oauth, vertex)
- Rate limiting and CORS configuration
- Health check endpoints (/healthz, /readyz)
