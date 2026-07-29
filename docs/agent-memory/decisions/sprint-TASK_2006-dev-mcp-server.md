# Decision Journal — Sprint TASK_2006 · dev-mcp-server

**Sprint goal:** SUBTASK-DAILY-FF-7 follow-on — schema-comment annotation marking `daily_ohlcv.foreign_*` columns frozen/historical (ARCH-DAILY-FOREIGN-FLOW-TABLE, optional, not required for P1 delivery)
**Agent:** dev-mcp-server
**Started:** 2026-07-29T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-29T00:00:00Z
**task-id:** TASK_2006
**what-done:** Added a schema comment on `daily_ohlcv.foreign_*` (schema-market-data.ts, JS block + inline SQL `--` comments) and reiterated the freeze in `ohlcvForeignFlowStore.ts`'s JSDoc, both annotation-only — no code/logic delta.
**what-considered:**
- Verbatim vs paraphrased architect wording: used the exact phrasing from the design doc §Change 2/R-7 ("Frozen historical-only columns as of 2026-07-10 ... do NOT write new data here") per the dispatch's explicit instruction, rather than improvising.
- Placement: JS comment above `db.exec` (visible to anyone reading the file) plus inline SQL `--` comment directly on the 4 columns inside the DDL string itself (visible to anyone reading the DDL/sqlite_master) — belt-and-suspenders, no schema/logic change either way.
- `ohlcvForeignFlowStore.ts` already carried an extensive SSOT-FREEZE JSDoc block from TASK_2002/2003's writer cutover; added a short explicit "DEPRECATED in favor of daily_foreign_flow" paragraph so the AC's literal wording is satisfied without duplicating the existing block.
- Confirmed TASK_2002 (writer cutover) already DONE_VERIFIED per BOUNDED-1 promote-gate cold-archive check before starting — per dispatch instruction, did not re-verify.
**why-decision:** Near-verbatim architect phrasing + dual placement (JS + inline SQL) maximizes future-developer visibility for a pure-annotation task with zero regression risk; confirmed via `git diff` that both touched files changed only comment lines.
**why-change:** No change from plan (handoff's 2 files-to-modify list followed exactly; no files created, no DROP COLUMN).
