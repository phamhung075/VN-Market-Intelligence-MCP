---
sprint: BCTC-REFINE-STALL-RETRIGGER
branch: task/BCTC-REFINE-B1-vic-raw-probe
size: XS
zone: apps/mcp-server/src/scheduler/financial-reports/
type: FIX
priority: P2
depends_on: []
blocks: [BCTC-REFINE-B2]
---

## TLDR

Perform a RAW-probe of the `bctc_vps_queue` table to locate VIC's row and diagnose why VIC Q1-2026 BCTC never entered the pipeline (discovered in `financial_reports` table absent). Manually reset VIC's row to `status='pending', attempts=0` to allow the enricher to re-try URL discovery. This unblocks VIC from the terminal `url_not_found` status.

## [PM] Planning Context

- **Zone:** `apps/mcp-server/src/scheduler/financial-reports/` (DB query only, no new code)
- **Type:** FIX (bug diagnosis + 1-line SQL, no code)
- **Size:** XS (~30 min: 1 query + manual reset + verification)
- **Priority:** P2 — unblocks VIC after 20-day stall, but lower urgency than re-arming cowork

### Acceptance Criteria

- [ ] **AC-1:** RAW-probe the live DB (named volume, via `docker exec` or bun script):
  ```sql
  SELECT id, status, attempts, source_url, action_code, error_message
  FROM bctc_vps_queue
  WHERE action_code = 'VIC'
  ORDER BY updated_at DESC
  LIMIT 1;
  ```
  Confirm one row exists. Document the current `status`, `attempts`, `source_url`, `error_message`.
- [ ] **AC-2:** If `status = 'url_not_found'`, confirm `source_url` is NULL or empty. This is the hypothesis (enricher exhausted MAX_ENRICH_ATTEMPTS=5 before discovering the PDF).
- [ ] **AC-3:** Reset the row: 
  ```sql
  UPDATE bctc_vps_queue
  SET status = 'pending', attempts = 0, error_message = NULL, updated_at = DATETIME('now')
  WHERE action_code = 'VIC';
  ```
- [ ] **AC-4:** Verify reset: re-run AC-1 query and confirm `status='pending'`, `attempts=0`.
- [ ] **AC-5:** Wait for next bctcQueueEnricherJob cycle (runs every 15 min at :00, :15, :30, :45) and re-probe. Confirm either:
  - `source_url` now populated (enricher found the PDF) → proceed to B2
  - `status` still `url_not_found` (enricher re-tried 5 times, failed again) → hypothesis C-1/C-2/C-3 confirmed, proceed to B2 with findings

### Knowledge Needed

- Database schema: `apps/mcp-server/src/infrastructure/db/schema.sql` (bctc_vps_queue table)
- Enricher logic: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (MAX_ENRICH_ATTEMPTS, discovery logic)
- Root-cause hypotheses: `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` § Track (b) — C-1, C-2, C-3

### Dependencies

- **Blocks:** BCTC-REFINE-B2 (can't fix discovery script until we confirm which hypothesis is true)
- **Sequential after:** BCTC-REFINE-A1 re-arm (not strictly required, but more useful once queue is actively draining)

---

## Implementation Notes

1. **Live DB access:** Use one of:
   - Bun REPL with direct DB read (via scripts/debug-bctc-queue.ts if it exists, or write a one-off)
   - Docker exec into mcp-server container + sqlite3 CLI
   - MCP tool `query_db` (if exposed) via dev-mcp-server API

2. **Reset strategy:** Keep it minimal — only reset VIC, don't batch-reset other `url_not_found` rows (that's B2's job for a structural fix)

3. **Hypothesis confirmation:** The key evidence is:
   - If `source_url` remains NULL after 5 re-attempts → C-1 likely (PDF not in SSC index yet) or C-3 (regex no-match)
   - If `source_url` now populated → C-2 likely (batch-size cap delay is resolved)

---

## Risk & Notes

**Risk-1 (MEDIUM):** If VIC's PDF is still not indexed in SSC, the enricher will fail again and park VIC as `url_not_found` again. The root-cause discovery is load-bearing for B2 fix design.

**Risk-2 (LOW):** Manual SQL reset has no side effects (reversible by running reset again). But keep it DRY — only reset VIC, don't over-generalize.

**Honest caveat:** Even if B1 resets VIC and B2 lands a discovery fix, the VPS PDF download may still fail if the filing was very recent or the VPS cache lacks the PDF. The reset is a one-time unblock, not a permanent structural fix.

---

## Success Criteria (Done-Verified Gate)

✅ **DONE-VERIFIED when:**
- AC-1..AC-4: All probes executed + reset confirmed in DB
- AC-5: Enricher re-attempted ≥once after reset (check cron_job_runs or logs)
- Findings documented: Was the reset successful? Did enricher find `source_url`? If not, which hypothesis (C-1/C-2/C-3) is confirmed?
