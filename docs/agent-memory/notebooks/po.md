# PO Notebook

## c · 2026-06-08T15:25Z — Triage tick: macro DONE, pdf-extractor re-ingest ACTIVATE, NB-trim dedup

**Trigger:** dev-team cron Step-1 triage — 19 signals drained + 1 new auditor Tier-2 report (id3100).

**Signals (19):** 8 cowork-fire dispatcher heartbeats (low, to=dev-team) + 2 routine bctc_signal (FPT/BATCH) → log+skip (not PO dev work). 7 context-bloat NB-over-cap → DEDUP into 1 CLEAN task. TNB c90 already ACK'd 2026-06-07T21:25 — no re-action.

**Live raw-verify (router-verify-raw, not badges):** docker ps = ALL 8 containers HEALTHY incl pdf-extractor Up7h + macro-indicators Up16h. get_macro_snapshot RAW: carry computedAt 15:25:47Z, fedFundsRate 3.62 (NOT stale 5.33), is_estimate=false, tier=2. F-FED-RATE-REGRESSION did NOT recur weekday.

**Decisions (3 board mutations, atomic temp→rename, mutex-guarded):**
- FIX-MACRO-REFRESH-DEAD → **DONE** (raw-verified fresh; b7ce338f live + rebuilt; C-09 718h-stale CLOSED).
- FIX-PDF-EXTRACTOR-UNHEALTHY → **IN_PROGRESS** re-scoped: health blocker MOOT (A20-async-to-thread DONE + cgroup cpus2.0 → Up7h healthy). Residual = DATA-INGEST only (re-queue 26 stale BCTC + 22-filing Q1-2026 batch). Auditor id3100 "BCTC stale 38.5h + 26 pending >72h" maps HERE (dedup, no new task). Owner dev-pdf-extractor, zone apps/pdf-extractor/, high.
- CLEAN-NB-TRIM-PDFX → **CLEAN-NB-TRIM-BATCH** (qa, cross-service/): 5 over-cap NBs (rag-service 297L, mcp-server 223L, architect 223L, pdf-extractor 218L, vps-crawls 228L) — folds all 7 bloat signals.

**Skipped/structural:** SBV_FX 53min + vn-sbv-fetch unhealthy = VPS cron (no container in docker ps), carry tier-2 served fresh → non-critical, no MARKET risk. Report 3100 processed resolution=monitoring.

**Carry-over:** WIP-active was 0 task-level (in_progress[]) → headroom OK; now 1 active (pdf-extractor re-ingest). NEXT tick: (1) verify pdf-extractor drained 26→0 + financial_reports rows exist; (2) CLEAN-NB-TRIM-BATCH → qa; (3) Monday chef dish Fed-rate confirm 3.62 holds weekday. Fresh auditor rows (2 concurrent passes this tick) picked up next tick.

## c · 2026-06-08T13:31Z — DFR-P2/P3 SSOT dedup + briefs APPROVED → ba

**Trigger:** Directed gate. Architect delivered P2/P3 blueprints. Fix SSOT dual-location + approve briefs + route ba.

**SSOT dedup (DJ-GATE-1, verify-raw):** active_sprints[23] (id=DEEPFETCH-RAG-REDESIGN) = AUTHORITATIVE (TODO/next_role=ba/blueprint refs); backlog[69]/[70] = STALE (next_role=architect). Atomic jq temp→rename, guards (non-empty + valid-JSON before mv). Deleted ONLY 2 backlog copies via `(.id∈{P2,P3} and next_role=="architect")|not`. **Post-write raw:** each DFR-P2/P3 EXACTLY ONCE (both @ active_sprints[23]); backlog 71→69; 11 distinct DFR ids intact (9 others untouched). Committed clean **93c0fc70**.

**Briefs APPROVED (read both; committed c0c894f7):**
- P2 (478L): 3-zone split + interface contracts A/B/C + state machine + 10 ACs. Guardrails all covered: caps 10/5, 4h expiry, source_url UNIQUE+INSERT-OR-IGNORE, NO silent delete (_deep suffix), VPS plain-HTTP, Playwright main-only, no hardcode (sector kw=system-map, caps=mcp.config), no branches.
- P3 (306L): FTS 2-call + RRF; LAZY-on-first + daily-rebuild (not startup=probe race / not on-write=O(corpus)); thin mcp-server hybrid?:bool opt-in. 8 ACs.
- Both kept TODO/next_role=ba.

**Sequencing on tasks (PM honor):** P2+P3 rag-service fully PARALLEL. Only mcp-server slices share ragHttpClient.ts (P2=ragIndex write block, P3=RagSearchRequest read block). **Sequence dev-mcp-server P3 slice AFTER P2 slice merges, OR commit-mutex-serialize.** rag-service P3 has NO P2 dep. Stored: `sequencing`(both) + `sequence_after`(P3) + `blocks`(P2).

**Router → dispatch BA** (decompose P2+P3 from blueprints). PO no nested-spawn.

**Carry-over:**
- Flow: ba → pm → dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} → qa. PM enforce P3-mcp-after-P2-mcp.
- QA P2: caps/daily-limits/4h-expiry actually ENFORCED + upsert-no-delete. QA P3: .vector().text() pattern + non-hybrid byte-identical.
- (prior) A20: /health=200 ≥15min under /extract before DONE. FIX-MACRO-REFRESH-DEAD: verify live refresh (fix b7ce338f) then PM DONE.
