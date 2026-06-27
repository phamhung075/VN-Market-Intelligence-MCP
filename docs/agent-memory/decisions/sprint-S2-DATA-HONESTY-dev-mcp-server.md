# Decision Journal — Sprint S2-DATA-HONESTY · dev-mcp-server

**Sprint goal:** Data honesty — surface real pipeline state, not badge-green proxy metrics
**Agent:** dev-mcp-server
**Started:** 2026-06-27T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T07:35:00Z
**task-id:** FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP
**what-done:** Added `refine_pending` counter to `fetchStatusHandler.ts` `BctcQueueCounts` to expose refine-layer stall state in the `/api/fetch-status` endpoint.
**what-considered:**
- Option A: Fix at DISCOVER layer (PO hypothesis) — ruled out; recon proved filings were already discovered/pulled.
- Option B: Expose refine stall in existing monitoring endpoint — chosen; minimum-footprint truth fix.
- Option C: Trigger fleet-cron re-run — operational, not code; separate action outside this zone.
**why-decision:** Root cause was false-green in `queryBctcCounts()`: it only read `bctc_vps_queue` (both HPG+ACV = 'done') and never checked `financial_reports.refine_status`; adding one SELECT surfaces the real 47-report stall.
**why-change:** PO hypothesis said DISCOVER layer defect; recon disproved — actual gap is REFINE layer stall post June-7 fleet-cron halt.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-27T12:00:00Z
**task-id:** FIX-COLDEVICT-TERMINAL-VOCAB-CANONICALIZE
**what-done:** Reconciled `TERMINAL_SPRINT_STATUSES` in `orch-cold-evict.sh` and Step 4.2 gate in `post-cycle.md` to exact `TERMINAL_SET` from `orchStateSchema.ts`; added canonical-token sign-off convention to `po/main.md`.
**what-considered:**
- Keep lowercase `done` alias for back-compat — rejected; StatusEnum requires uppercase; alias masks future drift.
- Update only the script and leave gate in sync — rejected; DoD requires byte-equal sets in both predicates.
**why-decision:** TERMINAL_SET in orchStateSchema.ts is the declared SSOT (lines 57-64); any list that diverges will silently fail to evict canonically-signed-off sprints (root cause of the COMPLETE-token strand).
**why-change:** no change from plan; exact 3-file scope PO-authorized; live-data already remediated by PO.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-27T10:00:00Z
**task-id:** SSOT-W1-ZOD-SCHEMA-MODEL
**what-done:** Built `orchStateSchema.ts` — nested Zod SSOT with StatusEnum (12 values), all 9 task-bearing lanes via shared `Lane`, `.strict()` at root+TaskBoardSchema, `superRefine` for head.active_task_id RI; colocated 64-test suite; reconciled 1837a+1980 to match live v4 structure.
**what-considered:**
- Option A: Put lane-status coherence in superRefine — rejected; live data has 72 coherence violations during SHG migration, would break live-parse test.
- Option B: Exported `checkLaneCoherence()` function (not superRefine) — chosen; superRefine reserved for head RI only.
- Option C: Use .strict() on TaskSchema — rejected; live tasks carry 90+ legacy field keys; .passthrough() validates status against StatusEnum while tolerating unknown fields.
**why-decision:** superRefine for head RI catches the documented "whole-doc overwrite" corruption pattern (head.active_task_id dangling); lane-coherence exported separately avoids false-fails on SHG-migration-era data while still providing the check for CLI callers.
**why-change:** Directive mandated superRefine for coherence but live data forced separation; PO ratified ADD-1 READY as 12th StatusEnum value same day.
