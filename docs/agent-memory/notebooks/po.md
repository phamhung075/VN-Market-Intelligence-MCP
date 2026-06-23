# PO Notebook

_Last: 2026-06-23T17:27:00Z_

## This cycle — S2 DATA-HONESTY thread kickoff (user-approved; RAW-verified live)
Opened the approved real-data-only thread. RAW-probed all 4 items BEFORE tasking — 2 confirmed, 2 dropped.

CONFIRMED (tasked):
- **FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION** (P1, ready LEAD, dev-mcp-server). Live named-vol /app/data/market.db (bun:sqlite): agent_signals confidence_score = 3316/3874 (86%) at literal 50; ALL recent verified_decision rows (dashboard SIGNALS dominant type) = 50, incl today 16:32Z. Prior FIX-SIGNAL-CONFIDENCE-DEFAULT-50 (done_verified on GREEN BUILD) only wired finding_data.confidence-carrying producers (agentSignalTools.ts:302-307); verified_decision producer supplies none → COLUMN DEFAULT 50 (agentSignalStore.ts:341 + schema-news.ts:104). REOPENED — plausibility-check gap (done_verified ≠ live-varied). Also harden read-fallback stockSignalsHandler.ts:224 `?? 50` → explicit unknown.
- **FIX-MACRO-SNAPSHOT-DELTAS-NULL** (P2, ready, dev-macro-indicators). promoted backlog→ready. get_macro_snapshot LIVE 17:25Z: oil/gold/usdVndDelta=null, direction=unknown; vnIndexDelta=11.13 up. By-design gap (dtos.go L120-129, no prev-session persist). Fully specced.

DROPPED (RAW evidence):
- conviction `=0.5` → convictionScorer.ts 0.5 are all documented neutral-fallbacks for genuinely-MISSING inputs (L34/169/179/192/252...), NOT a mask of computed data. NO task.
- source-confidence `1.0` → finalizeBctcRefine/bctcCorrectionService source_confidence=1.0 is CORRECT semantics for human-confirmed BCTC corrections (100% confident by definition). NO task.

DoD (the real bar): live VARIED real values vs named-vol DB / live tool — NOT green build. done_verified WITHHELD on both until a live probe shows non-constant confidence + signed non-null oil/gold/fx deltas.

Mechanics: S2 sprint goal authored; head→lead→ba; ba→architect→pm→dev-{mcp-server,macro-indicators}→qa per zone. Script scripts/po-s111-s2-data-honesty-kickoff.jq (idempotent, conservation-guarded +1 mint, re-run delta 0). Committed 6fffe612.

## Carry-over
- S2 lead dispatched: head=FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION in_progress/next_agent=ba. Router to spawn ba (apps/mcp-server). Macro-delta queued ready[1] (dev-macro-indicators) behind it.
- Both fixes rebuild_required:true — ops rebuild + LIVE re-probe gates done_verified, NOT tests.
- Stale head was pointing at FIX-DB-INTEGRITY-TRAIL-GITRESET-DATALOSS (in_progress empty) — repointed at S2 lead this cycle.
- PRED-RESOLVER-GAP-FIX (prior cycle) — verify if a recurrence signal surfaces.
