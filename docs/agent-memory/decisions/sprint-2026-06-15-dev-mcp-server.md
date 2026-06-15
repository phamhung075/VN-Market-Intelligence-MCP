# Decision Journal — Sprint 2026-06-15 · dev-mcp-server

**Sprint goal:** no active sprint goal set
**Agent:** dev-mcp-server
**Started:** 2026-06-15T16:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-15T16:30:00Z
**task-id:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50
**what-done:** Wired real confidence into all 4 external postSignal producers (finding_data.confidence, chain.conviction, queue-count, SLA severity) via generic Math.round/*100 formula; 22 new tests; rebuilt container; live-verified spread 85/90/78/30 in named-volume DB.
**what-considered:**
- Per-producer allowlist hardcoding each source's confidence → REJECTED (violates /goal#2 generic mandate)
- Single formula `findingData.confidence * 100` for all types → REJECTED (not all producers have findingData; ask-queue/SLA have different honest signals)
- Generic: each producer's own real confidence signal, normalized → CHOSEN
- Making column NOT NULL (force error if omitted) → DEFERRED (column DEFAULT 50 kept; producers override now)
**why-decision:** Generic derivation per source type is the correct fix: chain.conviction is already 0-1, SLA severity has only 2 real values (CRITICAL/HIGH → 90/70), queue count is an honest signal for pending_questions. No fake values.
**why-change:** No plan change — task spec said GENERIC, no allowlist, which was followed exactly.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-15T19:10:00Z
**task-id:** FIX-BCTC-ENRICH-SILENT-0ROWS
**what-done:** Added 0-row gate to bctcPdfPullJob: after triggerExtraction, query ACTUAL DB counts (bctc_table_rows + bctc_md_tables via JOIN on financial_reports action_code+sort_key); if both 0 → mark enrich_failed + logger.error + sendTelegramBug; if either >0 → mark done (non-regression). 9 new ACs. 55/55 tests pass.
**what-considered:**
- Read row count from triggerExtraction return value → REJECTED (injectable dep returns void; no return contract; would require ABI change)
- Read from financial_reports directly (no JOIN) → REJECTED (financial_reports links via sort_key, not via bctc_table_rows; JOIN required for correctness)
- Read ACTUAL DB counts after extraction completes (chosen) → CORRECT (real truth; guards against parse returning stale cached count)
- Per-ticker allowlist for "known 0-row tickers" → REJECTED (violates /goal#2 generic mandate explicitly)
**why-decision:** ACTUAL post-extraction DB read is the only safe source of truth — it reflects what truly landed, regardless of extraction return code or any caching. JOIN through financial_reports on action_code+sort_key is load-bearing (bctc_table_rows has report_id FK, not action_code).
**why-change:** Plan unchanged; regression fixes to 3 existing test files were necessary collateral (those tests expected done but the new gate fires on unseeded rows).
