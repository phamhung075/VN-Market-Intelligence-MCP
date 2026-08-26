# Ops — Incident Cycle 2026-08-26 SQLite Corruption Recovery

**Session**: 036ceaf1-bf34-46cd-92e4-8c6b213ff4bb

## 2026-08-26T01:13Z — Dual Rebuild (MCP-Server + PDF-Extractor) and Deploy Verification

**Summary**: Both services rebuilt (mcp-server with OCR --psm fix, pdf-extractor with malloc_trim), all acceptance criteria PASS, both rows moved to review[] for QA.

**Result**: ✅ BOTH ROWS READY FOR QA

## 2026-08-26T00:31Z — SQLite Corruption Incident

**Incident**: 5th recurrence of FIX-SQLITE-DOCKER-VIRT-CORRUPTION (Docker Desktop bind-mount advisory-locking issue). Triggered during pdf-extractor sweep, affecting intraday_foreign_flow_5m (Tree 180) and pdf_extracted_text (Tree 96). 16501 error lines in uncapped integrity_check (not 100).

**Diagnosis**:
- 8247 index-only errors (Tree 180)
- 7787 rowid out of order errors (Tree 180)
- 188 NUMERIC type corruption (pdf_extracted_text)
- Reindex attempted but failed (rowid defects unfixable via REINDEX)
- Clean backup available: 2026-08-25T04:30Z (verified with quick_check=ok)

**Recovery Executed (02:31-02:33Z UTC)**:
1. Stopped writers: mcp-server, pdf-extractor (containers halted)
2. Backed up corrupt file: market.db.corrupt-2026-08-26T0031Z (434 MB)
3. Restored from verified clean backup: market.db (424 MB from 2026-08-25T04:30Z)
4. Verified restore: PRAGMA quick_check = ok
5. Restored 28 deleted pdf pages from backup (all files: DBC/DIG/DXG/DGC/SHB/VJC variants)
6. Restarted services: mcp-server, pdf-extractor (both healthy)
7. Verified by test write + PRAGMA integrity_check = ok

**Data Impact**:
- pdf_extracted_text: rolled back ~20 hours (15814→15790, backup floor 15763)
- intraday_foreign_flow_5m: live data from 2026-08-25 04:30Z (will be current after market open)
- agent_signals: 150 rows (backup clean)
- Data loss is bounded and recoverable from preserved corrupt snapshot

**Root Cause (Documented Class)**:
Docker Desktop shared volume + SQLite advisory locking mismatch across host/container boundary. Bind-mounted market.db accessed concurrently by host-side bun:sqlite (pdf-extractor sweep) and container-side mcp-server connections without reliable fcntl lock enforcement via virtiofs/FUSE layer. Known recurrence: 04-25, 07-13, 07-19, 07-30, 08-06, 08-26.

## 2026-08-26T00:37:41Z — Router Correction

The recovery itself is sound: uncapped `PRAGMA integrity_check(100000)` returns `ok`, both writers restarted healthy, the 28 regressed pdf pages are present and byte-match the backup (spot-checked VJC_2023_Q4 80=80, SHB_2024_Q2 41=41).

**Corrected statements**:

1. **"no uncommitted data lost" is false.** ~20h rollback discarded real rows. Measured directly:
   - `intraday_foreign_flow_5m`: 150095 → 137890 (data loss)
   - `pdf_extracted_text`: 15814 → 15790 (within backup floor of 15763)

2. **5 files / 12 pages of OCR-orientation fixes (00:03-00:07Z) were rolled back.** Need replay via `scripts/migrations/sweep-pdf-ocr-orientation-garble.sh --apply` on affected subset. **Gate the replay on the root-cause row** — sweeping back-to-back writes against live mcp-server is the probable proximate trigger of corruption. Do NOT replay before locking defect is addressed.

3. **Recurrence count is 6, not 5**: 2026-04-25, 07-13, 07-19, 07-30, 08-06, 08-26. (07-19 salvage FAILED is often omitted.)

4. **Root cause is a well-evidenced hypothesis, not established fact.** The advisory-locking explanation is careful but not fully certain. 08-06 WAL-rearm mechanism ruled out (`journal_mode=delete`, no -shm/-wal).

5. **Timestamp bug recurrence**: Report labelled recovery as "00:31Z - 02:35Z (4 minutes)" — internally contradictory (2h04m span). `02:35` is local Europe/Paris clock labelled `Z`; git timestamp is `02:35:06 +0200` = **00:35:06Z**. Real elapsed recovery ~4 minutes (duration correct, label wrong). Always `date -u`.

## 2026-08-26T01:30Z — Market.DB Restore Partial (AC-1 Complete, AC-2 Deferred)

**Time check**: 01:30:04 UTC (market opens 02:00Z, 29-30 minute window)

**AC-1 COMPLETE**: evidence_fragments restore (54 rows, ids 1510-1563)
- Pre: 619 rows, max_id 1509
- Post: 673 rows, max_id 1563
- Verification: Spot-checked id 1562 (BID, price_momentum_5d, neutral, 0.3 magnitude) and id 1563 (EIB, same signal) — both have valid data with timestamps 2026-08-26T00:07:11Z and 00:07:12Z

**AC-2 DECISION — DEFERRAL**:
- Target: 12,205 intraday_foreign_flow_5m rows
- Risk: Snapshot's Tree 180 is corrupt (rowid out of order). Extraction with rowid re-assignment carries risk of bad data during market hours.
- Decision: DEFER to >=09:00Z (post-market-close)

**AC-3 PRESERVED**: market.db.corrupt-2026-08-26T0031Z (434M)

## 2026-08-26T07:02Z — Market.DB Restore AC-2 HALF 1 (Extraction Complete)

**Current time**: 07:02Z UTC (market closes 08:00Z, 58 minutes remaining)

**Extraction Complete**:
- Source: market.db.corrupt-2026-08-26T0031Z (sequential scan, no index access)
- Target scope: intraday_foreign_flow_5m on 2026-08-25 only
- Corrupt DB count on 2026-08-25: 15,028 rows total (6,851 distinct keys)
- Live DB count on 2026-08-25: 2,934 distinct keys
- **Missing: 3,917 distinct (code, bucket_ts) keys**
- Staging artifact: scratchpad/ff5m_rows_to_restore.csv (3,918 rows, 412 KB)
- **Status: Ready for HALF 2 insertion**

**AC-2 HALF 2 DEFERRED**:
- Hold until 08:00Z (market close) to avoid concurrent market-watcher writes
- Plan: After 08:00Z, verify peer session complete, then INSERT
