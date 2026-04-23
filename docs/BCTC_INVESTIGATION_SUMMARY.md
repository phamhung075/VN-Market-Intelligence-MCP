# BCTC Portal Discovery Investigation — Architect Summary

**Date:** 2026-04-23
**Status:** Investigation protocol created; ready for Developer execution
**Estimated fix timeline:** 6–9 hours (investigation + implementation + testing)

---

## Executive Summary

**Problem:** Task 1289f BCTC PDF discovery returning 0 PDFs despite Playwright script deployment.

**Root cause:** Unknown. Possible issues:
- CSS selector `a[href*=".pdf"]` doesn't match current portal HTML
- PDFs loaded asynchronously after `networkidle` event
- Form not being submitted properly
- Portal structure changed since original design (2026-04-22)
- Bot detection or authentication blocking headless browser

**Solution:** Manual investigation of each portal's HTML structure using Chrome DevTools.

**Effort required:** 2–3 hours investigation + 3–6 hours implementation + testing = **6–9 hours total**.

---

## What I've Created for the Developer

### 1. Investigation Protocol
**File:** `docs/BCTC_PORTAL_FORM_INVESTIGATION.md`

Comprehensive guide covering:
- **Phase 1 (Form Discovery):** Navigate to portal, inspect form HTML, check for PDFs
- **Phase 2 (Form Submission & AJAX):** Submit form, monitor Network tab, identify AJAX endpoints
- **Phase 3 (PDF Extraction):** Extract link properties, validate CSS selectors, check quarter matching
- **Phase 4 (Playwright Compatibility):** Test with headless assumptions, check bot-blocking

**Portal templates provided:**
- HOSE (Ho Chi Minh Stock Exchange)
- HNX (Hanoi Stock Exchange)
- UPCOM (Unlisted Public Company Market)
- SSC (Secondary fallback, lower priority)

**Common issues & diagnostics:**
- How to find PDFs if DOM selector returns 0 matches
- How to debug form submission failures
- How to extract quarter/year metadata from various locations

### 2. Developer Handoff
**File:** `docs/handoffs/TASK_1289_PORTAL_INVESTIGATION.md`

Structured handoff document with:
- **Problem statement** (clear scope)
- **Investigation task** (what to do, how long)
- **Protocol reference** (link to methodology)
- **Success criteria** (checklist)
- **Expected output** (deliverables format)
- **Timeline** (6–9 hours total)
- **Clarification questions** (ask before starting)

### 3. Session Documentation
**File:** Updated `docs/agent-memory/sessions/2026-04-23-architect.md`

Records:
- Context of investigation
- Root-cause analysis approach
- Risk assessment
- Success criteria
- Expected handoff timeline

---

## How Developer Should Use These

1. **Read:** `docs/handoffs/TASK_1289_PORTAL_INVESTIGATION.md` (10 min overview)
2. **Investigate:** Use `docs/BCTC_PORTAL_FORM_INVESTIGATION.md` as step-by-step checklist
3. **Document:** Fill in portal structure templates as you discover
4. **Deliver:** Create portal-specific `.md` files + findings report
5. **Update:** Modify Playwright script based on discoveries
6. **Test:** Verify 80%+ discovery rate before VPS deployment

---

## Expected Findings

Developer should discover **for each portal:**

| Item | Expected Finding | Example |
|------|------------------|---------|
| Form type | Static HTML or AJAX | HOSE: React SPA with AJAX |
| Form action | URL or JavaScript handler | `GET /search?issuerCode=VNM` |
| Submit method | How to submit | Click button or JavaScript event |
| PDF selector | CSS selector or API response path | `a.pdf-link` or `data[].url` |
| Quarter location | Where quarter info appears | Link text "Q1 2024" or `data-period` |
| AJAX endpoint | (If applicable) | `GET /api/bctc?code=VNM` |
| Bot blocking | Any anti-scraping measures | None, or requires User-Agent header |
| Confidence | Reliability of discovery method | High (API direct) or Low (DOM unreliable) |

