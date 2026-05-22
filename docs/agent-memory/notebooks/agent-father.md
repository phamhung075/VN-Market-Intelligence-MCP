# Agent Father — Notebook

## c252 · 2026-05-22T08:30Z

**Sprint:** 1968d | **Tasks:** P01 (handoff-delta-read SKILL) + P02 (notebook-write diff-write)

**P01 — handoff-delta-read SKILL created:**
`.claude/skills/handoff-delta-read/SKILL.md` (77L ≤80L AC-1 PASS).
§N-slug anchor convention. Delta-read algo: seek last_read_anchor → read from that line to EOF.
Full-read fallback: anchor null OR last_read_at >24h. Backward compat: no §N anchors → full-read silently.
Flows updated: qa/main.md (Step 0c), developer/main.md (Step 0c), fixer/main.md (Step 0c).
HANDOFF_DELTA field added to all RETURN blocks. Smoke test PASS: delta = 7.6% of full (target ≤30%).

**P02 — notebook-write SKILL refactored:**
`.claude/skills/notebook-write/SKILL.md` (69L) — full-overwrite → section-overwrite.
c<NNN> · ISO-ts anchor format. 3-cycle retention (keep c<N>, c<N-1>, c<N-2>). Prune c<N-3>+ via Edit.
Blank-state: one-time Write if no ## c<NNN> heading. ≤200L file bound.
Smoke test PASS: 3-cycle sim (c101/c102/c103 pass, c98+c99 pruned, 44L ≤200L).
Dogfood: this notebook entry IS the blank-state init for agent-father notebook.

**Signals emitted:** agent-father-1968d-P01-ready.json, agent-father-1968d-P02-ready.json → NEXT=qa

**AC checks P01:** AC-1 PASS (≤80L, §N-slug, algo, fallback), AC-2 PASS (qa Step 0c), AC-3 PASS (dev Step 0c), AC-4 PASS (silent fallback documented), AC-5 PASS (no apps/ touch)
**AC checks P02:** AC-1 PASS (c<NNN>·ts format), AC-2 PASS (3-cycle retention), AC-3 PASS (Edit pattern documented), AC-4 PASS (blank-state Write), AC-5 PASS (≤200L bound + trim note)

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification
- 1968c-P01/P02: await qa ratification (AC-6..8 pending)
- 1968d-P01/P02: await qa APPROVED (signals emitted, NEXT=qa)
- Wave 2 P03 (zone-caveman-dict): gated on P01+P02 QA APPROVED
