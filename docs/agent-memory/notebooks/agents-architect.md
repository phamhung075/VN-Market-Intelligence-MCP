# agents-architect — Notebook

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

**Brief:** `docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md` (v1)

EMIT-DARK-RECURRING: H1 (stale session) + H3 (early-exit) both ruled out by post-fix telemetry evidence. H2 CONFIRMED — Steps 4.7+4.8 are agent-interpreted prose with fail-safe semantics; LLM agent narrates and skips, producing zero disk output while proceeding to spawn. Code fix required (not operator action): anchor pressure-state write to telemetry.md Step 6 (observable mandatory artifact) + optional pre-dispatch shell script for pure-bash fields. Priority: low (legacy cadence safe).

**Signal dropped:** `docs/signals/emit-dark-root-cause-20260605T163744Z.json` → agent-father

---

## 2026-06-05T18:09:00Z

**Brief:** `docs/architecture-briefs/2026-06-05-emit-dark-root-cause.md` (v2 — DEFINITIVE, supersedes v1 + Option B)

Option B (d6738df3) live-falsified: 18:01:29Z FIRE wrote signal JSON with resolved placeholder values but pressure-state.json still absent. Smoking gun: `"matched_slots": ["bctc-analyst-slot-2"]` in live signal vs literal `[<slot_ids from MATCHES>]` in telemetry.md template — proves LLM never ran bash, only narrated. Corrected root cause: cowork dispatcher is a pure narration engine; bash fences are never executed; LLM writes the signal file via Write-tool using in-context values and skips the pressure-state heredoc because its inputs (signal_backlog/dev_queue_depth/host_headroom_mb) require real shell. Three code fixes all failed same class. Fix: Option C — add emit_pressure_state MCP tool (server-side shell computation + atomic file write); replace bash fence in telemetry.md with call_tool instruction (LLM demonstrably executes call_tool). Option E (retirement) documented as contingency only.

**Signals dropped:** `docs/signals/emit-dark-option-c-20260605T180900Z.json` → developer; `docs/signals/emit-dark-telemetry-patch-20260605T180900Z.json` → agent-father (gated on tool deploy)
