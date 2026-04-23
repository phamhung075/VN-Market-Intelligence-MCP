# Ops Checklist — BCTC Portal PDF Discovery VPS Deployment

**Task:** 1289f — Browser-Based BCTC PDF URL Discovery
**Status:** Ready for VPS deployment (QA approved)
**Date:** 2026-04-23
**Ops Owner:** [Your Name]

---

## Pre-Deployment Checklist

### Pre-Flight (Before Starting)

- [ ] VPS SSH access confirmed: `ssh root@$VINAHOST_IP`
- [ ] VPS network connectivity: `curl -I https://www.hsx.vn` (should get HTTP 200 or similar)
- [ ] Python 3.9+ installed: `ssh root@$VINAHOST_IP 'python3 --version'`
- [ ] pip3 available: `ssh root@$VINAHOST_IP 'pip3 --version'`
- [ ] `/root` directory writable: `ssh root@$VINAHOST_IP 'ls -la /root'`

---

## Installation Steps

### Step 1: Install Playwright + Chromium (5 minutes)

```bash
# SSH to VPS
ssh root@$VINAHOST_IP

# Install Playwright library
pip3 install playwright

# Install Chromium browser (this is the heavy step, ~500MB)
python3 -m playwright install chromium

# Verify installation
python3 -c "from playwright.async_api import async_playwright; print('OK')"
```

**Expected Output:** `OK`

**If this fails:**
- Check disk space: `df -h` (need ~1GB free)
- Check internet: `curl -I https://github.com` (should get 200)
- Try again with verbose: `python3 -m playwright install chromium --with-deps`

**Time estimate:** 3–5 minutes

---

### Step 2: Deploy Python Script (2 minutes)

From your local machine:

```bash
# Copy Python script to VPS
scp vps-scripts/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/

# Make executable
ssh root@$VINAHOST_IP 'chmod +x /root/discover-bctc-urls-browser.py'

# Verify permissions
ssh root@$VINAHOST_IP 'ls -la /root/discover-bctc-urls-browser.py'
# Expected: -rwxr-xr-x (executable bit set)
```

**Expected Output:**
```
-rwxr-xr-x 1 root root 5432 Apr 23 15:30 /root/discover-bctc-urls-browser.py
```

---

### Step 3: Deploy Shell Script (1 minute)

```bash
# Copy shell script to VPS
scp vps-scripts/enrich-bctc-urls.sh root@$VINAHOST_IP:/root/

# Make executable
ssh root@$VINAHOST_IP 'chmod +x /root/enrich-bctc-urls.sh'

# Verify
ssh root@$VINAHOST_IP 'ls -la /root/enrich-bctc-urls.sh'
# Expected: -rwxr-xr-x
```

**Total Installation Time:** ~10 minutes

---

## Smoke Test Phase (30 minutes)

### Test 1: Single Stock Discovery (5 min)

**Purpose:** Verify Python script works on VPS (Vietnam IP)

```bash
ssh root@$VINAHOST_IP

# Test HOSE discovery (VNM is a large-cap stock)
python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4
```

**Expected Output (JSON):**
```json
{
  "url": "https://www.hsx.vn/Modules/CMS/Web/Article/...",
  "source": "HOSE",
  "confidence": 0.95
}
```

**Success Criteria:**
- [ ] Valid JSON output (not error message, not garbage)
- [ ] `"url"` field non-null (PDF URL found)
- [ ] `"source"` is "HOSE", "HNX", or "UPCOM"
- [ ] `"confidence"` is between 0.85 and 0.95
- [ ] Completes in <5 seconds

**If it fails:**
- Check error message in output (look for `"error"` field)
- Verify portal is accessible: `curl -I https://www.hsx.vn/...`
- Check VPS logs: `tail -50 /var/log/vps.log`

**Mark:** [ ] PASS / [ ] FAIL

---

### Test 2: Portal Fallback (10 min)

**Purpose:** Verify all three portals work

```bash
ssh root@$VINAHOST_IP

# Test HNX portal (FPT is on HNX)
python3 /root/discover-bctc-urls-browser.py FPT 2025 Q4

# Test UPCOM portal (KDC is on UPCOM)
python3 /root/discover-bctc-urls-browser.py KDC 2025 Q4
```

