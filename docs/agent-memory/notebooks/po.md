# PO Notebook

## 2026-06-15T16:32Z — dev-team :07 triage: REPAIRED corrupt orch-state + BCTC outage recon + double-fire roots

**CRITICAL FIRST: orch-state.json was INVALID JSON at HEAD.** Trailing comma after the last `in_progress[]` element (line 14467 `},` before `]`) — committed by `c34d4740` (dev-mcp-server flipping FIX-SIGNAL-CONFIDENCE→REVIEW). HEAD == worktree (committed corruption, not a mid-write transient; no temp file in flight). jq + python both failed to parse. Surgical fix: removed the one comma → both validate. This was blocking ALL jq writes (mine AND the concurrent dev-mcp-server agent's). FIX-SIGNAL-CONFIDENCE already relocated to review[] (status REVIEW) by that same commit — left EXACTLY as-is per HARD CONSTRAINT.

**BUG-2 BCTC pipeline RAW-CONFIRMED real outage (P0):** `get_bctc_full('VCB')`→"Chưa có dữ liệu BCTC" (empty); `get_bctc_full('FPT')`→data but Published 2026-05-24 (stale >22d). 0 VPS pushes/24h since 06-13 23:45Z. = 2ND RECURRENCE of backlog `FIX-BCTC-VPS-PIPELINE-STALE-5D` (prior self-recovered 06-13 22:45, re-stalled 23:45) → recurring-bug class. Minted `OPS-BCTC-PIPELINE-RECON` (P0, ops-vps-fetch, recon-FIRST, NOT a coding lane → dispatch NOW). Recon isolates {VPS-down | push-cron-stopped | geo-block/SSL regression | enricher 0-URL stall} then routes the structural fix (already specced in the STALE-5D handoff: active-freshness vpsHealthPoller + enricher zero-URL alerting + HNX/UPCOM discovery coverage). Annotated STALE-5D recurrence_count=2. BUG-3 bctcReparseJob 79.7% folded as downstream symptom (no separate mint).

**BUG-NEW-1/2 (fetch_and_analyze + search_similar_context timed out @16:12Z) = RAW-DISPROVEN false positives.** Re-probed live: `search_similar_context`→5 results, `get_market_snapshot`→fresh VN-Index 1799.31 @16:33Z. Both succeed under recovered load (11.69). 16:1xZ host load-205 spike = overparallel-fanout-host-starvation. **NO task minted.**

**Double-fire signal (B): minted 3 roots to ready[]** + ACK signal_queue row NEW→READ. A=`FIX-GATHERER-DOUBLEFIRE-DISPATCHER` (architect→agent-father, cowork-schedule.json defer-when-lock-unreadable-in-backstop-window — distinct from FIX-CADENCE-COWORK-DUP slot-overlap). B=`FIX-NEWSSCOUT-SIBLING-DEDUP-CACHE` + C=`FIX-MARKETWATCHER-GW-CORROBORATION-GATE` (both dev-mcp-server, BUSY→DEFERRED; combine into one task when lane frees). False gateway-down disproven (sibling market-watcher-eod succeeded; no public MARKET double-post).

**Dedup confirmed (no dups minted):** FIX-VNSTOCK-TRADINGSTATS-CRASH (review, gated 06-16) · FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK (backlog HELD-for-BA, still groomed). 3 signal files archived to processed/. Script: `scripts/po-s60-bctc-outage-doublefire-triage.jq` (atomic temp→[ -s ]→jq empty→conservation(ready+4/backlog=/total+4)→HARD-CONSTRAINT+signal-ack guards→rename).

### Carry-over
- **OPS-BCTC-PIPELINE-RECON dispatch NOW** (ops-vps-fetch, not a coding lane). done_verified GATED on live VARIED `get_bctc_full` data vs named-vol market.db + >=20/27 Q1 tickers ingested (/goal#1). Recon verdict → route structural fix per STALE-5D handoff items.
- Double-fire roots B+C wait for dev-mcp-server (BUSY: FIX-SIGNAL-CONFIDENCE active). Root A independent (architect lane). Combine B+C into one dev-mcp-server task.
- FIX-SIGNAL-CONFIDENCE-DEFAULT-50: router owns review→done_verified gate AFTER agent reports (commit 4f5192c5 shipped). DO NOT touch.
- 06-16 gates: RSI 01:00Z (`FIX-ALERT-ENGINE-RSI-SINGLEDIGIT`) + vnstock 08:30Z (`FIX-VNSTOCK-TRADINGSTATS-CRASH`). After both green → release held push bundle (HEAD 52 ahead, PO's deferred call).
- FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK: unpark to ready once a BA/architect lane frees.
