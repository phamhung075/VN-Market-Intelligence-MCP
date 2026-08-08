## Task Report FIX-MCP-MEMORY-CODE-LEAK
changed: [apps/mcp-server/src/infrastructure/db/schema.ts, apps/mcp-server/src/__tests__/002-db-schema.test.ts, docs/architecture/microservice/mcp-server/infrastructure.md, docs/architecture/microservice/mcp-server/testing.md]
tests: 26 pass / 0 fail (002-db-schema.test.ts) | tsc: 0 errors | ddd: N/A (infrastructure-layer file, no cross-layer import) | security: PASS | mock-guard: PASS
verdict: APPROVED — direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`)

### Verification method
Direct-commit verify (no branch, already on `main`). Row carried no top-level `commit`/`files[]` field — derived commit `609f62800` from the row's own `dev_implementation_note`.
- `git merge-base --is-ancestor 609f62800 main`: confirmed on main ancestry.
- `git show --stat 609f62800`: touches exactly the 4 files claimed (schema.ts, 002-db-schema.test.ts, 2 architecture docs); commit message carries `Task: FIX-MCP-MEMORY-CODE-LEAK` verbatim.
- Re-ran REAL, not trusted from dev/PO prose: `bun test apps/mcp-server/src/__tests__/002-db-schema.test.ts` → 26/26 pass (matches dev's claimed count).
- `bun tsc --noEmit` (apps/mcp-server) → 0 errors.
- `bash scripts/audits/mock-guard.sh --files apps/mcp-server/src/infrastructure/db/schema.ts` → PASS, exit 0.
- `grep -n "process.env"` / secrets/password/token grep on schema.ts → clean.
- `WeakSet<Database>` identity guard confirmed live at schema.ts:76 (`_initializedDbs`) and the guarded call site at :177-190, matching the architect brief's design (`docs/architecture-briefs/2026-08-05-fix-mcp-memory-code-leak-initdatabase-guard.md`).

### AC re-scope (po_ac_rescope_20260808T1759Z, binding)
PO formally narrowed this row's AC from the original 12h/87% memory-ceiling claim (falsified 08-07, root-caused to a SEPARATE leak source — `FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER`, which now owns that AC + the RestartCount≥2h gate) to: `initDatabase()` bootstrap-sweep signature probe — `backfillOCFForWatchlist` occurrences since container boot must be ~1 (bootstrap only), not ~52/10min.
- Independently re-measured LIVE on the current running container (not relayed from PO's own re-verify): `docker logs vn-market-intelligence-mcp-mcp-server-1 | grep -c backfillOCFForWatchlist` = **1** occurrence since boot (container `RestartCount=0`, `StartedAt=2026-08-08T16:59:50Z`, ~2h uptime) vs the row's own documented pre-fix baseline ~52/10min / 41689 occurrences since the 07-31 pre-fix image. AC PASSES.
- `docker exec` grep of `/app/src/infrastructure/db/schema.ts` confirms the WeakSet guard is present in the actual deployed image, not just git HEAD — matches `po_goahead_20260808T175954`'s independent claim.
- `/health` toolCount=183 re-confirmed unchanged.
- Size-lint debt this row's own commit briefly caused (schema.ts 377L vs upper 369L) was separately discharged by `FIX-CI-SIZELINT-SCHEMA-TS-BASELINE-TOLERANCE-377L` (`daaef1d21`) per this row's own `dedup_key_retire_note`; current schema.ts = 261L, live `size-lint-justification.sh --check` confirms zero mention of schema.ts (only unrelated `coordinationStore.ts`/`transport.ts` flagged, out of scope). Gate (e) is not this row's obligation post-rescope.

### Board
`task_board.qa[]` → `task_board.done_verified[]`, `status: QA -> DONE_VERIFIED`. Verification text appended to the row's own `status_note` field (no handoff file — direct-commit verify path; all prior PO/dev/ops history left intact). `verification.raw_probe{tool,args,live_value_observed,observed_at}` attached (RC-VERIF gate) — genuine live docker-logs probe, not fabricated. Applied via `jq` + `scripts/orch-apply.sh` (conservation OK: task_total 753→753, signal_total 31→31, signal_row_identity=clean).
