# PO Notebook

_Last: 2026-07-14T21:01Z (triage + BOUNDED-1 groom-promote; dev-team router holds SF-1, coordination_session 69b0312e)_

## Tick 2026-07-14T21:01Z — triage + rank-1 groom → ready (board was IDLE, ready=0)
FIX-DAILY-FF CLOSED done_verified (CI GREEN on pushed head e9b9fba6b); freeze LIFTED; board idle. Promoted exactly ONE rank-1 row so dev-team BOUNDED-1 (WIP<=1) has pickable work.
- **TRIAGE (+2 backlog 392→394):** both new rows ALREADY well-formed by prior PO session (e417ef1f) — `FU-DEV-CAFEF-1` (SPRINT-S, apps/news-fetch/, next_agent=architect, user-greenlit DECISION-2) + `FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE` (P2, PLAN-ONLY, PO-owned, tnb c109). No re-mint. TNB c109 handoff already ACK'd (20:41Z). signal_queue empty.
- **PROMOTED (1):** ran canonical `scripts/devteam-backlog-promote-bounded1.jq | orch-apply.sh` (Zod Stage0+1 + conservation 563=563 PASS). Picked **ALPHA-S2-TICK-DOWNSAMPLE-5MIN** (P1, zone=multi→architect-splits, owner=developer, depends:[], supervised:false). backlog 394→393, ready 0→1.
  - Rank-1 = P1 because ALL 5 P0 correctly gated OUT: 3 FACTORY-* (detail-level depends_on on layering-fix/helpers NOT done_verified → depends-blind); FIX-ORPHAN-ADOPTION (supervised+plan_only); SPRINT-CCATO (supervised). Script fell through to lowest-idx eligible P1.
  - CLEAN: user-AUTHORIZED (DECISION-1 flow-alpha FULL launch — "Do NOT re-park"; MEMORY "waves2+ parked" is STALE/superseded), git-clean (0 apps/ dirty), not status-divergent (not in review/in_progress), dev-owned, time-CRITICAL (ARCHIVE-NOW: irreplaceable intraday ticks lost every day of delay).
- **CARRY-OVER SIGNALS (async):** FPT routine (`bctc_signal_FPT_20260714_routine`, FAIR/no-esc4-5/byte-identical 8 cycles) → ACK'd to processed/; covered by ROUTE-BCTC-FPT-Q1-2026-ROUTINE. digest-predict Bash-grant → already DENIED (DECISION-4), routed to SPRINT-CCATO (P0, supervised). BCTC serve-layer gap → bctc-analyst-owned (FPT esc3 DATA-COVERAGE-LIMITED corroborates); no re-mint. PEK per-page-latency → subsumed by FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT.
- **PDF-extractor:** FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT left UNTOUCHED — stays PLAN-ONLY, owner=po, in review[], NOT closed (reflow FAILED-PATHOLOGICAL; awaits triage→dev-pdf-extractor for root-cause perf fix; never close on a pek report).

## Standing method (survives rotation)
- **Rank-band groom:** run the CANONICAL `devteam-backlog-promote-bounded1.jq` (codifies all pick-time gates: supervised/epic/deps/deferred/non-dev-owner/plan_only/next_agent) rather than hand-picking — deterministic + idempotent (WIP>=1 no-op, CAS-guarded). ALWAYS dry-run first, then RECONCILE its FIFO-within-band pick against live decision-journal (not stale MEMORY) before applying.
- **Verify raw, not labels:** a P1 rank label masked a BLOCKED status (FIX-BCTC-BANK-SUMMARY-MAPPING blocked on user-gated ops deploy); a rich baseline_pass AC does not make a row pickable. RAW-read board `.status` + `.supervised` + detail `depends_on`.
- **Board writes:** ONE atomic `jq … | bash scripts/orch-apply.sh`; `.head` never touched; commit explicit-pathspec only (never sweep the ~106 dirty peer files); router locks untouched.

## Carry-over
- **NEXT (dev-team):** pick ALPHA-S2-TICK-DOWNSAMPLE-5MIN from ready[] → architect splits multi-zone → dev implements the 5-min tick archive-now job. Still-stale P1 `FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK` (6d, 14+ cycles, mcp-call.sh on-disk-unwired) awaits supervised bounded-1 promote.
- **pendingObservation:** FIX-CHEF-EVENING-DUP confirm gated on MCP-restore (tnb c110); FIX-PDFEXTRACTOR root-cause perf fix needs eventual triage→dev-pdf-extractor (do NOT close on pek reports).
