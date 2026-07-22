# PO Notebook

_Last: 2026-07-22T15:56Z (dev-team :37 triage, WIP=2/2 — 1 signal DEDUP'd, 1 perf spin-off minted, 8d review row dispositioned, market_messages RE-VERIFY closed; all via orch-apply)_

## Tick 2026-07-22T15:56Z — bctc-esc5 dedup + pek-perf mint + market_messages resolved

**★ 1 NEW signal_queue row → triaged (0 NEW po remaining):**
- `cowork-…bctc-esc5-report-id-gap` MEDIUM (bctc-analyst flow step 5d structurally unexecutable ~30 cycles: get_bctc_full needs report_id but nothing surfaces one by ticker+period → ESC-5 is a silently-dark escalation).
- **DEDUP — NOT re-minted.** Signal's "no prior art" was a missing board-grep. Prior art existed: backlog **BCTC-REPORT-ID-LOOKUP-TOOL** (same root cause). ENRICHED it: title now names ESC-5 step-5d, priority **MED→HIGH** (dark escalation = reliability gap; feedback_agent_reported_limitation_may_be_structural + recurring-failed-fix >2), added `origin_signal_id` back-ref. Signal closed status→triaged (stops resurfacing; flips →RESOLVED when covering row done_verified).

**★ market_messages RE-VERIFY (S4 carry-over) → CLOSED, no escalation.** Market data plane RAW-verified alive+fresh (VN-Index 1668.53 -3.58%, breadth 2026-07-22, turnover 23405bn). Auditor CRITICAL "market_messages=0/3h" fired 15:00Z=22:00 ICT OFF-MARKET — already board-tracked as **FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE** (market-hours-blind FP). "Still 0 during market hours" condition NOT met.

**★ MINTED PERF-PEK-PER-PAGE-LATENCY** (backlog, high, zone apps/pdf-extractor/) — orphaned perf escalation documented in the FIX-PDFEXTRACTOR review row's `perf_escalation` field but never board-minted. Root: CPU PaddleOCR 30-40min/page (33pp = ~18-25h), no page-checkpoint/resume across restarts → HPG Q4-2025 (918a7abd) never written back after 21h.

**★ FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT (8d in review) dispositioned** — added `po_disposition`: the timeout FIX itself is DEPLOYED (ab7db8a7fb8a) + qa APPROVED (568e3b404) + async-reroute VERIFIED firing; closure decoupled from the failed HPG reflow (now carried by PERF-PEK) → routes done_verified to dev-team/qa. No force-close (prior "do not close on this report" note honored).

**Telegram 20-new / 271-unresolved:** all 07-19 BCTC-1345b low-conf + reconcile-exhausted notifications — covered by FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE. No new work.

orch-apply: 1 clean write (4 mutations atomic), task 595→596, signal_total 100 unchanged, conservation OK.

## Carry-over
- WIP=2/2 (DESIGN-COWORK-FANOUT pm + FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD) — nothing promotes; all mints await a freed slot (BOUNDED-1/RLC).
- BCTC-REPORT-ID-LOOKUP-TOOL now HIGH (was MED) — top bctc tooling gap; unblocks ESC-5 + 3 get_bctc_* tools once shipped.
- PERF-PEK-PER-PAGE-LATENCY (high) — dev-pdf-extractor: page-checkpoint/resume + async worker decouple; re-verify closes HPG Q4-2025 918a7abd (net_revenue -1264.66 → positive).
- rag-service 99.46% mem @15:07Z + mcp-server OOM restart count=2: known tight-margin / FIX-MCP-MEMORY-CODE-LEAK; ops-lane, user-gated. RAG-FTS-BUILD-MEMORY-BOUND correctly TIME-GATED (corpus repopulation).
- backlog=423 (bloated); review=23. Discipline: dedup-first, no re-mint churn.
