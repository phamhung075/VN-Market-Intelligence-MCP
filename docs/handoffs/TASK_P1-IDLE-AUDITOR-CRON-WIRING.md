---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-IDLE-AUDITOR-CRON-WIRING
size: S
zone: .claude/skills/
depends_on: ["P1-IDLE-AUDITOR-TIER23-SCRIPT"]
blocks: []
---

## TL;DR
Wire auditor-tier1-probe.sh --tier=2|3 as pre-gates in .claude/skills/cron-detect-loop/SKILL.md Job 3 (Tier-2 0 */4) + Job 4 (Tier-3 0 2), exactly mirroring how Job 2 already wires Tier-1.

## [PM] Planning Context

**Zone:** .claude/skills/

**Target:** `.claude/skills/cron-detect-loop/SKILL.md` Job 3 (Tier-2 `0 */4`) + Job 4 (Tier-3 `0 2`)

**Mechanism:** Wire `bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2` (etc.) as a pre-gate, exactly mirroring how Job 2 already wires Tier-1. ONLY agent-father updates this prompt/wiring file.

**Files to read first:**
- `.claude/skills/cron-detect-loop/SKILL.md` (Job 2/3/4 structure, how Job 2 wires Tier-1 pre-gate)
- `scripts/agents-flow/auditor-tier1-probe.sh` (post-generalization, to confirm --tier parameter works)

**Files to modify:**
- `.claude/skills/cron-detect-loop/SKILL.md` — Add pre-gate wiring to Job 3 and Job 4

**Files to create:**
- None

**Dependencies:** P1-IDLE-AUDITOR-TIER23-SCRIPT (must complete first to ensure generalized script is ready)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- `.claude/agents/agent-father.md` (agent-father's remit for skill wiring)

**Acceptance Criteria (machine-checkable):**

1. Tier-2 cron (Job 3) runs auditor-tier1-probe.sh --tier=2 BEFORE spawning system-auditor subagent
2. Tier-3 cron (Job 4) runs auditor-tier1-probe.sh --tier=3 BEFORE spawning system-auditor subagent
3. Both jobs follow the same pre-gate pattern as Job 2 (Tier-1)