**Success Criteria:**
- [ ] FPT returns JSON (source: HOSE or HNX)
- [ ] KDC returns JSON (source: UPCOM or HNX or HOSE)
- [ ] Confidence scores correct (HOSE ≥ 0.95, HNX ≥ 0.9, UPCOM ≥ 0.85)
- [ ] Each test <5 seconds

**Mark:** [ ] PASS / [ ] FAIL

---

### Test 3: Error Handling (5 min)

**Purpose:** Verify graceful failures (no crashes)

```bash
ssh root@$VINAHOST_IP

# Test invalid stock (should fail gracefully)
python3 /root/discover-bctc-urls-browser.py NOTREAL 2025 Q4

# Expected: {"url": null, "source": null, "confidence": 0, "error": "..."}

# Test old quarter (may not exist)
python3 /root/discover-bctc-urls-browser.py VNM 2020 Q1

# Expected: {"url": null, ...} or {"url": "https://...", ...}
```

**Success Criteria:**
- [ ] No Python exceptions/crashes
- [ ] Returns valid JSON (not garbage, not empty)
- [ ] Completes in <5 seconds
- [ ] Error field populated when discovery fails

**Mark:** [ ] PASS / [ ] FAIL

---

### Test 4: Timing Check (5 min)

**Purpose:** Verify latency is acceptable for bulk runs

```bash
ssh root@$VINAHOST_IP

# Run 5 times, measure average latency
for i in {1..5}; do
  echo "Run $i:"
  time python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4 >/dev/null
done
```

**Expected Output (timing):**
```
real    0m1.234s
real    0m1.567s
real    0m1.892s
real    0m1.345s
real    0m1.678s
```

**Success Criteria:**
- [ ] Average time <3 seconds (typical: 1–2s)
- [ ] No huge variance (not 0.5s then 10s)
- [ ] Consistent performance across runs

**Mark:** [ ] PASS / [ ] FAIL

---

### Test 5: Shell Integration (5 min)

**Purpose:** Verify shell script can call Python correctly

```bash
ssh root@$VINAHOST_IP

# Test manual Python call from shell
bash -c 'python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4'

# Test JSON parsing with jq
RESULT=$(python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4)
echo "$RESULT" | jq '.url'        # Should extract URL or "null"
echo "$RESULT" | jq '.source'     # Should extract "HOSE" or similar
echo "$RESULT" | jq '.confidence' # Should extract number
```

**Success Criteria:**
- [ ] Python callable from shell without errors
- [ ] JSON output valid and parseable by `jq`
- [ ] All three fields present and extractable

**Mark:** [ ] PASS / [ ] FAIL

---

## Smoke Test Summary

**All tests passed?** [ ] YES / [ ] NO

If YES → Proceed to Background Backfill Test
If NO → Fix issues and repeat failing tests

**Issues encountered (if any):**
```
[Describe any failures or problems here]
```

---

## Background Backfill Test (40 minutes)

**Purpose:** Verify full discovery works without crashes

### Setup (2 minutes)

```bash
ssh root@$VINAHOST_IP

# Create test script (3 stocks × 1 quarter = 3 PDFs, ~15 seconds total)
cat > /tmp/test-bctc.sh <<'EOF'
#!/bin/bash
STOCKS=(VNM BID FPT)
YEARS=(2025)
QUARTERS=(Q4)

for STOCK in "${STOCKS[@]}"; do
  for YEAR in "${YEARS[@]}"; do
    for QTR in "${QUARTERS[@]}"; do
      echo "Discovering $STOCK $YEAR $QTR..."
      python3 /root/discover-bctc-urls-browser.py "$STOCK" "$YEAR" "$QTR"
      sleep 1  # Rate limit
    done
  done
done
EOF

chmod +x /tmp/test-bctc.sh
```

### Execution (15 minutes)

```bash
# Run test script
echo "Starting backfill test (should take ~15 seconds)..."
/tmp/test-bctc.sh > /tmp/bctc-test.log 2>&1

# Wait for completion
sleep 20

# Check results
echo "=== Test Results ==="
cat /tmp/bctc-test.log
```

### Verification

```bash
# Count successful discoveries
grep -c '"url".*https' /tmp/bctc-test.log
# Expected: 3 (one for each stock)

# Check for errors
grep '"error"' /tmp/bctc-test.log
# Expected: empty (no errors if all successful)

# Check total time
wc -l /tmp/bctc-test.log
# Expected: 6–10 lines (3 stocks + 3 JSON outputs)
```

