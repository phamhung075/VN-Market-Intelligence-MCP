---
sprint: SYSTEMIC-REMAKE-P1
branch: task/FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT
size: S
zone: docs/agents/po/
depends_on: []
blocks: []
---

## TL;DR
Implement two-layer freshness check for BCTC auditor: separate fetch-time freshness (data currency) from analysis-time freshness (recency of last extraction). Re-read .claude/skills/signal-dashboard/SKILL.md and docs/agents/po/flow/triage-signals.md to ensure origin_signal_id wiring is in place for closure tracking.

## [PM] Planning Context

**Zone:** docs/agents/po/

**Target:** docs/agents/po/flow/triage-signals.md + docs/agents/pm/flow/task-archive.md (verify origin_signal_id wiring is complete)

**Mechanism:** Verify the two-layer freshness architecture for BCTC is properly wired:
- Layer 1: fetch-time freshness (is the data fresh from the source?)
- Layer 2: analysis-time freshness (when was the last analysis/extraction run?)

Ensure signal closure tracking (origin_signal_id + CLOSE protocol) is integrated into the fix workflow.

**Files to read first:**
- Brief §1.2 RC-DETECTOR and feedback files on BCTC freshness
- `.claude/skills/signal-dashboard/SKILL.md` (CLOSE protocol)
- docs/agents/po/flow/triage-signals.md (origin_signal_id wiring)

**Files to modify:**
- None (verification/integration only — actual code fixes are in P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS and P1-DETECTOR-CLOSURE-TASK-ARCHIVE)

**Files to create:**
- None

**Dependencies:** None (verification task runs in parallel with closure wiring tasks)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- News freshness detection (two-layer) reference materials

**Acceptance Criteria (machine-checkable):**

1. BCTC auditor probe distinguishes fetch-time from analysis-time freshness in signal emit
2. origin_signal_id field is present on BCTC-related FIX tasks (if created from signals)
3. Signal closure (READ→RESOLVED) workflow is operational for BCTC fix tasks

