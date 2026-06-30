# Decision Journal — Sprint TA-CONSUMER-STALE-INDICATORS · po

**Sprint goal:** After the OHLCV-depth epic shipped (data layer DONE+DURABLE), momentum/gauge indicator cards STILL serve honest-NULL — for a NEW root cause in the TA consumer layer (TA Go svc port 5003 serving stale/split-mismatched data + absent VN-Index benchmark), NOT depth. Triage into the right board task(s).
**Agent:** po
**Started:** 2026-06-30T18:12:20Z

---

### STEP po-S1 · po · 2026-06-30T18:12:28Z
**task-id:** OPS-TA-INDICATOR-STALE-DIAGNOSTIC
**what-done:** Minted a cheap-first diagnostic gate to ready[] (ops): single-svc restart technical-analysis (port 5003) then re-probe the 3 momentum tools + get_technical_indicators VCB price vs get_price_history VCB.
**what-considered:**
- Skip diagnostic, mint the data-source fix directly — REJECTED: RC1 (svc not restarted after backfill → stale in-memory cache) is a free 5-min test that may resolve everything; committing dev effort first wastes it.
- Mint as a SPIKE (findings doc, no row) — REJECTED: a gate needs a CLAIMABLE board row (strand-lesson project_deferred_task_scheduler), and the restart is an ops ACTION not a recon question.
**why-decision:** Cheapest disambiguator must run FIRST and gate the expensive fixes; only ops can restart, so it owns the diagnostic.
**why-change:** no change from plan.

### STEP po-S2 · po · 2026-06-30T18:12:28Z
**task-id:** FIX-TA-SVC-STALE-SPLIT-DATA-SOURCE
**what-done:** Minted to backlog[] (dev-technical-analysis, apps/technical-analysis/), HELD on the diagnostic — covers RC2 (split-mismatch: VCB 88k vs daily_ohlcv 62.2k; FPT low_52w=100.3 vs high_52w=99700) + RC4 (data_gap_too_large non-contiguous bars).
**what-considered:**
- Re-use existing FIX-TA-INDICATORS-TIER3-ROUTING as the anchor — its ALL-N/A premise EVOLVED post depth-fix to stale-VALUE; annotated+folded it (M4) instead of duping.
- zone=multi for architect split — set apps/technical-analysis/ (smoking gun is the TA svc serving wrong values) with a scope_note to ESCALATE to multi only if the diagnostic proves the adjustment root is upstream in stock-price.
**why-decision:** Single-zone routes direct to dev-technical-analysis (cheaper than a forced architect hop); the contingency is documented, not pre-paid.
**why-change:** no change from plan.

### STEP po-S3 · po · 2026-06-30T18:12:28Z
**task-id:** FIX-TA-VNINDEX-BENCHMARK-ABSENT-RS
**what-done:** Minted to backlog[] (architect, zone=multi), HELD on the diagnostic — RC3: get_relative_strength ALL 8 = index_data_absent (low_sample_warning FALSE → VN-Index benchmark series MISSING). cross_ref FIX-VNINDEX-CACHE-STARTUP-PURGE + FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH.
**what-considered:**
- Mint a fresh index-ingest task — REJECTED-as-default: two VN-Index tasks already exist; if TA reads mcp-server vn_index_cache this COLLAPSES into FIX-VNINDEX-CACHE-STARTUP-PURGE. scope_note mandates reconcile-before-mint.
- Route direct to dev — REJECTED: genuine source ambiguity (TA's own ingest vs vn_index_cache) spans 2 zones → architect splits.
**why-decision:** Honest cross-ref + architect split avoids a duplicate ingest task and a mis-route.
**why-change:** no change from plan.

### STEP po-S4 · po · 2026-06-30T18:12:28Z
**task-id:** FIX-TA-INDICATORS-TIER3-ROUTING
**what-done:** Annotated-in-place (folded_under TA-CONSUMER-STALE-INDICATORS + superseded_note + zone) — its ALL-N/A symptom evolved to stale-VALUE post depth-fix; same TA-consumer root, evolved. Idempotent (marker-guarded). Reusable script scripts/po-s135-ta-consumer-stale-indicators-diagnostic-mint.jq.
**what-considered:**
- only: fold not dup — the row described the same serving layer with an out-of-date symptom; minting a 4th near-dup would fragment the chain.
**why-decision:** One coherent diagnostic-gated chain; no SSOT dup.
**why-change:** no change from plan.

### STEP po-S5 · po · 2026-06-30T18:12:28Z
**task-id:** (ambient — out-of-scope flag)
**what-done:** Flagged but did NOT mint for the foreign-flow residual (get_foreign_accum_rank empty needs multi-day foreign-column depth) — already tracked by TASK17-FOREIGN-FLOW + FIX-FOREIGN-FLOW-COVERAGE + ARCH-DAILY-FOREIGN-FLOW-TABLE. Distinct DATA-depth root, not the TA-consumer-stale finding.
**what-considered:**
- only: no new task — duplicating tracked foreign-flow work would violate dedup.
**why-decision:** Surface to dev-team in RETURN; leave existing rows as the owners.
**why-change:** no change from plan.
