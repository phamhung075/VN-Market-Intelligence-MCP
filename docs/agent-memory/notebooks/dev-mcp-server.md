# dev-mcp-server -- Notebook

## 2026-06-10 · BPE-DEV-2 — REVIEW

**Task:** BPE-DEV-2 | Sprint: BCTC-PROSE-EXTRACT | Size: M | DJ: dev-mcp-server-S27
**Scope:** Serving layer — bctcInspectHandler + bctcFullTools prose extension.
**Fix:** bctcInspectHandler L511-591: page_type filter changed from `= 'table'` to `IN ('table', 'prose')`. EC-1 guard: empty prose stitched_markdown falls through to pdf_extracted_text fallback (pek_coverage_gap:true). New semantics: gap=true means "no content of either type." bctcFullTools: added ProseSectionEntry interface + prose_sections[] to BctcStructuredData; new query on bctc_layout_units (quarantine=0, stitched_markdown != '', sorted by page asc); 4000-char cap per unit with prose_truncated flag (RISK-6).
**Tests:** 12 new (PROSE-UNIT-SERVE.test.ts) + 59 pass on 5 affected files. tsc CLEAN. tools=157. sched=78.
**Commit:** 5cea706a. REBUILD REQUIRED before live.

---

## 2026-06-11 · REAUDIT-001 — Fix reputation trend always stable — DONE

**Task:** REAUDIT-001 | Sprint: SHIP-WAVE-REAUDIT | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause:** reputationComputeJob computed priorDate=today-7d and called getReputation(db,code,priorDate) with WHERE date=? exact match. Production rows land at irregular intervals (3-7d gaps) so lookup always returned null → priorScore=undefined → trend="stable" for 100% of 235 rows.
**Fix 1 (reputationStore.ts):** Added getReputationPrior(db,code,beforeDate) — WHERE code=? AND date < ? ORDER BY date DESC LIMIT 1. Parameterized SQL. Returns ReputationScore|null.
**Fix 2 (reputationComputeJob.ts):** Removed priorDate offset calc. Replaced getReputation(db,code,priorDate) with getReputationPrior(db,code,today). Import updated.
**Tests:** 9 new TCs. 81 pass / 0 fail. tsc exit 0. toolCount=157. schedulerCount=78.
**QA timing:** trend values update only on next 08:30 UTC cron run after ops rebuild.
**Commit:** b9f003ab | Zone health: HEALTHY

---

## 2026-06-11 · REAUDIT-002 — NFR-C-1 stale flags on 5 handlers — DONE

**Task:** REAUDIT-002 | Sprint: SHIP-WAVE-REAUDIT | Priority: HIGH | Zone: apps/mcp-server/
**New file:** `_staleness.ts` — `computeStaleness(asOfDate, thresholdDays, now)` utility. Null/empty-safe. Injectable clock. Returns `{stale, staleByDays}`.
**5 handlers updated:** conviction-history (2d/tradingDate), corporate-events (3d/max eventDate), shareholders (55d/asOf), financials (14d/asOf), reputation (3d/asOf). `now` param added to each for testability. All existing response fields unchanged (additive contract).
**Live stale state (2026-06-11):** shareholders stale=true staleByDays=3 (asOf=2026-04-14, 58d); financials stale=true staleByDays=43 (asOf=2026-04-15, 57d); others within threshold.
**Tests:** 24 new TCs in REAUDIT-002-staleness.test.ts. 257 existing handler tests GREEN. tsc exit 0. toolCount=157. schedulerCount=78.
**Commit:** 70a33a80 | Zone health: HEALTHY
