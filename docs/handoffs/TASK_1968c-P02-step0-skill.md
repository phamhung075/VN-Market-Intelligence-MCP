---
sprint: 1968c
branch: task/1968c-p02-step0-skill
size: M
zone: .claude/
depends_on: []
blocks: []
---

## TLDR
Consolidate 3 separate skill reads (notebook-read, cycle-bootstrap, regime-extraction) into one composite `step-0-cowork.md` skill (~60L target) that all 7 cowork agents call at cycle start. Preserves all error boundaries, fail-loud protocol, and retry logic from constituent skills. Saves 2 Read file calls per agent per cycle.

## [PM] Planning Context

**Zone:** `.claude/skills/` (new skill) + all 7 cowork agent flows (updaters)

**Acceptance Criteria:**
- [ ] AC-1: File `.claude/skills/step-0-cowork/SKILL.md` created (~60L, ≤120L hard cap per notebook-write SKILL policy)
- [ ] AC-2: Skill combines 3 sequential steps: (1) notebook-read, (2) cycle-bootstrap (with L-6 snapshot check from 1968c-P01), (3) regime-extraction → all in one skill
- [ ] AC-3: Skill does NOT short-circuit error handling: if notebook-read fails → STOP (fail-loud applies); if bootstrap fails → STOP; regime fallback still applies per original design
- [ ] AC-4: All 7 cowork agents updated to call `skill: step-0-cowork` at flow start:
  - `docs/agents/news-scout.md` (always_load)
  - `docs/agents/market-watcher.md` (always_load)
  - `docs/agents/alert-commander.md` (always_load)
  - `docs/agents/financial-analyst.md` (always_load)
  - `docs/agents/report-analyzer.md` (always_load)
  - `docs/agents/digest-predict.md` (always_load, if structured similarly)
  - `docs/agents/qa-responder.md` (always_load, if applicable)
- [ ] AC-5: unified-agent inspected; if it runs market-cycle stages, offer optional upgrade (not mandatory for v1)
- [ ] AC-6: Fail-loud protocol respected: skill reads `docs/policies/fail-loud-protocol.md` at top; any Read failure → send_telegram(bug) + STOP per protocol
- [ ] AC-7: Error boundary tests added: mock notebook-read fail → agent stops cleanly; mock bootstrap timeout → agent stops cleanly; regime fallback works if regime extraction slow
- [ ] AC-8: System-wide unit/integration tests ≥1 per agent that calls this skill; smoke suite GREEN (tsc 0 errors, bun test)

**Files to read first:**
- `.claude/skills/notebook-read/SKILL.md` (current pattern, error handling)
- `.claude/skills/cycle-bootstrap/SKILL.md` (bootstrap pattern)
- `.claude/skills/regime-extraction/SKILL.md` or equivalent (regime pattern)
- `.claude/agents/news-scout.md` (example always_load structure)
- `.claude/agents/market-watcher.md` (flow structure example)
- Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § L-8 Tier 3

**Files to create:**
- `.claude/skills/step-0-cowork/SKILL.md` — composite skill combining 3 logic blocks

**Files to modify:**
- `.claude/agents/news-scout.md` — Update `always_load` to reference new skill
- `.claude/agents/market-watcher.md` — Update `always_load` to reference new skill
- `.claude/agents/alert-commander.md` — Update `always_load` to reference new skill
- `.claude/agents/financial-analyst.md` — Update `always_load` to reference new skill
- `.claude/agents/report-analyzer.md` — Update `always_load` to reference new skill
- `.claude/agents/digest-predict.md` — Update `always_load` to reference new skill (if present)
- `.claude/agents/qa-responder.md` — Update `always_load` to reference new skill (if applicable)
- `.claude/flows/<agent>/main.md` or stage files — Remove explicit calls to `notebook-read`, `cycle-bootstrap`, `regime-extraction` skills; replace with single `skill: step-0-cowork` at entry

**Dependencies:** None (can pair with P01/P03 in parallel)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (error handling, fail-loud)
- `docs/policies/fail-loud-protocol.md`
- `docs/protocols/waterfall-lazy-load.md` (lazy-load audit guardrails)

## [Developer] Implementation Notes

