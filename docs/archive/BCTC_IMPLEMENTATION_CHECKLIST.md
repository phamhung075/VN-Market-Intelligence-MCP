# BCTC Portal Discovery — Implementation Checklist

**For:** Dev, Ops, QA (phases in order)
**Start:** 2026-04-23 06:00 UTC
**Target completion:** 2026-04-23 08:00 UTC

---

## ✅ Pre-Work (Architect — COMPLETE)

- [x] Identified root cause (async JS rendering, networkidle too early)
- [x] Validated solution (wait_for_function + fallback delay)
- [x] Created implementation templates (Python + Shell)
- [x] Documented deployment strategy
- [x] Updated agent memory (session log)

**Duration:** 2 hours (completed 2026-04-23 06:00 UTC)

---

## 🔄 Phase 1: Developer — Create Python Discovery Script

**Time:** 30 minutes
**Owner:** Developer
**Start:** 2026-04-23 06:15 UTC

### Tasks

- [ ] Read `BCTC_DISCOVERY_PYTHON_TEMPLATE.md` (10 min)
- [ ] Create `/root/discover-bctc-urls-browser.py` on local machine (15 min)
  - Copy template code from document
  - Verify syntax: `python3 -m py_compile discover-bctc-urls-browser.py`
- [ ] Test locally (if you have VN IP or VPN) (5 min)
  - `python3 discover-bctc-urls-browser.py VNM 2025 Q4`
  - Expected: `{"url": "https://...", "source": "HOSE", "confidence": 0.95}`

### Acceptance Criteria

- [ ] Python script runs without syntax errors
- [ ] Script outputs valid JSON on stdout
- [ ] Script handles missing Playwright gracefully (error message)
- [ ] No hardcoded URLs or credentials in code

### Blockers

- ⚠️ Can't test if not on VN IP (will timeout on portal fetch)
  - **Workaround:** Ops will test on VPS (Vietnam IP)

**Checklist for Dev:**
```bash
# Before committing
python3 -m py_compile /root/discover-bctc-urls-browser.py
echo "Import test:" && python3 -c "import asyncio; print('OK')"
echo "Script ready for Ops"
```

---

## 🔄 Phase 2: Developer — Update Shell Script

**Time:** 15 minutes
**Owner:** Developer
**Start:** 2026-04-23 06:45 UTC (after Phase 1)

### Tasks

- [ ] Read `BCTC_DISCOVERY_SHELL_INTEGRATION.md` (5 min)
- [ ] Create `/root/bctc-historical-downloader.sh` (10 min)
  - Copy full script from document
  - Verify syntax: `bash -n bctc-historical-downloader.sh`
- [ ] Create local test version with 1 stock (optional, 5 min)
  - Helps catch shell syntax issues before VPS deployment

### Acceptance Criteria

- [ ] Shell script has no syntax errors
- [ ] Script calls Python discovery script (line with `discover_pdf_url()`)
- [ ] Calls JSON extraction helper (`extract_pdf_url_from_json()`)
- [ ] Creates `data/pdfs/{CODE}/` folder structure
- [ ] Logs all actions to `/var/log/bctc-historical.log`

**Checklist for Dev:**
```bash
# Before handing to Ops
bash -n /root/bctc-historical-downloader.sh
grep "discover_pdf_url" /root/bctc-historical-downloader.sh  # Should find it
grep "extract_pdf_url_from_json" /root/bctc-historical-downloader.sh
echo "Shell script ready for Ops"
```

---

## 🔄 Phase 3: Ops — Deploy to VPS

**Time:** 15 minutes
**Owner:** Ops
**Start:** 2026-04-23 07:00 UTC (after Phase 2)

### Prerequisites

