# TASK 1297c Handoff — VPS Validation of BCTC Portal Fix

**Date:** 2026-04-23
**To:** Ops Agent
**From:** Product Owner (Phase 1297a complete, 1297b queued)
**Priority:** HIGH (historical backfill, 37×8 quarters)
**Depends On:** Task 1297b (Developer — Portal URL Fix)
**Blocks:** Market analysis depth + historical BCTC data availability

---

## Quick Summary

**Problem:** After Developer fixes BCTC portal discovery URLs (1297b), OPS must validate on Vinahost VPS and execute full historical backfill.

**Solution:** Deploy fixed script to VPS, test with 3 stocks, run full 37×8 backfill, verify DB ingestion.

**Effort:** 1–2 hours
**Success:** ≥2/3 test stocks pass; all 37 stocks × 8 quarters (Q1 2023–Q4 2024) in DB with BCTC fields populated

---

## Context

- **Sprint:** 1297 (System Reliability + BCTC Backfill)
- **Previous Phase:** Task 1297b (Developer investigates + fixes portal URLs)
- **Current State:** Awaiting 1297b completion + merge to main
- **Trigger:** When Developer merges `task/1297-fix-urls` to main with fixed script
- **Reference Documents:** `docs/TECH_1297b.md`, `docs/handoffs/TASK_1297b_HANDOFF.md`

---

## Files to Change

| File | Action | Detail |
|------|--------|--------|
| `vps-scripts/discover-bctc-urls-browser.py` | Deploy to VPS | Use fixed version from main branch (post-1297b merge) |
| `reports/TASK_REPORT_1297c.md` | Create | Document validation results + backfill completion |

---

## Work Plan (Recommended Order)

### Phase 1: Wait for 1297b to Merge (async)

Monitor main branch for commit with message "fix(1297b): BCTC portal URL discovery...". Once merged:
- Pull latest main branch
- Verify script has correct URLs for HOSE/HNX/UPCOM

### Phase 2: Deploy to VPS (0.25–0.5h)

```bash
# SSH to VPS and pull latest script
ssh root@$VINAHOST_IP

# Check current script
cat /root/discover-bctc-urls-browser.py | head -30

# Or copy fresh from local:
scp vps-scripts/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/
```

Verify environment:
```bash
python3 --version      # Should be 3.12+
playwright -m install chromium  # Ensure Chromium ready
```

### Phase 3: Validation Test (0.5–1h)

Test 3 stocks against Q4 2024 annual reports:

```bash
ssh root@$VINAHOST_IP

# Test 1: VNM (Vinhomes)
python3 /root/discover-bctc-urls-browser.py VNM 2024 Q4

# Test 2: BID (BIDV)
python3 /root/discover-bctc-urls-browser.py BID 2024 Q4

# Test 3: FPT (FPT Software)
python3 /root/discover-bctc-urls-browser.py FPT 2024 Q4
```

**Success Criteria:**
- ≥2/3 stocks return valid PDF URLs (JSON `results` array non-empty)
- URLs are downloadable (curl -I $URL should return 200–302, not 404)

**If <2/3 pass:**
- Do NOT proceed to Phase 4
- Report failure to Developer (escalate blocker)
- Developer must revise 1297b fix

**If ≥2/3 pass:** Proceed to Phase 4

### Phase 4: Historical Backfill (0.5–1h)

Execute full backfill script on VPS:

```bash
ssh root@$VINAHOST_IP

# Run full fetch-bctc.sh to download all PDFs
# (Assumes fetch-bctc.sh exists and calls discover-bctc-urls-browser.py)
cd /root
bash fetch-bctc.sh  # This should loop over 37 stocks × 8 quarters

# Monitor progress
tail -f /tmp/bctc-fetch.log  # (if script logs to this file)
```

**Expected outcome:**
- 37 stocks × 8 quarters = 296 total quarter records
- PDFs downloaded to `/root/bctc-pdfs/` (or configured directory)
- Database insertion via `ingest-bctc-pdfs.sh` or similar

### Phase 5: Database Verification (0.25–0.5h)

Spot-check 5 random BCTC records in DB:

