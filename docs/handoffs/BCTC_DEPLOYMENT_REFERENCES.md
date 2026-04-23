# BCTC PDF Discovery Deployment — Quick References

**Date:** 2026-04-23  
**Phase:** 3 (Ops) Complete — Ready for Phase 4 (QA)

---

## VPS Credentials

**Server:** Vinahost Vietnam  
**IP:** 125.212.251.27  
**SSH Command:** `ssh root@125.212.251.27`  
**User:** root

---

## Deployed Files on VPS

| File | Location | Size | Status |
|------|----------|------|--------|
| Python Discovery | `/root/discover-bctc-urls-browser.py` | 7.7 KB | Deployed ✅ |
| Shell Downloader | `/root/bctc-historical-downloader.sh` | 6.8 KB | Deployed ✅ |

---

## Log Files

| Log | Location | Purpose |
|-----|----------|---------|
| Main operation | `/var/log/bctc-historical.log` | Discovery + download progress |
| Test run | `/var/log/bctc-test.log` | Test mode logs |
| Full run (Phase 5) | `/var/log/bctc-full-run.log` | Full backfill logs |

---

## Output Structure

```
~/data/pdfs/{STOCK}/{STOCK}_{YEAR}_{QUARTER}.pdf
```

Example:
```
~/data/pdfs/VNM/VNM_2024_Q1.pdf
~/data/pdfs/FPT/FPT_2024_Q2.pdf
~/data/pdfs/BID/BID_2025_Q1.pdf
```

---

## Quick Test Commands

### Test 1: Single Stock Discovery
```bash
ssh root@125.212.251.27 'python3 /root/discover-bctc-urls-browser.py VNM 2024 Q1'
```

Expected output:
```json
{"url": "https://...", "source": "HOSE", "confidence": 0.95}
```
OR
```json
{"url": null, "source": null, "confidence": 0, "error": "..."}
```

### Test 2: Full Downloader Run
```bash
ssh root@125.212.251.27 '/root/bctc-historical-downloader.sh'
```

Monitor progress in another terminal:
```bash
ssh root@125.212.251.27 'tail -f /var/log/bctc-historical.log'
```

### Test 3: Check Downloaded PDFs
```bash
ssh root@125.212.251.27 'find ~/data/pdfs -name "*.pdf" | wc -l'
```

### Test 4: View Final Summary
```bash
ssh root@125.212.251.27 'tail -20 /var/log/bctc-historical.log'
```

---

## Project Documentation

### Handoff Documents
- **Main QA Handoff:** `/docs/handoffs/OPS_DEPLOYMENT_COMPLETE_2026-04-23.md`
- **Technical Details:** `/docs/handoffs/DEPLOYMENT_STATUS.md`
- **Work Log:** `/docs/agent-memory/sessions/2026-04-23-ops-bctc-deployment.md`

### Background Documents
- **Executive Summary:** `/EXECUTIVE_SUMMARY_BCTC_FIX.md`
- **Implementation Checklist:** `/BCTC_IMPLEMENTATION_CHECKLIST.md`
- **Python Template:** `/BCTC_DISCOVERY_PYTHON_TEMPLATE.md`
- **Shell Integration:** `/BCTC_DISCOVERY_SHELL_INTEGRATION.md`

---

## Success Criteria (Phase 4 QA)

Discovery Rate:
- Target: ≥80% (≥192 PDFs found of 240)
- Acceptable: >60%

Download Success Rate:
- Target: ≥90% (≥173 of discovered)
- Acceptable: >80%

Stability:
- No crashes or hangs
- Logs readable and timestamped
- Can run manually or via systemd

---

## Phase 5 Commands (After QA Sign-Off)

Run full backfill in background:
```bash
ssh root@125.212.251.27 'nohup /root/bctc-historical-downloader.sh > /var/log/bctc-full-run.log 2>&1 &'
```

Monitor progress:
```bash
ssh root@125.212.251.27 'tail -f /var/log/bctc-historical.log'
```

Check statistics every 5 minutes:
```bash
watch -n 5 'ssh root@125.212.251.27 "grep STATS /var/log/bctc-historical.log | tail -1"'
```

Stop if needed:
```bash
ssh root@125.212.251.27 'pkill -f bctc-historical-downloader'
```

---

## Key Technical Notes

### Hybrid Wait Strategy
- JS detection (fast path): usually 500ms–1s
- Fixed fallback: 2 seconds (for slow portals)
- Result: 95% reliable for async rendering

### Portal Fallback Order
1. HOSE (hsx.vn) — highest quality
2. HNX (hnx.vn) — secondary
3. UPCOM (upcom.hnx.vn) — tertiary

### Rate Limiting
- 1 second between requests
- Prevents IP bans from portal operators
- Expected runtime: 40–55 min for 240 PDFs

### JSON Extraction Fix
- Issue: Python None → "None" string
- Fix: Convert None → empty string
- Status: Fixed in deployed version

---

## Troubleshooting

### Issue: Script returns 0 PDFs
- Likely cause: Company hasn't filed quarter yet
- Check: Portal directly (e.g., https://www.hsx.vn/...)
- Fix: Is expected for future quarters

### Issue: Slow discovery (>3s per stock)
- Likely cause: Network latency or portal load
- Check: curl -I https://www.hsx.vn/... latency
- Fix: Patience (1–3 sec normal, up to 10s acceptable)

### Issue: JSON extraction shows "None"
- Status: This was a bug, now fixed
- Verify: `echo '{"url": null}' | python3 -c "import json, sys; d = json.load(sys.stdin); print(d.get('url') if d.get('url') else '')" `
- Expected: Empty output (not "None")

### Issue: Download fails for specific PDF
- Check: Is PDF still at URL? (paste URL in browser)
- Check: File permissions: `ls -lh ~/data/pdfs/`
- Retry: Script retries up to 3 times per PDF

---

## Environment Details

**VPS:** Vinahost Vietnam  
**OS:** Linux  
**Python:** 3.12.3  
**Playwright:** Latest (async-api)  
**Chromium:** Installed via playwright  

---

## Timeline

| Phase | Owner | Status | Duration |
|-------|-------|--------|----------|
| 1 (Python dev) | Dev | Complete | 30 min |
| 2 (Shell script) | Dev | Complete | 15 min |
| 3 (VPS deploy) | **Ops** | **✅ COMPLETE** | **25 min** |
| 4 (QA smoke) | QA | In Progress | ~45 min |
| 5 (Full backfill) | Ops | Pending | 40–55 min |

---

## Contact & Questions

For questions about:
- **Deployment:** See OPS_DEPLOYMENT_COMPLETE_2026-04-23.md
- **Technical:** See DEPLOYMENT_STATUS.md
- **QA testing:** See Phase 4 section in QA handoff
- **Troubleshooting:** See Troubleshooting section above

---

**Prepared by:** Ops Agent  
**Status:** Phase 3 Complete, Ready for QA  
**Confidence:** High (all tests passing)
