---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security, ssrf, input-validation]
dependencies: []
---

# No URL validation for git clone allows SSRF attacks

## Problem Statement

The `/v1/workspaces/clone` endpoint accepts any `remoteUrl` without validation. An attacker can provide internal URLs to perform Server-Side Request Forgery (SSRF) attacks, potentially accessing:
- Local files: `file:///etc/passwd`
- Internal services: `git://internal-server/repo`
- Cloud metadata: `http://169.254.169.254/latest/meta-data/` (AWS credentials)
- Internal network resources

**Why it matters:** This is a critical security vulnerability that could lead to credential theft, internal network mapping, or data exfiltration.

## Findings

**Source:** Security Sentinel

1. The clone endpoint (workspaces.ts:97-108) only validates that `remoteUrl` is a non-empty string
2. No protocol validation (allows file://, git://, http://)
3. No host validation (allows internal IPs, localhost, cloud metadata IPs)
4. Native `clone_repository` (lib.rs:217-218) passes URL directly to git2's RepoBuilder

**Evidence:**
```typescript
// src/routes/workspaces.ts:97-102
if (!remoteUrl || typeof remoteUrl !== 'string') {
  return reply.status(400).send({
    error: 'INVALID_GIT_URL',
    message: 'Missing or invalid field: remoteUrl',
  });
}
// No further URL validation before cloning
```

**Attack vectors:**
- `file:///etc/passwd` - Read local files
- `http://169.254.169.254/latest/meta-data/iam/security-credentials/` - AWS credentials
- `git://10.0.0.5/internal-repo` - Access internal git servers
- `http://localhost:8080/admin` - Access local services

## Proposed Solutions

### Option 1: Allowlist protocols and block internal IPs (Recommended)
**Pros:** Comprehensive protection, follows security best practices
**Cons:** May block legitimate use cases
**Effort:** Small (2-3 hours)
**Risk:** Low

```typescript
function validateGitUrl(url: string): { valid: boolean; error?: string } {
  // Only allow https:// and git@ SSH URLs
  const httpsPattern = /^https:\/\/[^\/]+\/.+$/;
  const sshPattern = /^git@[^:]+:.+$/;

  if (!httpsPattern.test(url) && !sshPattern.test(url)) {
    return { valid: false, error: 'Only HTTPS and SSH git URLs are allowed' };
  }

  // Block internal/private IPs
  const urlObj = new URL(url.replace(/^git@([^:]+):/, 'ssh://$1/'));
  const hostname = urlObj.hostname;

  const blockedPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      return { valid: false, error: 'Internal network URLs are not allowed' };
    }
  }

  return { valid: true };
}
```

### Option 2: DNS resolution check
**Pros:** Catches DNS rebinding attacks
**Cons:** Adds latency, requires async validation
**Effort:** Medium (4-6 hours)
**Risk:** Medium (could have false positives)

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**
- src/routes/workspaces.ts:90-201

**Components:** Workspace API, Clone endpoint

## Acceptance Criteria

- [ ] Only HTTPS and SSH git URLs are accepted
- [ ] Internal IP ranges are blocked (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x)
- [ ] localhost is blocked
- [ ] file:// protocol is blocked
- [ ] git:// protocol is blocked (unencrypted)
- [ ] http:// protocol is blocked (unencrypted)
- [ ] Clear error messages for blocked URLs
- [ ] Unit tests for URL validation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-08 | Created from code review | Identified by Security Sentinel agent |

## Resources

- OWASP SSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- AWS metadata endpoint: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html
