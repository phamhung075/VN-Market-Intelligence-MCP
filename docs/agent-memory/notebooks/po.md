# PO Notebook

**Cycle:** triage :07 cron (fire 20260526T182326Z) — 2026-05-26T18:26Z.
**Last update:** 2026-05-26T18:26Z
**Status:** Registered active sprint BCTC-LAYOUT-FIRST. Corrected a STALE kickoff signal. RETURN to dispatcher = BATCH(2): architect LF-DESIGN + qa NEWS-INGEST-3 (parallel, WIP-safe).

---

## 2026-05-26T18:26Z — triage :07 (stale-kickoff correction + sprint register)

**Drained signal was STALE.** pendingSignals headline (`po-20260526T181140Z.json`) asked: dispatch ba for LF-BA, with a NOTE that "nobody is driving LF-BA, no peer lock, yours to confirm+register." That premise predates the work — the full chain already landed:
- git: `fb1d5d62` sprint-open → `0be7184b` ba REQ → `6fc7252b` PO-APPROVED LF-BA (18:20Z) → `f31cd6a5` po notebook.
- on-disk: `docs/REQ_BCTC-LAYOUT-FIRST.md` (29KB) + `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md` (has `[BA] LF-BA` + `[PO] LF-BA APPROVAL GATE=APPROVED`); TASKS.md LF-BA=DONE/APPROVED, LF-DESIGN=READY.
- The kickoff said the handoff was "NOT yet written" — it WAS. Re-dispatching ba would redo approved work. REJECTED that path.

**What the NOTE got right:** the prior PO cycle did NOT update `pipeline-state.json` (still said rollout-complete / activeTaskId=NONE) and left no umbrella lock. That part was mine to fix — DONE this cycle.

**Decision 1 — BCTC-LAYOUT-FIRST:** still the right call (mandated root-cause rethink: `generic_md_table_extractor.py` 9 MD-EXTRACT + `text_table_extractor.py` 7 BT fix commits; user-co-authored go-to-build; supersedes BCTC-MD-TABLE). Correct NEXT = **architect LF-DESIGN**, NOT ba. Registered: `activeTaskId=BCTC-LAYOUT-FIRST`, `nextAgent=architect(LF-DESIGN)`. Size = **SPRINT-L** (zone=multi, architect-led pdf-extractor↔mcp-server split + 2 parallel dev tasks). Host risk LOW this tick — LF-DESIGN is design-only (architect writes only `docs/architecture-briefs/`, no code/rebuild/OCR), safe under BCTC churn + OOM-flap. Heavy work (LF-EXTRACT OCR, LF-DEPLOY rebuild) gated behind LF-DESIGN — not dispatched now.

**Decision 2 — NEWS-INGEST-3 (qa):** DISPATCH this tick. HIGH reliability tier; gates an already-shipped fix (NEWS-INGEST-2 cursor `9711ca72` deployed + -2b `e1e08a29` live VN surface, ops-confirmed). TASKS.md held it for "next triage tick" — this is that tick. qa-lane verification (deterministic cursor test + direct market.db reads + /api/news-fetch/live probe); no rebuild, no batch sweep → light host load, no contention with architect LF-DESIGN.

**WIP:** 0/2 before tick. LF-DESIGN=architect design-lane (no dev/pilot WIP slot); NEWS-INGEST-3=qa lane. Two non-dev lanes → WIP≤2 respected. Order: NEWS-INGEST-3 first (close-out), LF-DESIGN parallel.

**Not actionable:** cowork-fires 17:33/17:48/18:03/18:18Z = expected-silent off-hours heartbeats (VN closed, next fan-out ~20:00Z). context-bloat-docs-TASKS-md-* = PostToolUse size-cap hook noise from this session's own commits → janitor lane, not dev CODE.

**Files modified (UNSTAGED for dispatcher commit-mutex):** `docs/pipeline-state.json` (registered active sprint + footer), `docs/TASKS.md` (NEWS-INGEST-3 row → DISPATCHED), `docs/signals/po-20260526T182658Z.json` (verdict), this notebook. Did NOT touch pre-existing dirty tree (`.claude/agents/*`, `apps/api-gateway/sandbox/traces/*`) nor any `pilot-status-*.json`. Did NOT git-stage.

---

## Carry-over

- **BCTC-LAYOUT-FIRST ACTIVE.** Next inbound = architect LF-DESIGN brief → docs/architecture-briefs/. After that returns, my next gate is to verify the brief resolves the 3 architect-open Qs (zone+md schema vs `bctc_table_rows` collision; exact pdf-extractor↔mcp-server boundary JSON contract; quarantined-unit storage for QA direct-DB count) and splits zone=multi cleanly before LF-EXTRACT‖LF-OVERLAY dispatch. Done-bar = Decision F (Tier-3 invariants PASS over 18-doc corpus via DIRECT market.db, NOT endpoint; + USER verbal G9; no false-greens — 5 prior).
- **NEWS-INGEST-3** out for qa. On qa APPROVE → NEWS-INGEST-CLOSE (my PO sign-off gate). On CHANGES_REQUESTED → NEWS-INGEST-FIX (fixer).
- **Open non-blocking maintenance** (NOT to dispatch under BCTC churn/OOM-flap unless lanes idle): MACRO-VNINDEX-DATA-GAP (dev-macro-indicators); SSOT stale-stat refresh (project-stats.json cronJobCount/testBaselinePass, system-map.json toolCount 125→146); DRIFT-2 kinh-dich endpoint wiring (Go pilot); architect risk flags from frontend close (macro body-contract test gap; mcp-server clients.ts signals type); DRIFT-3 image-SHA-drift guard (architect design-lane).
- **Host reality:** 16GB Mac / Docker 8GB cap, kernel-panic-prone under swap; a parallel BCTC session commits on main ~every 10 min. Keep heavy/contended dispatch serialized; design + qa-read lanes are safe.
- **Discipline reminder:** explicit-file staging only; notebooks commit separately; subagents leave files unstaged; never re-dispatch DONE+APPROVED work — verify git+on-disk state before acting on a kickoff signal (this cycle's lesson).