- [ ] Have SSH access to VPS (`$VINAHOST_IP`)
- [ ] VPS running (check: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`)
- [ ] Python 3.9+ on VPS (check: `ssh root@$VINAHOST_IP 'python3 --version'`)

### Tasks

- [ ] SSH to VPS: `ssh root@$VINAHOST_IP`
- [ ] Install Playwright: `pip3 install playwright && python3 -m playwright install chromium` (5 min)
  - This is one-time setup; will take 3–5 minutes
- [ ] Copy Python script from Dev: `scp /root/discover-bctc-urls-browser.py root@$VINAHOST_IP:/root/`
- [ ] Copy Shell script from Dev: `scp /root/bctc-historical-downloader.sh root@$VINAHOST_IP:/root/`
- [ ] Make executable: `ssh root@$VINAHOST_IP 'chmod +x /root/discover-bctc-urls-browser.py /root/bctc-historical-downloader.sh'`

### Verification

- [ ] Test Python discovery (1 stock):
  ```bash
  ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4'
  # Expected: {"url": "https://...", "source": "HOSE", "confidence": 0.95}
  ```
- [ ] Check portal is accessible:
  ```bash
  ssh root@$VINAHOST_IP 'curl -I https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM'
  # Expected: HTTP/2 200
  ```

### Acceptance Criteria

- [ ] Python script returns valid JSON (not errors)
- [ ] Discovery completes in <5 seconds
- [ ] Portal returns 200 status (accessible)

---

## 🔄 Phase 4: QA — Smoke Test (3 Stocks, 8 Quarters Each)

**Time:** 30 minutes
**Owner:** QA
**Start:** 2026-04-23 07:15 UTC (after Phase 3)

### Task 1: Test Single Stock (5 min)

```bash
ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py VNM 2025 Q4'

# Acceptance: Returns {"url": "https://...", "source": "HOSE", "confidence": 0.95}
# Log: Check for success message, no timeouts
```

### Task 2: Test Portal Fallback (10 min)

```bash
# Test HNX portal (if VNM not on HNX, try FPT)
ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py FPT 2025 Q4'

# Acceptance: Returns {"url": "https://...", "source": "HNX", "confidence": 0.9}

# Test UPCOM portal (try a small-cap stock)
ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py KDC 2025 Q4'

# Acceptance: Returns {"url": "https://...", "source": "UPCOM", "confidence": 0.85}
```

### Task 3: Test Error Handling (5 min)

```bash
# Test non-existent stock
ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py BADCODE 2025 Q4'

# Acceptance: Returns {"url": null, "source": null, "confidence": 0, "error": "..."}

# Test old quarter (may not exist)
ssh root@$VINAHOST_IP 'python3 /root/discover-bctc-urls-browser.py VNM 2020 Q1'

# Acceptance: Either returns URL or null (no crash)
```

### Task 4: Test Shell Script (10 min)

```bash
ssh root@$VINAHOST_IP 'bash /root/bctc-historical-downloader.sh'

# Monitor progress
ssh root@$VINAHOST_IP 'tail -f /var/log/bctc-historical.log'

# Expected: Processes 1–3 stocks (demo run), shows discovery rate >80%
```

### Acceptance Criteria

- [ ] All 4 tests pass without errors
- [ ] No Python crashes or timeouts
- [ ] Shell script logs are readable and show progress
- [ ] JSON outputs are valid

---

## 🔄 Phase 5: Ops — Full Run (30 Stocks × 8 Quarters)

**Time:** 40 minutes (background, can be parallelized)
**Owner:** Ops
**Start:** 2026-04-23 07:45 UTC (after QA sign-off)

### Task

```bash
ssh root@$VINAHOST_IP

# Start full downloader in background
nohup /root/bctc-historical-downloader.sh > /var/log/bctc-full-run.log 2>&1 &

# Monitor progress (in another terminal)
tail -f /var/log/bctc-historical.log
```

### Monitoring

```bash
# Check progress every 5 minutes
watch -n 5 'grep "STATS" /var/log/bctc-historical.log | tail -1'

# Expected output (after ~40 min):
# [2026-04-23T08:00:00Z] [STATS] Total: 240 | Discovered: 192+ | Downloaded: 173+ | Failed: <5 | Skipped: <62
```

### Success Criteria

- [ ] Discovery rate ≥80% (≥192 PDFs found of 240)
- [ ] Download rate ≥90% (≥173 PDFs downloaded)
- [ ] Failed downloads <5
- [ ] No script crashes or hangs
- [ ] Total runtime ~40 min (30 stocks × 1s rate limit)

### Verify Results

```bash
# Check PDF folder structure
ssh root@$VINAHOST_IP 'ls -lh ~/data/pdfs/ | head -20'

# Count PDFs
ssh root@$VINAHOST_IP 'find ~/data/pdfs -name "*.pdf" | wc -l'
# Expected: 173+ files

# Check file sizes (should be 500KB–5MB for BCTC PDFs)
ssh root@$VINAHOST_IP 'find ~/data/pdfs -name "*.pdf" -exec du -h {} \; | head -10'
```

---

## 📋 Daily Operations (Post-Implementation)

### Option A: Manual Daily Run

```bash
ssh root@$VINAHOST_IP '/root/bctc-historical-downloader.sh'
```

### Option B: Systemd Timer (Recommended)

Create timer on VPS (Ops):
```bash
# Deploy timer configs (see BCTC_DISCOVERY_SHELL_INTEGRATION.md)
scp vn-bctc-historical.service root@$VINAHOST_IP:/etc/systemd/system/
scp vn-bctc-historical.timer root@$VINAHOST_IP:/etc/systemd/system/

ssh root@$VINAHOST_IP 'systemctl daemon-reload && systemctl enable --now vn-bctc-historical.timer'

# Verify
ssh root@$VINAHOST_IP 'systemctl status vn-bctc-historical.timer'
```

---

## 🎯 Final Checklist (After All Phases)

- [ ] **Dev:** Python script tested locally (no syntax errors)
- [ ] **Dev:** Shell script tested locally (no syntax errors)
- [ ] **Ops:** Scripts deployed to VPS and executable
- [ ] **Ops:** Playwright installed on VPS
- [ ] **QA:** Smoke test passed (3 portals, error handling)
- [ ] **Ops:** Full run completed (240 stocks × 8 quarters)
- [ ] **Ops:** 173+ PDFs in `~/data/pdfs/` structure
- [ ] **Ops:** Logs show >80% discovery, >90% download success

---

## Timeline Summary

| Time | Phase | Owner | Status |
|------|-------|-------|--------|
| 06:00 | Pre-work (done) | Architect | ✅ Complete |
| 06:15–06:45 | Python dev | Dev | 🔄 In Progress |
| 06:45–07:00 | Shell script | Dev | ⏳ Pending |
| 07:00–07:15 | Deploy to VPS | Ops | ⏳ Pending |
| 07:15–07:45 | QA smoke test | QA | ⏳ Pending |
| 07:45–08:25 | Full run (background) | Ops | ⏳ Pending |
| 08:25 | **COMPLETE** | All | 📅 Target |

---

## Rollback Plan (If Issues)

If anything fails during full run:

1. **Stop immediately:** `pkill -f bctc-historical-downloader`
2. **Check logs:** `tail -100 /var/log/bctc-historical.log`
3. **Identify issue:** Python not installed? Portal unreachable? Shell syntax?
4. **Fix** the underlying issue
5. **Re-run:** `bash /root/bctc-historical-downloader.sh` (will resume from where it left off)

---

## Questions During Implementation?

| Issue | Contact | Reference |
|-------|---------|-----------|
| Python syntax or Playwright | Dev lead | `BCTC_DISCOVERY_PYTHON_TEMPLATE.md` |
| Shell script integration | Ops lead | `BCTC_DISCOVERY_SHELL_INTEGRATION.md` |
| Why this approach works | Architect | `BCTC_ASYNC_RENDERING_INVESTIGATION.md` |
| Quick overview | PM | `BCTC_PORTAL_FIX_SUMMARY.md` |

---

**Prepared by:** Architect
**Status:** Ready for Dev/Ops/QA
**Last updated:** 2026-04-23 06:00 UTC
