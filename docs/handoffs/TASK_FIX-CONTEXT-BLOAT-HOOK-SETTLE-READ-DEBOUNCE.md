---
sprint: SYSTEMIC-REMAKE-P1
branch: task/FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE
size: M
zone: scripts/agents-flow/
depends_on: []
blocks: []
---

## TL;DR
Implement settle-read/debounce fix in context-bloat-backstop.sh: re-read the file's line count after a short settle window (or gate on committed-state, not mid-write) before declaring a breach.

## [PM] Planning Context

**Zone:** scripts/agents-flow/

**Target:** `scripts/agents-flow/context-bloat-backstop.sh`

**Mechanism:** Implement the settle-read/debounce fix: re-read the file's line count after a short settle window (or gate on committed-state, not mid-write) before declaring a breach. Confirm docs/data/system-auditor-known-issues.json-style fingerprint suppression is wired into the emit path.

**Files to read first:**
- `scripts/agents-flow/context-bloat-backstop.sh` (current implementation)
- `docs/data/system-auditor-known-issues.json` (fingerprint suppression pattern)
- `.claude/hooks/wiki-index-build.sh` or related context-bloat references

**Files to modify:**
- `scripts/agents-flow/context-bloat-backstop.sh` — Add settle-read window, debounce logic

**Files to create:**
- None (reuse existing fingerprint suppression pattern)

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `docs/memory/feedback_auditor_false_positive_destructive.md` (context-bloat FP history)

**Acceptance Criteria (machine-checkable):**

1. docs/data/system-auditor-known-issues.json-style fingerprint suppression is confirmed wired into context-bloat-backstop.sh's emit path — grep shows the script reads a fingerprint file before post_agent_signal
2. Script implements settle-read: re-reads file after configured delay before breach declaration
3. FP re-emission count for context-bloat trends down post-deployment

