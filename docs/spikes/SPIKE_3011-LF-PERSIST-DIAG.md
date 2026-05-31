# SPIKE 3011 — LF-PERSIST-DIAG: pushBctcLayoutHandler Write-Wedge Diagnosis

- **Question:** Is report #3011 (2026-05-29 HIGH — "FPT Q4 2024 `units_stored=28` but `bctc_layout_units` = 0 rows") a real write-wedge on the CURRENT mcp-server image, or stale/FALSE-RED?
- **Approach tried:** (1) Code audit of deployed container handler. (2) Live push probe via `curl POST /api/push-bctc-layout` with a synthetic spike `report_id`. (3) In-container `bun` COUNT for that exact `report_id`. (4) Timeline reconstruction against git commits and docker image timestamps.
- **Spike date:** 2026-05-31
- **Timebox:** 120 min

---

## Verdict: STALE-FALSE-RED

Report #3011 is FALSE-RED on the current image. Persistence works correctly. Evidence below.

---

## Raw Evidence

### 1. Deployed Image — Post-Commit COUNT Handler Confirmed in Container

Image built: `2026-05-31 03:03:27 +0200` (sha256: `802d6463e665`)

Handler in-container grep confirms the post-commit SELECT COUNT path is present:

```
L207:  // ── DB-verified counts (write-wedge detection — never echo input length) ─
L210:  "SELECT COUNT(*) AS cnt FROM bctc_layout_units WHERE report_id = ?"
L216:  "SELECT COUNT(*) AS cnt FROM bctc_page_zones WHERE report_id = ?"
L221:  res.end(JSON.stringify({ ok: true, units_stored: unitsStored, pages_stored: pagesStored }))
```

The SELECT COUNT was present from the original LF-OVERLAY commit (`2326ebb6`, 2026-05-26 20:51) — it was never an echo. The BTB-PERSIST-FIX commit (`60dfac7f`, 2026-05-30 01:46) fixed the idempotency bug (INSERT OR REPLACE → DELETE-before-INSERT) but did NOT add the COUNT — it was already there.

### 2. Live Push Probe

```
report_id:      a1b2c3d4-e5f6-7890-abcd-ef1234567890  (spike probe UUID)
push_1_payload: 2 units, 2 page_zones
curl POST http://localhost:3000/api/push-bctc-layout
→ Response: {"ok":true,"units_stored":2,"pages_stored":2}
```

### 3. In-Container COUNT After Push

```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "
  SELECT COUNT(*) FROM bctc_layout_units WHERE report_id = 'a1b2c3d4-...'
"
→ units_in_db: {"cnt":2}
→ pages_in_db: {"cnt":2}
```

**COUNT (2) == units_stored (2).** Persistence confirmed.

### 4. Idempotency / DELETE-before-INSERT Proof

Re-push with DIFFERENT unit_ids (same report_id):

```
curl POST /api/push-bctc-layout (new unit_ids: spike-unit-NEW1, spike-unit-NEW2)
→ Response: {"ok":true,"units_stored":2,"pages_stored":2}

In-container COUNT: {"cnt":2}  (NOT 4 — DELETE fired correctly)
Old unit_id "spike-unit-0001-0000..." still present: {"cnt":0}  (gone — DELETE confirmed)
```

### 5. Pre-Existing Table Rows (Table NOT Empty)

Before the spike probe, `bctc_layout_units` already had 175 rows across multiple reports:

```
Top reports in bctc_layout_units:
  e71f845d (FPT 2025-Q4):  31 rows
  fea19bae (ACB 2026-Q1):  22 rows
  0c6f0535:                18 rows
  59212e0d:                16 rows
  4316f6d1:                14 rows
Total: 175 rows
```

The report's premise ("table = 0 rows") was false at time of spike.

### 6. FPT 2024-Q4 Not in financial_reports

Only 2 FPT reports exist in the DB:
- `e8ea3df5` — FPT 2026-Q1 (6 layout_units)
- `e71f845d` — FPT 2025-Q4 (31 layout_units)

There is no FPT 2024-Q4 report. The `units_stored=28` the analysis-agent saw was for a different report or a different observation window.

---

## Root Cause of #3011 False-Red — Timeline Reconstruction

**The report confused `pushBctcLayoutHandler` (LF-OVERLAY route, layout units) with `pushBctcTableHandler` (the table-rows handler).** The original write-wedge diagnosis (2026-05-26, `project_mcp_server_write_wedge.md`) was about `pushBctcTableHandler.ts`, which DID echo `rows.length` (input length) instead of a post-commit COUNT, and which DID fail during a container WAL-freeze incident. That bug was real and logged.

`pushBctcLayoutHandler` was written AFTER the write-wedge lesson was learned: it has had the post-commit COUNT guard from its first commit (`2326ebb6`). The analysis-agent in #3011 appears to have conflated the two routes.

**Compound factor — DELETE-before-INSERT idempotency bug (2026-05-29 window):**

Before `60dfac7f` (committed 2026-05-30 01:46), the handler used `INSERT OR REPLACE` on `(report_id, unit_id)`. Because pdf-extractor generates new `unit_id` UUIDs on every extraction run, the `OR REPLACE` never fired — each re-extraction APPENDED rows (FPT: 42 rows = 7 units × 6 extractions). On 2026-05-29, if the analysis-agent pushed FPT and then queried by a stale image's `units_stored`, the count could mismatch across successive pushes. However this is an accumulation bug (too many rows), not a write-wedge (0 rows).

**Compound factor — force-recreate resets (spawn context in #3011):**

The #3011 report was filed during a window when MACRO-CMDTY-DELTA force-recreated mcp-server twice. A force-recreate on a named-volume setup is safe — data persists — but the timing may have caught a mid-transaction state or the analysis-agent may have queried `bctc_layout_units` via a stale `report_id` that belonged to a prior image run.

---

## Recommended Next Action

**Resolve report #3011 as WONTFIX / FALSE-RED.**

Evidence for dispatcher/PO to `process_telegram_report`:
- `units_stored` is a post-commit `SELECT COUNT(*)`, present from `2326ebb6` (2026-05-26). Never an echo.
- Live probe 2026-05-31: push 2 units → `units_stored=2`; in-container COUNT = 2. Match confirmed.
- `bctc_layout_units` has 175 rows across 5 reports. Not empty.
- Idempotency fix (`60dfac7f`) shipped 2026-05-30. No open persistence defect.
- The real write-wedge issue (WAL-freeze, input-echo) was on `pushBctcTableHandler` (different route) and was known/documented 2026-05-26.

**No LF-OVERLAY FIX scope needed.**

---

## Code Reference

- Handler: `apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts` L207-221
- Original LF-OVERLAY commit: `2326ebb6` (2026-05-26 20:51)
- BTB-PERSIST-FIX (idempotency): `60dfac7f` (2026-05-30 01:46)
- Probe report_id: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (spike-only, not production)
- Branch: none (static-code + live probe only, no throwaway branch created)
