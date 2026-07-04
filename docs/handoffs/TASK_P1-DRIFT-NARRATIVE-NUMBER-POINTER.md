---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-DRIFT-NARRATIVE-NUMBER-POINTER
size: S
zone: docs/
depends_on: []
blocks: ["P1-DRIFT-PARITY-TEST-EXTEND"]
---

## TL;DR
Replace hardcoded tool/cron counts in CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md with pointers to the generated SSOT file (docs/data/tool-registry.json) so numbers never go stale.

## [PM] Planning Context

**Zone:** docs/

**Target:** CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md (narrative-doc prose)

**Mechanism:** Replace hardcoded numbers (e.g. "146 tools", "81 cron jobs") with a pointer to the generated SSOT file (no number to go stale). Example: `[generated tool count — see docs/data/tool-registry.json]` instead of `146 tools`.

**Files to read first:**
- CLAUDE.md (search for hardcoded tool/cron counts)
- docs/standards/mcp-tools.md (search for hardcoded numbers)
- docs/ARCHITECTURE.md (search for hardcoded numbers)
- docs/data/tool-registry.json (generated SSOT, source of truth)

**Files to modify:**
- CLAUDE.md — Replace hardcoded numbers with pointers
- docs/standards/mcp-tools.md — Replace hardcoded numbers with pointers
- docs/ARCHITECTURE.md — Replace hardcoded numbers with pointers

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `.claude/skills/system-map-query/SKILL.md` (how to reference generated files)

**Acceptance Criteria (machine-checkable):**

1. grep -c "146 tools\|161 live tools\|81 cron" CLAUDE.md docs/standards/mcp-tools.md docs/ARCHITECTURE.md == 0 (numbers replaced with pointers)
2. All narrative references point to docs/data/tool-registry.json or generated SSOT files
3. No hardcoded counts remain in these files (automated check via grep)

