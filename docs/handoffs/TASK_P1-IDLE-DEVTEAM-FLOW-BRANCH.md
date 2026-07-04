---
sprint: SYSTEMIC-REMAKE-P1
branch: task/P1-IDLE-DEVTEAM-FLOW-BRANCH
size: S
zone: docs/agents/dev-team/
depends_on: ["P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT"]
blocks: []
---

## TL;DR
Add RUN-IDLE branch to dev-team flow Step 0-PREFLIGHT verdict table, routing to end (no drain-signals, no commit) — mirrors cowork's silent-release pattern once preflight script returns RUN-IDLE verdict.

## [PM] Planning Context

**Zone:** docs/agents/dev-team/

**Target:** `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT verdict table

**Mechanism:** Add RUN-IDLE branch → JUMP straight to `end` (skip Step 0a `drain-signals` entirely — mirrors cowork's silent-release: emit last state, release locks, zero commit).

**Files to read first:**
- `docs/agents/dev-team/flow/main.md` (Step 0 verdict table structure, current branches)
- `scripts/agents-flow/cowork-tick-preflight.sh` (silent-release reference pattern)
- `docs/agents/dev-team/flow/drain-signals.md` (what Step 0a does, what RUN-IDLE skips)

**Files to modify:**
- `docs/agents/dev-team/flow/main.md` — Add RUN-IDLE case to Step 0-PREFLIGHT verdict table

**Files to create:**
- None

**Dependencies:** P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT (must complete first to ensure preflight script returns RUN-IDLE verdict)

**Knowledge needed:**
- `docs/agents/dev-team/init.md`
- `docs/policies/dev-standards.md`

**Acceptance Criteria (machine-checkable):**

1. When dev-team-tick-preflight.sh returns RUN-IDLE verdict, flow routes to RUN-IDLE branch
2. RUN-IDLE branch skips Step 0a (drain-signals) entirely
3. Flow jumps to end, returns without commit (git log shows no chore commits for idle cycles)