```bash
# SSH to France MCP server (or via remote DB access)
sqlite3 /path/to/vn-market.db

-- Check BCTC table
SELECT COUNT(*) as total_bctc_records FROM bctc;

-- Sample 5 random records with key fields
SELECT ticker, year, quarter, pe, pb, roe
FROM bctc
ORDER BY RANDOM()
LIMIT 5;
```

**Verification:**
- Row count should be ~296 (37 stocks × 8 quarters)
- All 5 samples should have non-null PE, PB, ROE (fields were parsed from BCTC)
- Date fields should span Q1 2023 – Q4 2024

### Phase 6: Document + Commit (0.5h)

Create report: `reports/TASK_REPORT_1297c.md`

```markdown
# Task Report 1297c — VPS Validation of BCTC Portal Fix

**Date:** [TIMESTAMP]
**Agent:** Ops
**Status:** ✓ COMPLETE

## Validation Phase
- ✓ Test 1 (VNM): PDF URL returned + downloaded
- ✓ Test 2 (BID): PDF URL returned + downloaded
- ✓ Test 3 (FPT): PDF URL returned + downloaded

## Historical Backfill
- ✓ Full fetch-bctc.sh executed: 37 stocks × 8 quarters
- ✓ All PDFs downloaded
- ✓ Database ingestion complete: 296 BCTC records

## Spot Check
- ✓ PE field populated for 5 samples
- ✓ PB field populated for 5 samples
- ✓ ROE field populated for 5 samples

**Conclusion:** Historical BCTC data (Q1 2023–Q4 2024) now available for market analysis.
```

Commit to main:
```bash
git add reports/TASK_REPORT_1297c.md
git commit -m "docs(1297c): VPS validation + historical backfill complete — 296 BCTC records ingested"
```

---

## Reference Documents

- **1297b Handoff:** `docs/handoffs/TASK_1297b_HANDOFF.md` (Developer work)
- **1297b Technical Design:** `docs/TECH_1297b.md` (URL investigation steps)
- **1297b Validation Report:** `docs/handoffs/TASK_1297_VALIDATION.md` (previous OPS attempt, shows why 1297b needed)
- **BCTC Portal Findings:** `docs/BCTC_PORTAL_URL_FINDINGS_2026_UPDATED.md` (updated by Developer in 1297b)

---

## Acceptance Criteria

- [ ] Script deployed to VPS from fixed main branch
- [ ] Validation test: ≥2/3 stocks (VNM, BID, FPT Q4 2024) return valid PDF URLs
- [ ] Test URLs are downloadable (HTTP 200/302, not 404)
- [ ] Full historical backfill executed: 37 stocks × 8 quarters
- [ ] Database contains ≥290 BCTC records (expected ~296)
- [ ] Spot-check: 5 random records have PE, PB, ROE fields populated
- [ ] Report created: `reports/TASK_REPORT_1297c.md`
- [ ] Committed to main

---

## Blockers & Escalation

**If validation fails (<2/3 tests pass):**
1. Check Developer's fix (1297b) — may need refinement
2. Log exact error messages from test runs
3. Escalate to Developer: "1297b URLs still broken, need revision"
4. Do NOT proceed to backfill until ≥2/3 pass

**If backfill fails:**
1. Check DB connection from VPS to France (network/firewall)
2. Check PDF parsing pipeline (may have OCR or format issues)
3. Document error logs in task report
4. Escalate to Architect if DB schema mismatch suspected

---

## Next Step After Done

Once 1297c completes:
1. Historical BCTC data (Q1 2023–Q4 2024) available for all analysis
2. Market analyst agents can use historical PE/PB/ROE for cascades
3. Sprint 1297 fully complete
4. System ready for deeper market intelligence signals

---

## Notes

- **Trigger:** Do NOT start 1297c until 1297b is merged to main
- **VPS Access:** Use `$VINAHOST_IP` (set in env) and `sshpass` if needed
- **Logging:** Capture all test outputs to report (curl, python script, sql queries)
- **Parallel Execution:** Once deploy + test validated, run backfill in background (may take 30–60 min) while documenting
- **Rollback:** If DB ingestion corrupts data, backups exist at `/root/bctc-backup/` on VPS (confirm before execution)