**Success Criteria:**
- [ ] All 3 stocks complete without errors
- [ ] Each takes <5 seconds
- [ ] No Python crashes
- [ ] All JSON outputs valid

**Mark:** [ ] PASS / [ ] FAIL

---

## Full Production Backfill (Optional, 40–50 minutes)

**Only run this if all smoke tests pass.**

```bash
ssh root@$VINAHOST_IP

# Full config (30 stocks × 8 quarters = 240 PDFs)
cat > /tmp/full-bctc.sh <<'EOF'
#!/bin/bash
STOCKS=(VNM BID VIC VHM GAS MWG PNJ FPT TCB TPB HDB BVH PLC NVL KDC)
YEARS=(2025 2024 2023 2022 2021 2020 2019 2018)
QUARTERS=(Q1 Q2 Q3 Q4)

TOTAL=0
DISCOVERED=0

for STOCK in "${STOCKS[@]}"; do
  for YEAR in "${YEARS[@]}"; do
    for QTR in "${QUARTERS[@]}"; do
      TOTAL=$((TOTAL + 1))
      RESULT=$(python3 /root/discover-bctc-urls-browser.py "$STOCK" "$YEAR" "$QTR")

      if echo "$RESULT" | grep -q '"url".*https'; then
        DISCOVERED=$((DISCOVERED + 1))
        echo "[OK] $STOCK $YEAR-$QTR"
      else
        echo "[SKIP] $STOCK $YEAR-$QTR"
      fi

      sleep 1  # Rate limit
    done
  done
done

echo "=== STATS ==="
echo "Total jobs: $TOTAL"
echo "Discovered: $DISCOVERED"
echo "Success rate: $(echo "scale=2; $DISCOVERED * 100 / $TOTAL" | bc)%"
EOF

chmod +x /tmp/full-bctc.sh

# Run in background (will take ~50 minutes)
nohup /tmp/full-bctc.sh > /tmp/bctc-full.log 2>&1 &
BG_PID=$!
echo "Started background job: PID $BG_PID"

# Monitor progress (in another terminal)
tail -f /tmp/bctc-full.log
```

**Success Criteria:**
- [ ] Discovery rate ≥80% (≥192 of 240 PDFs found)
- [ ] No Python crashes
- [ ] No timeout errors
- [ ] Completes in ~40–50 minutes

---

## Post-Deployment Checklist

- [ ] Python script deployed and executable
- [ ] Playwright + Chromium installed
- [ ] Smoke tests all passing (5/5)
- [ ] Background test completed (if run)
- [ ] VPS network stable (no timeout errors)
- [ ] Logs clear and readable

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'playwright'"

**Fix:**
```bash
pip3 install playwright
python3 -m playwright install chromium
```

### Issue: "Error: Chromium revision not found"

**Fix:**
```bash
python3 -m playwright install chromium --with-deps
```

### Issue: Timeout on portal (>30s)

**Cause:** Portal slow or network latency
**Fix:** Normal behavior, script waits up to 30s then tries next portal

### Issue: No PDFs found (always `"url": null`)

**Cause:** Portal HTML structure changed or requires login
**Action:** Check if portal is accessible manually, report to team

### Issue: VPS memory spike during background run

**Cause:** Chromium using memory for multiple concurrent processes
**Action:** Run sequentially with sleep (already in scripts), or increase VPS RAM

---

## Support

**Questions?** Read:
- `/reports/TASK_REPORT_BCTC_VPS_VALIDATION.md` — Complete validation procedures
- `/docs/handoffs/TASK_1289f.md` — Full task context
- `/EXECUTIVE_SUMMARY_BCTC_FIX.md` — Technical overview

**Issues?** Contact:
- QA: Claude Code (QA Agent) — Code quality questions
- Architect: For technical design questions
- PM: For deployment timeline and approval

---

## Sign-Off

**Ops Owner Name:** _______________________

**Date Completed:** _______________________

**All Tests Passed?** [ ] YES [ ] NO

**Ready for Production?** [ ] YES [ ] NO

**Notes/Issues:**
```
[Space for any notes or problems encountered]
```

---

**QA Approval:** ✅ APPROVED FOR VPS DEPLOYMENT
**Date:** 2026-04-23
**Reviewer:** Claude Code (Haiku 4.5)

---

**Next Step After This Checklist:** PM final approval for production integration.