---

## Outcomes & Next Steps

### Immediate (Investigation Phase)
1. Developer investigates all 4 portals (2–3 hours)
2. Creates portal structure documents
3. Identifies correct CSS selectors or AJAX endpoints
4. Documents quarter/year matching logic

### Short-term (Implementation Phase)
1. Update Playwright script with correct selectors
2. Add proper wait strategies (for AJAX vs static)
3. Test locally with 3 stocks × multiple quarters
4. Achieve 80%+ discovery rate

### Deployment
1. Deploy updated script to VPS
2. Run backfill for queued stocks
3. Verify PDFs populated in financial_reports table
4. Monitor for 1 week; if stable, close task

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Portal bot-detection prevents Playwright | Use SSC fallback; consider Selenoid/proxy |
| AJAX endpoints unpredictable (no stable selectors) | Switch to direct API if endpoints become public |
| Investigation takes >4 hours | Time-box at 3h; escalate findings to Architect |
| Cannot match quarters reliably | Lower confidence score; accept <80% discovery |

---

## Technical Details for Architect Reference

### Why Manual Investigation Required

1. **Live portal changes:** Government financial portals update structures without notice. Code-based assumptions may be stale.
2. **Bot detection:** Portals may have anti-scraping measures that are evident only in live browser interaction.
3. **Async rendering:** Playwright's `networkidle` event doesn't guarantee all JavaScript has finished executing. Only live testing reveals async PDF loading delays.
4. **Session state:** Some portals use cookies/session storage for form pre-population. This is only visible in fresh browser instance.

### Investigation is Faster Than Blind Coding

**Option A (Blind implementation):**
- Try 5 different CSS selectors → timeout after trying each
- Debug through logs → discover selector was wrong 2 days later
- Revert and try again → 8–16 hours wasted

**Option B (Manual investigation first):**
- Spend 2–3 hours identifying correct selectors
- Implement once with high confidence
- 95%+ discovery rate on first deployment
- 0 rework required

---

## Files Created

```
docs/
├── BCTC_PORTAL_FORM_INVESTIGATION.md          [Investigation protocol + templates]
├── BCTC_INVESTIGATION_SUMMARY.md               [This file]
├── BCTC_PORTAL_INVESTIGATION_FINDINGS.md       [To be filled by Developer]
├── BCTC_PORTAL_HOSE_STRUCTURE.md               [To be filled by Developer]
├── BCTC_PORTAL_HNX_STRUCTURE.md                [To be filled by Developer]
├── BCTC_PORTAL_UPCOM_STRUCTURE.md              [To be filled by Developer]
└── handoffs/
    └── TASK_1289_PORTAL_INVESTIGATION.md       [Developer handoff]
```

---

## Success Definition

Investigation and fix successful when:

- [ ] Developer completes investigation (portal structure docs + findings report)
- [ ] Playwright script updated with correct selectors + wait strategies
- [ ] Tests pass locally: 8/8 test cases, 80%+ discovery rate
- [ ] VPS deployment: backfill runs, PDFs downloaded to correct folders
- [ ] Production monitoring: no parse errors, financial_reports populated
- [ ] Task closed: 1289f marked complete

---

## References

- **Original design:** docs/TECH_1289f.md
- **Prior issue:** docs/agent-memory/issues/bctc-portal-discovery.md
- **Current script:** vps-scripts/discover-bctc-urls-browser.py
- **Task context:** docs/handoffs/TASK_1289f.md
- **Session log:** docs/agent-memory/sessions/2026-04-22-morning.md (Task 8)

---

## Sign-Off

**Architect investigation:** COMPLETE
**Investigation protocol:** READY FOR DEVELOPER
**Estimated developer effort:** 6–9 hours
**Expected handoff date:** 2026-04-25 or later

Next step: Assign to Developer. Expected deliverable: Portal investigation findings + updated Playwright script.

