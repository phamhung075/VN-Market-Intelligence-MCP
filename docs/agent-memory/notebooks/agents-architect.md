# agents-architect — Notebook

## 2026-05-12T21:52:40Z

**Brief:** `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`

Unified RCA for HEAD.lock 5-cycle recurrence (c52–c56): c56 single-process evidence invalidates worktree-only hypothesis; 4 prioritized hypotheses (H1 rapid sequential git commit racing on HEAD.lock most likely, H2 hook crash after lock acquisition secondary); diagnostic plan requires GIT_TRACE probe + `--no-verify` test before code fix; worktree orphan (Issue B) is a separate SDK at-exit gap with independent fix path; 7 c57+ tasks proposed (T1–T2 investigation gates T3–T4 fix, T5–T6 worktree gc independent).

**Signal dropped:** `docs/signals/2026-05-12T215240Z-brief-complete-headlock-rca.json` → po

---

## 2026-05-12T18:38:54Z

**Brief:** `docs/architecture-briefs/2026-05-12-dev-zone-enforcement-and-split-policy.md`

Zone enforcement gap identified: 9 dev-* specialists are correctly wired but remain idle because FIX path bypasses zone assignment and Tier 3 fires silently with no feedback loop to PO; Wave 1 closes the loop (5 flow edits, new `zone_missing_tier3` signal type), Wave 2 splits 67 oversize files across 4 classes with agent-father owning 43 and claude-manager-helper owning 24.

**Signal dropped:** `docs/signals/agents-architect-2026-05-12T18-38-54Z-zone-enforcement-split-policy.json` → agent-father

---

## 2026-05-12T07:54:26Z

**Brief:** `docs/architecture-briefs/2026-05-12-flow-split-waterfall.md`

16 flow files audited (1,987 total lines); 4 flows identified as split candidates (dev-team 340L, po 215L, pm 107L, market-analyst 105L); Phase 1 targets dev-team/po/market-analyst for ~40-50% flow-context token reduction; implementation gated on 3 user open questions (task-type detection mechanism, shared preamble placement, sub-flow path convention).

**Signal dropped:** `docs/signals/flow-split-waterfall.json` → agent-father

---

## 2026-05-11T20:39:59Z

**Brief:** `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md`

Signal dedup moves from O(N) full-dir scan of `processed/*.json` to O(log N) SQLite `SELECT` against a dedicated `signals.db`; five tasks (T1 schema → T2 backfill → T3 drain rewrite, then T4+T5 in parallel) handed to agent-father for implementation.

**Signal dropped:** `docs/signals/agents-architect-2026-05-11T20-39-59Z-signal-dedup-sqlite.json` → agent-father

---

## 2026-05-11T16:32:08Z

**Brief:** `docs/architecture-briefs/2026-05-17-commit-convention-audit.md`

Designed Day-7 commit-convention audit with four concrete pass thresholds (C1 ≥90% header format, C2 ≥85% Task trailer, C3 ≥80% AC trailer, C4 ≥95% scope vocab), specifying a shell script at `scripts/audits/commit-convention-audit.sh` that emits a JSON verdict and auto-drops greenlight signal to agent-father for C1+C2 collapse on PASS.

**Signal dropped:** `docs/signals/agents-architect-2026-05-11T16-32-08Z-phase-b-c1-c2-audit-design.json` → agent-father