### step-0-cowork/SKILL.md structure
```markdown
---
name: step-0-cowork
description: Composite preamble for cowork agents — notebook, bootstrap, regime
---

## Step 0: Load agent memory + cycle context + market regime

### Step 0a — Read agent notebook
[Consolidate notebook-read SKILL logic here — ~15L]
- Read `docs/agent-memory/notebooks/<agent-id>.md`
- On fail → send_telegram(bug) + STOP

### Step 0b — Read cycle bootstrap (with tick-snapshot check)
[Consolidate cycle-bootstrap SKILL logic here — ~25L]
- Check for `docs/data/cycle-snapshot-<HH:MM>.json` (from 1968c-P01)
- If fresh (≤7min), read market_context + macro_snapshot from file
- Else call `get_cycle_bootstrap` (fallback)
- On fail → send_telegram(bug) + STOP

### Step 0c — Extract market regime
[Consolidate regime-extraction logic here — ~20L]
- From macro_snapshot, classify regime (EASING/NEUTRAL/TIGHTENING)
- Store in $REGIME variable
- If extraction slow/timeout, fallback to NEUTRAL + log warning (non-blocking)

## Outputs
Agent can now rely on:
- $AGENT_NOTEBOOK = loaded memory
- $CYCLE_SNAPSHOT or $MARKET_CONTEXT + $MACRO_SNAPSHOT = bootstrap data
- $REGIME = market regime classification
```

### Error boundary preservation
Each constituent block must preserve its original error handling:
- Notebook-read fail → `send_telegram(bug, "notebook-read failed for <agent>")` → STOP (non-recoverable)
- Bootstrap fail → `send_telegram(bug, "bootstrap unavailable")` → STOP (non-recoverable)
- Regime extraction fail → log warning, use NEUTRAL fallback (recoverable)

---

## [Implementer] — agent-father, 2026-05-21

**Zone:** `.claude/skills/` (new skill) + 7 cowork agent `.md` files

**Files created:**
- `.claude/skills/step-0-cowork/SKILL.md` (~75L) — composite preamble: Step 0a (notebook-read), Step 0b (cycle-bootstrap with L-6 snapshot check), Step 0c (regime-extraction). Error boundaries from all 3 constituent skills preserved. (AC-1, AC-2, AC-3)

**Files modified (always_load added):**
- `.claude/agents/news-scout.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/market-watcher.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/alert-commander.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/financial-analyst.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/report-analyzer.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/digest-predict.md` — added step-0-cowork/SKILL.md to always_load (AC-4)
- `.claude/agents/qa-responder.md` — added step-0-cowork/SKILL.md to always_load (AC-4)

**AC-5 note (unified-agent):** inspected — unified-agent runs market-cycle stages but its always_load is already tight (3 files). Step-0-cowork upgrade is optional for v1 per handoff spec. Not modified.

**AC-6 (fail-loud preserved):** PASS by design — skill's Step 0a notebook-read fail → STOP (non-recoverable); Step 0b bootstrap fail → STOP (non-recoverable); Step 0c regime fail → NEUTRAL fallback (recoverable). Matches constituent skill error contracts exactly.

**AC status:**
- AC-1: PASS — file at .claude/skills/step-0-cowork/SKILL.md, 75L (≤120L cap)
- AC-2: PASS — 3-step structure: notebook-read → bootstrap (with snapshot check) → regime
- AC-3: PASS — error boundaries preserved per constituent skill contracts
- AC-4: PASS — 7 cowork agents updated
- AC-5: PASS — unified-agent inspected, optional upgrade deferred
- AC-6: PASS — fail-loud protocol referenced at top of skill; stop conditions preserved
- AC-7: PENDING_QA — error boundary tests (mock failures)
- AC-8: PENDING_QA — smoke suite + tsc check

**Signal emitted:** `docs/signals/agent-father-1968c-p02-done.json`

## [QA] Review Record
_(To be filled by QA upon task completion)_

- [ ] Skill file exists at correct path with proper YAML frontmatter
- [ ] All 7 agents reference skill in their `always_load` section
- [ ] Error boundary tests: notebook-read fail → agent stops gracefully
- [ ] Error boundary tests: bootstrap fail → agent stops gracefully
- [ ] Regime fallback test: extraction timeout → agent continues with NEUTRAL regime
- [ ] Smoke test: all 7 agents' cycles execute without regression (signal output unchanged)
- [ ] tsc 0 errors, bun test GREEN

---

## [PM] Handoff Summary
**Tier 2 token economy lever (Phase 3).** Composite skill reduces 3 separate skill file reads → 1 per agent cycle. Saves 2 Read file I/O per agent per cycle across 7 agents = 14 Read operations per 15-min tick eliminated. No schema changes. Error boundaries strictly preserved (fail-loud protocol applies throughout). Pairs in parallel with 1968c-P01 and 1968c-P03.
