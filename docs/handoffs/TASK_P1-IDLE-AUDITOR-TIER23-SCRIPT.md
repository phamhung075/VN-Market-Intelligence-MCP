---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-IDLE-AUDITOR-TIER23-SCRIPT
size: S
zone: scripts/agents-flow/
depends_on: []
blocks: ["P1-IDLE-AUDITOR-CRON-WIRING"]
---

## TL;DR
Generalize `scripts/agents-flow/auditor-tier1-probe.sh` to accept `--tier=2|3` parameter and implement the same ALL_GREEN + fresh-heartbeat pre-spawn check that Tier-1 already has, running BEFORE the cron even spawns the subagent (not just before commit).

## [PM] Planning Context

**Zone:** scripts/agents-flow/

**Target:** `scripts/agents-flow/auditor-tier1-probe.sh`

**Mechanism:** Generalize to accept `--tier=2|3` implementing the SAME `ALL_GREEN+fresh-heartbeat` pre-spawn check Tier-1 already has, run BEFORE the cron even spawns the subagent (not just before commit).

**Files to read first:**
- `scripts/agents-flow/auditor-tier1-probe.sh` (understand Tier-1 all-green + heartbeat logic)
- `.claude/skills/cron-detect-loop/SKILL.md` (understand Job 2/3/4 structure)

**Files to modify:**
- `scripts/agents-flow/auditor-tier1-probe.sh` — Add `--tier` parameter parsing and tier-specific logic

**Files to create:**
- None

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md` (bash script pattern)
- `.claude/skills/cron-detect-loop/SKILL.md` (cron job structure)

**Acceptance Criteria (machine-checkable):**

1. `bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2` invoked twice with no underlying DB/heartbeat delta between invocations → second call returns SKIP-SPAWN, zero subagent launch, zero commit
2. Script accepts `--tier=1|2|3` parameter (backward compatible with Tier-1 as default)
3. Tier-1 existing behavior unchanged (rerun without --tier or with --tier=1 produces same results)

