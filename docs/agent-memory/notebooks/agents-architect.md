# agents-architect — Notebook

## 2026-06-03T20:45:01Z

**Brief:** `docs/architecture-briefs/2026-06-03-esc3-data-coverage-guard.md`

ESC-3 false-escalation loop (16 cycles, FPT Q1-2026): bctc-analyst fired Opus deep-dive for OCF/NI divergence every cycle because the 24h guard TTL matches cycle cadence and deep-dive-opus.md releases the guard unconditionally. Root cause is ESC-3 gate has zero quarters-coverage awareness — fires on divergence_ratio>0.40 alone regardless of whether historical data exists. Fix: add `quarters_returned<4` coverage pre-flight to ESC-3 in main.md; insert DATA-COVERAGE-LIMITED handler (guard_key=esc-datacov:..., ttl_seconds=2592000/30d, route ops once); update deep-dive-opus.md ESC-3 step 1 to early-exit + no task_release when coverage-limited. 2-file edit for agent-father.

**Signal dropped:** `docs/signals/esc3-data-coverage-guard-20260603T204501Z.json` → agent-father

---

## 2026-06-04T05:03:42Z

**Brief:** `docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md`

Extracted 6 reusable rapid-analysis skills from Bàn tròn kinh tế 31 transcript (Trung/Thành/Báu): T-1 market-cap-first entry, T-2 balance-sheet-first read, T-3 valuation vs. own 10yr history, T-4 four-factor synthesis (tài chính/định giá/quản trị/mô hình kinh doanh) + 4-scenario matrix, T-5 price-earnings sync type, T-6 ownership structure screen, T-7 management track record, T-8 insider transaction signal, T-9 abnormal turnover ratio, T-10 corporate history pattern, T-11 IR transparency quality, T-12 method self-alignment, T-13 scuttlebutt, T-14 exec compensation ratio. Mapped to 6 skill files (rapid-market-cap-screen, balance-sheet-first-read, four-factor-synthesis, ownership-governance-screen, management-track-record, value-trap-avoidance) and 6 flow-file edits across market-watcher/bctc-analyst/chef/news-scout/tnb-methodology. Reconciled with existing TNB 6-layer: 4 new skills, 2 TNB enhancements; no duplication. Skills are pre-TNB rapid screen gate (Scenario 4 = hard skip before deep analysis).

**Signal dropped:** `docs/signals/expert-rapid-analysis-skills-20260604T050342Z.json` → agent-father

---

## 2026-06-05T16:31:02Z

**Brief:** `docs/architecture-briefs/2026-06-05-agent-decision-journal.md`

Decision Journal (sprint footprint) cross-cutting protocol: per-sprint accumulator at `docs/agent-memory/decisions/sprint-<id>.md`; shared `.claude/skills/decision-journal/SKILL.md` (create + inject via cowork-end-cycle); terminal-only rule (reasoning/WHY → journal, terminal → RETURN+caveman). Entry format: 12L STEP block (what-done/what-considered/why-decision/why-change). 600L sprint cap, archive on sprint-close. Clear boundary: journal=WHY-trail, notebook=cross-cycle-memory, handoff=role-payload. 7 files to create/edit for agent-father — no operator greenlight needed.

**Signal dropped:** `docs/signals/agent-decision-journal-20260605T163102Z.json` → agent-father

---

## 2026-06-05T16:37:44Z

**Brief:** `docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md`

EMIT-DARK-RECURRING: H1 (stale session) + H3 (early-exit) both ruled out by post-fix telemetry evidence. H2 CONFIRMED — Steps 4.7+4.8 are agent-interpreted prose with fail-safe semantics; LLM agent narrates and skips, producing zero disk output while proceeding to spawn. Code fix required (not operator action): anchor pressure-state write to telemetry.md Step 6 (observable mandatory artifact) + optional pre-dispatch shell script for pure-bash fields. Priority: low (legacy cadence safe).

**Signal dropped:** `docs/signals/emit-dark-root-cause-20260605T163744Z.json` → agent-father
