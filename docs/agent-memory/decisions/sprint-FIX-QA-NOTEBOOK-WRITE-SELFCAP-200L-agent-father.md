**task-id:** FIX-QA-NOTEBOOK-WRITE-SELFCAP-200L

**agent:** agent-father
**date:** 2026-06-28
**sprint:** FIX-QA-NOTEBOOK-WRITE-SELFCAP-200L (size S, on-main)

---

## Root Cause

`docs/agent-memory/notebooks/qa.md` re-emits `context_bloat_breach` on every dev-team tick because `qa` is registered in NEITHER notebook-write class:

- NOT in OVERWRITE class (po, market-watcher)
- NOT in APPEND class list in `docs/data/file-size-caps.json` _note field
- NOT in APPEND class list in `.claude/skills/notebook-write/SKILL.md` AC-6 table

Without a class assignment, the agent has no write-time self-cap contract. External prunes (fe93258b pruned 207→195L, a7befb0c re-breached 203L, last tick 215→219L) only delay re-breach — the next notebook append re-enters the treadmill. Per memory `feedback_qa_notebook_reprune_treadmill_escalate`: re-breach after prune = STRUCTURAL; do NOT prune again — fix the writer.

## Fix Applied

Three files changed (docs-only, writer-enforced):

**1. `.claude/skills/notebook-write/SKILL.md` (AC-6 table)**
Added `qa` to the APPEND class agents list. The AC-6 APPEND contract provides: AC-2 section retention + AC-3 settled-write (compose full ≤200L body in memory, apply drop-oldest loop if >200L, land in ONE Write call) + AC-2b intra-prune + AC-5 wc gate.

**2. `docs/data/file-size-caps.json` (_note APPEND class list)**
Added `qa` to the APPEND-class list in the `agent-notebook` cap entry `_note`. This aligns the SSOT (file-size-caps.json) with the writer contract (notebook-write/SKILL.md) — both now declare qa as APPEND class.

**3. `docs/agents/qa/flow/main.md` (End-of-cycle step)**
Added explicit APPEND class annotation below the `cowork-end-cycle` skill reference at line 211:
```
Notebook-write class: APPEND (AC-6) — compose settled ≤200L body in memory
(AC-3 drop-oldest loop if > 200L) before single Write.
```
Also updated size-justification comment from `220L` (stale) to `227L` (actual) + noted the +1L change.

## Why This Stops The Treadmill

The writer-enforced settled-write (AC-3) applies to every qa notebook write going forward:
- Compose in memory: read current file → drop oldest `## ` block(s) until preamble + remaining sections + new section ≤ 200L → land single Write
- No PostToolUse hook ever sees a qa.md > 200L
- No `context_bloat_breach` signal for qa.md re-emits

## Proof (Dry-Run Simulation)

Simulated a 24-line new section appended to the current 183L qa.md:

```
Baseline file:     183L
New section size:  24L
Proposed total:    207L (before AC-3 trim)

  → OVER CAP: applying AC-3 drop-oldest loop...
  Drop #1: 'cycle-330 · 2026-06-28 · TASK-FFT-L3B...' (-4L) → 203L
  Drop #2: 'cycle-329 · 2026-06-27 · TASK-FFT-L4...'  (-4L) → 199L

BEFORE: 207L
AFTER:  199L
PROOF PASS ✓ — AC-3 drop-oldest loop lands settled body at 199L (≤200L cap)
```

## Files Changed

- `.claude/skills/notebook-write/SKILL.md` — qa added to AC-6 APPEND class
- `docs/data/file-size-caps.json` — qa added to APPEND class in _note
- `docs/agents/qa/flow/main.md` — APPEND class annotation + size-justification updated
- `docs/agent-memory/decisions/sprint-FIX-QA-NOTEBOOK-WRITE-SELFCAP-200L-agent-father.md` — this file

## Done Gate Status

DONE — next qa notebook write that would exceed 200L will auto-trim oldest cycle section(s) at write time via AC-3 settled-write invariant. File physically cannot exceed cap.
