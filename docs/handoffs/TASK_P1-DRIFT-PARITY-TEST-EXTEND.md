---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-DRIFT-PARITY-TEST-EXTEND
size: S
zone: scripts/
depends_on: ["P1-DRIFT-NARRATIVE-NUMBER-POINTER"]
blocks: []
---

## TL;DR
Extend existing tool-registry-parity.test.ts to ALSO grep CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md for hardcoded tool/cron counts and fail if they diverge from generated SSOT (docs/data/tool-registry.json).

## [PM] Planning Context

**Zone:** scripts/

**Target:** `scripts/tool-registry-parity.test.ts` (or similar test file)

**Mechanism:** Extend to ALSO grep CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md prose for hardcoded tool/cron counts and fail if they diverge from the generated SSOT (docs/data/tool-registry.json). This closes the gap the finding names: "no CI check keys these copies to the registry."

**Files to read first:**
- `scripts/tool-registry-parity.test.ts` (or equivalent parity test)
- `scripts/gen-project-stats.ts` / `scripts/gen-tool-registry.ts` (SSOT generation logic)
- CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md (narrative docs to check)

**Files to modify:**
- Test file — Add grep+comparison logic for narrative doc hardcoded counts

**Files to create:**
- None

**Dependencies:** P1-DRIFT-NARRATIVE-NUMBER-POINTER (must complete first to ensure narrative docs have been updated)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Test file pattern examples from codebase

**Acceptance Criteria (machine-checkable):**

1. Extended parity test: inject deliberately wrong count into throwaway copy of narrative doc → test exits non-zero
2. Test verifies CLAUDE.md count (if present) matches docs/data/tool-registry.json
3. Test verifies docs/standards/mcp-tools.md count (if present) matches SSOT
4. Test verifies docs/ARCHITECTURE.md count (if present) matches SSOT
5. CI passes when counts match, fails when diverged

