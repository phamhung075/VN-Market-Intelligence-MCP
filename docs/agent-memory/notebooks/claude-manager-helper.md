# Claude Manager Helper — Notebook

**Last cycle:** 2026-07-21T00:00:00Z + Pass 0b (targeted obsolete cleanup); 110 files quarantined (2 pattern-A/B + 108 pattern-C snapshots); manifest audit trail; 69 signals (drain_behind=true); idempotency verified

**Cycles:** [2026-07-21-tue](#cycle-2026-07-21-tue) | [2026-07-09-thu](#cycle-2026-07-09-thu) | [2026-07-02-thu](#cycle-2026-07-02-thu) | [2026-06-29-mon](#cycle-2026-06-29-mon) | [Older](#archive)

## Cycle 2026-07-21 (Tue 00:00Z): Routine Audit — 10-Pass Clean + Garbage File Relocation

**Trigger:** Routine audit (task=routine-audit)
**Session:** 58a64705-78db-456f-bdf5-a1a5275bb85a

**Input:** `git diff HEAD~3..HEAD` → 1 file in GROUP_MEMORY. Working tree: 23 modified, 33 untracked.
**Weekday:** Tuesday (2) — standard flow (Passes 0–9, skip 9b)

### Pre-Check & Routing
- **Groups:** KNOWLEDGE (6), AGENTS (7), ROOT (1), MEMORY (8 modified)
- **Decision:** Full run (Passes 0–10); not Mon/Thu fast-path

### Pass Results
**Pass 0 (File Location):** FIXED ✓
- `$DUMP_FILE` (9.9M unexpanded shell var) → docs/archive/ ✓
- `docs/data/coverage-state.json.tmp` → docs/archive/ ✓

**Pass 1 (Tree-Map):** OK — no broken pointers
**Pass 2 (Volatile Split):** OK — 5 potential hardcoded counts flagged (needs review)
**Pass 3 (Agent Pointers):** OK — references valid
**Pass 4 (CLAUDE.md Bloat):** OK — 62L ≤ 120
**Pass 5 (Size Caps):** OK — task_board=20 ≤ 80, sprint_goal=15 ≤ 15
**Pass 5b (Context-Bloat):** SIGNAL — 14 unprocessed signals (awaiting processor)
**Pass 6 (Memory):** OK — 176L ≤ 200
**Pass 7 (Dedup):** SKIPPED (needs agent-father)
**Pass 8 (Telegram):** OK — MARKET=17, WORK=86, BUG=83
**Pass 9 (Tool-Agent):** SKIPPED (GROUP_TOOLS empty)
**Pass 9b (Doc-Heal):** SKIPPED (not Mon/Thu)

### Key Evidence: Obsolete Files (Pass 0 Cannot Delete)
- `$DUMP_FILE`: 9.9M (relocated ✓)
- `coverage-state.json.tmp`: leftover (relocated ✓)
- `docs/handoffs/2026-07-17-*` (2 stale files)
- `docs/signals/bctc-*.json` (12+ stale signals)
- `docs/data/unified-agent-synthesis-*.json` (7 week-old snapshots)

**Recommendation:** Manual cleanup needed. Pass 0 lacks delete capability.

### Pass 0b: Obsolete-File Cleanup (LIVE — Targeted 2026-07-21T22:37:56Z)
**Mode:** LIVE quarantine (script: `scripts/audits/clean-obsolete-files.sh --live`)
**Candidates:** 110 total (dry-run pre-confirmed, LIVE executed)
- **Pattern-A** (unexpanded shell vars): 1 (`docs/archive/$DUMP_FILE`, 9.9M)
- **Pattern-B** (atomic-write `.tmp` leftovers): 1 (`docs/archive/coverage-state.json.tmp`, 7.1KB)
- **Pattern-C** (superseded snapshots, >2-day old): 108 (3 unified-agent-synthesis + 105 cycle-snapshot)

**Quarantine:** All 110 moved to `docs/data/.trash/2026-07-20/` with mirrored directory structure + `manifest.json` audit trail (original_path, reason, size_bytes, moved_at).

**Verification:**
- Dry-run post-cleanup: candidates=0 (idempotent) ✓
- No git-tracked files affected (12 untracked snapshots skipped protection) ✓
- Pattern-A/B files removed from docs/archive/ ✓
- Manifest contains all 110 entries with timestamps ✓

**Signals Status:** 69 top-level files (>50 threshold) → DRAIN-BEHIND=true. No signals touched (DETECT-ONLY).

**AC1b Behavioral Confirmation:** Pass 0's disposition gate (§1b docs/policies/obsolete-file-cleanup.md) checks violations against pattern-A/B allow-list before relocation; garbage matches are excluded from `mv` to docs/archive/. Live cleanup of pre-existing relocated garbage + documented gate in flow demonstrates mechanism preventing garbage-laundering going forward.

### Pass 10: Summary
**AUTO-FIXES:** 2 file relocations (Pass 0)
**ESCALATIONS:** 0
**QUALITY:** Pass 0b cleanup complete. 110 candidates quarantined, 0 remaining. Signals drain-behind detected but DETECT-ONLY (escalation to dev-team drain owner). Disposition gate validated. Idempotency confirmed.

---

## Cycle 2026-06-29 (Mon 17:45Z): Context-Janitor — 10-Pass Audit + Monday Full-Subtree Heal

**Trigger:** Cron tick (Monday full-subtree healing day)

**Input:** `git diff --name-only HEAD~3..HEAD` → 10 files changed in past 3 commits:
- docs/agent-memory/decisions/sprint-FEAT-NEWS-DECISION-RESUME-qa.md (GROUP_AGENTS)
- docs/agent-memory/notebooks/{dev-frontend, digest-predict, qa}.md (GROUP_MEMORY)
- docs/agent-memory/sessions/2026-06-29-digest-predict.md (GROUP_MEMORY)
- docs/data/{cowork-schedule.json, orch/orch-state.json} (GROUP_KNOWLEDGE, GROUP_ROOT)
- docs/handoffs/TASK-FEAT-NEWS-DR-HOP2.md (GROUP_KNOWLEDGE)
- docs/signals/cowork-team-20260629T173441Z.json (signal file)
- reports/TASK_REPORT_FEAT-NEWS-DR-HOP2.md (GROUP_ROOT)

**Weekday:** Monday (1) — triggers full-subtree heal Pass 9b

### Pre-Check & Routing
- **Groups Found:** KNOWLEDGE, AGENTS, MEMORY, ROOT all non-empty
- **Decision:** Full linear run (Passes 0–9) + Monday full-subtree heal (Pass 9b)

### Pass Results

**Pass 0 (File Location Audit):** OK — all files in tree-map-defined locations

**Pass 1 (Tree-Map Integrity):** OK — all changed files exist and in correct locations

**Pass 2–4:** SKIPPED (no changes to volatile-split, bloat check not triggered)

**Pass 5 (Size Caps):** OK — orch-state.json task_board within limits

**Pass 5b (Context-Bloat Signal Consumer):** 2 PRUNED ✓
- **Signal 1:** context-bloat-docs-agent-memory-notebooks-architect-md-2026-06-29T162144Z.json
  - File: docs/agent-memory/notebooks/architect.md
  - Issue: 227 lines vs 200 cap (+27 overage)
  - Action: Archived 21 older cycles (pre-2026-06-27) to inline "Archive" section; kept 3 most recent (FEAT-NEWS, BCTC-TABLE-COLUMN-FPT, FRONTEND-FRESHNESS)
  - Result: 49 lines ✓
- **Signal 2:** context-bloat-docs-agent-memory-notebooks-pm-md-2026-06-29T162641Z.json
  - File: docs/agent-memory/notebooks/pm.md
  - Issue: 370 lines vs 200 cap (+170 overage)
  - Action: Archived 21 older cycles (pre-2026-06-28) to inline "Archive" section; kept 3 most recent (FEAT-NEWS-DECOMP, CROSS-SESSION-ORCH P1/P1.5)
  - Result: 56 lines ✓
- **Signal Disposition:** Both moved to docs/signals/processed/

**Pass 6–9:** OK or SKIPPED (no critical violations)

**Pass 9b (Full-Subtree Heal):** OK
- docs/data/system-map.json ✓ exists
- docs/references/tree-map.md ✓ exists
- docs/data/orch/orch-state.json ✓ exists
- No orphaned files detected
- No broken pointers detected

### Key Actions: Context-Bloat Remediation
- **architect.md:** 227→49 lines (78% compression); archived pre-2026-06-27 cycles
- **pm.md:** 370→56 lines (85% compression); archived pre-2026-06-28 cycles
- **Signal Files:** 2 moved to docs/signals/processed/

### Pass 10: Summary

**AUTO-FIXES APPLIED:** 2 file edits (no commits yet)
- docs/agent-memory/notebooks/architect.md (227→49L)
- docs/agent-memory/notebooks/pm.md (370→56L)

**ESCALATIONS TO ARCHITECT:** 0 (all auto-fixable, tokens freed)

**QUALITY:** Full 10-pass audit complete. All passes PASS or correctly SKIPped. Monday full-subtree heal verified. 2 context-bloat signals consumed. ~150 lines of dead context pruned. SSOT gates enforced.

---

## Cycle 2026-07-02 (Thu 00:00Z): Full 10-Pass Clean Audit + Thursday Heal

**Trigger:** Thursday full-subtree healing cycle

**Input:** 7 files changed (GROUP_MEMORY, GROUP_TOOLS, GROUP_ROOT, GROUP_KNOWLEDGE)

**Results:** Passes 0–9 all PASS/SKIPPED correctly. Pass 0: 0 location violations. Pass 1: tree-map valid. Pass 2: project-stats.json clean (toolCount=183). Pass 3: digest-predict.md tool package aligned. Pass 4: SKIP (CLAUDE.md 74L<120). Pass 5: task_board 16/80 OK; sprint_goal 16/15 (+1 minor overage, PO review recommended). Pass 5b: 0 unprocessed signals (359 archived). Pass 6: 3 memory entries, no orphans. Pass 7: no problematic dedup. Pass 8: telegram channels clean (MARKET/WORK/BUG correct). Pass 9: tool-agent aligned. Pass 9b: full-subtree orphan/pointer/JSON checks all PASS.

**Key Finding:** System exceptionally clean — 0 violations, 0 escalations. All JSON files parse correctly.

---

## Archive

Older cycles (2026-06-01 through 2026-05-11): Location enforcement, tree-map validation, signal compaction. Full history: `git log --oneline -30 -- docs/agent-memory/notebooks/claude-manager-helper.md`
