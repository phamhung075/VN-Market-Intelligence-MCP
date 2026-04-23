# Handoff: BCTC Portal Form Investigation & Root-Cause Analysis

**Architect to Developer**
**Date:** 2026-04-23
**Task:** Root-cause analysis for Task 1289f failure (0 PDFs discovered)

---

## Problem Statement

**Status:** Task 1289f (BCTC PDF discovery via Playwright) deployed but returning 0 PDFs on backfill

**Current script:** `vps-scripts/discover-bctc-urls-browser.py`
- Uses Playwright browser automation to navigate HOSE/HNX/UPCOM portals
- CSS selector `a[href*=".pdf"]` returns 0 matches
- Script runs without errors (no exceptions caught)
- Likely causes: wrong selectors, form not submitted, PDFs loaded after networkidle

**Root-cause unknown:** Need manual investigation of actual portal HTML structure and form submission patterns

---

## Your Investigation Task

### Scope

Reverse-engineer 4 Vietnamese stock exchange portals to understand:
1. How their search forms work (HTML vs AJAX)
2. Where PDF download links appear
3. How to extract quarter/year metadata
4. Which CSS selectors match PDF links reliably

### Portals to investigate

| Portal | Primary URL | Fallback | Priority |
|--------|------------|----------|----------|
| HOSE | https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VNM | Direct link | 1 (HIGH) |
| HNX | https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM | Tabs | 2 (HIGH) |
| UPCOM | https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=VNM | Same as HNX | 3 (MEDIUM) |
| SSC | https://congbothongtin.ssc.gov.vn/faces/NewsSearch | Search form | 4 (LOW) |

### Tools you'll need

- **Chrome/Firefox with DevTools** (F12)
- **Tabs to monitor:** Elements, Network, Console
- **Test stocks:** VNM (Vietcombank), BID (BIDV), HPG (Hoa Phat) — these are liquid, all portals have data
- **Time:** ~2–3 hours total (30 min per portal)

---

## Investigation Protocol (Use This)

See: **`docs/BCTC_PORTAL_FORM_INVESTIGATION.md`**

This document provides:
- Step-by-step investigation methodology (4 phases per portal)
- Form structure discovery checklist
- AJAX detection procedures
- PDF extraction strategies
- Portal-specific investigation templates

**You should:**
1. Open the investigation document in your browser (or print it)
2. For each portal, follow Phase 1–4 systematically
3. Fill in the portal-specific templates as you investigate
4. Screenshot key findings (form, Network requests, DOM structure)
5. Document your findings

---

## What to Discover

For **each portal**, you need to answer:

| Question | Why It Matters | Example Answer |
|----------|----------------|-----------------|
| Is there a form? | Need to know how to submit search | Yes, `<form action="/search">` |
| How to submit? | GET/POST parameter names | `?issuerCode=VNM&year=2024` |
| Are PDFs static or dynamic? | Affects wait strategy | AJAX: waits for `#pdf-list` |
| What CSS selector finds PDFs? | Core to DOM parsing | `a.pdf-link` or `tr > td > a[href*=".pdf"]` |
| How to identify quarter? | Filters out wrong quarters | Text: "Q1 2024", Attr: `data-quarter="Q1"` |
| Any bot-blocking? | May need special headers | Blocks headless Chrome → needs User-Agent |

---

## Expected Output

Once investigation complete, create:

### 1. Portal Structure Files

Create for each portal: `docs/BCTC_PORTAL_<NAME>_STRUCTURE.md`

**Template:**
```markdown
# BCTC Portal Structure — [HOSE|HNX|UPCOM|SSC]

## Quick Facts
- URL: ...
- Form type: Static / AJAX / SPA
- PDF selector: ...
- Confidence: High / Medium / Low
- Investigated: [Date], [Your name]

## Form Structure
[HTML snippet of form]
[Parameters: issuerCode, year, quarter, ...]

## PDF Discovery
- Selector: `a[href*=".pdf"]`
- Quarter pattern: "Q1 2024" matches regex `\bQ\d\s+\d{4}\b`
- Link pattern: `/download/BCTC_Q1_2024.pdf`

## AJAX Details (if applicable)
- Endpoint: `GET /api/bctc?code=VNM`
- Response: JSON with `pdfs: [{url, title}]`

## Known Issues
- [Any blocking issues, rate limits, etc.]

## Test Plan for Playwright
[How Playwright script should navigate]
```

### 2. Master Findings Document

Update: **`docs/BCTC_PORTAL_INVESTIGATION_FINDINGS.md`**

```markdown
# BCTC Portal Investigation Findings (2026-04-23)

## Summary Table

| Portal | Form Type | PDF Selector | Confidence | Status |
|--------|-----------|--------------|-----------|--------|
| HOSE | AJAX | `.pdf-link` | HIGH | Ready |
| HNX | Static | `a[href*=".pdf"]` | HIGH | Ready |
| UPCOM | Same HNX | `a[href*=".pdf"]` | HIGH | Ready |
| SSC | Form | ... | MEDIUM | Fallback |

## Per-Portal Analysis

### HOSE
[Findings from investigation]

### HNX
[Findings from investigation]

### UPCOM
[Findings from investigation]

### SSC
[Findings from investigation]

## Key Insights
[What you learned that wasn't obvious]
```

### 3. Updated Playwright Script Plan

Document required changes to `vps-scripts/discover-bctc-urls-browser.py`:

```markdown
# Script Update Requirements

## HOSE Function
- Before: `await page.query_selector_all('a[href*=".pdf"]')`
- After: `await page.wait_for_selector('...')` then query
- Reason: [Your finding about async loading]

## HNX Function
- Change: [Documented finding]

## Quarter Matching
- Current regex: `\bQ\d\s+\d{4}\b`
- Should handle: "quý 1 2024", "Q1-2024", etc.
- Test with: [Examples from portal]

## Test Cases to Add
- [Stocks that should work]
- [Edge cases: old quarters, multiple listings]
```

---

## Success Criteria

Investigation is complete when:

- [ ] All 4 portals investigated (or 3 if SSC deemed unnecessary)
- [ ] Form submission method documented
- [ ] Working CSS selectors identified for PDF links
- [ ] Quarter/year extraction method confirmed
- [ ] AJAX endpoints (if any) captured in Network tab
- [ ] Screenshots attached showing form + Network tab
- [ ] Test plan written for Playwright updates
- [ ] Confidence level ≥70% (ready to implement)

---

## Deliverables for Architect Review

1. **Portal structure documents:** 3–4 `.md` files
2. **Master findings document:** 1 `.md` file
3. **Screenshots:** 10–20 (form, Network requests, DOM inspection)
4. **Script update requirements:** 1 document with pseudo-code
5. **Time log:** how long each portal took

---

## Next Steps (After Investigation)

Once you complete investigation:

1. **Create TECH document** (`docs/TECH_1289_PORTAL_REMEDIATION.md`)
   - Your findings + how they affect the implementation
   - Which portals need DOM parsing vs direct API
   - Updated architecture + risk assessment

2. **Update Playwright script**
   - Fix CSS selectors per portal
   - Add proper wait strategies
   - Handle AJAX vs static content
   - Improve quarter matching

3. **Test locally**
   - Mock Playwright with your findings
   - Test 3 stocks × 3 portals × 2 quarters
   - Verify 80%+ discovery rate

4. **Deploy to VPS**
   - Replace script on VPS
   - Run backfill for 10 test stocks
   - Verify PDFs downloaded to correct folders

---

## Tools & Resources

| Tool | Link | Purpose |
|------|------|---------|
| Investigation template | `docs/BCTC_PORTAL_FORM_INVESTIGATION.md` | Structured checklist |
| Current Playwright impl | `vps-scripts/discover-bctc-urls-browser.py` | Reference for what's working/failing |
| Task context | `docs/handoffs/TASK_1289f.md` | Original requirements |
| Issue analysis | `docs/agent-memory/issues/bctc-portal-discovery.md` | Prior findings (Option B failed) |

---

## Estimated Timeline

- **Investigation (4 portals):** 2–3 hours
- **Documentation:** 1 hour
- **Script updates:** 2–3 hours
- **Testing:** 1–2 hours
- **Total:** 6–9 hours (contingent on portal complexity)

---

## Questions for Architect Before You Start

Before diving in, clarify:

1. **Test stocks:** Should I use only VNM/BID/HPG, or different per portal?
2. **Quarters:** Should I test only Q4 2024/Q1 2025, or all 8 quarters?
3. **Bot detection:** If a portal blocks Playwright, should I research workarounds or escalate?
4. **SSC fallback:** How much time on SSC? It's a government portal (complex forms), might need separate approach.

---

## Sign-Off

**Architect approval:** Ready to investigate
**Developer assignment:** Assign when ready
**Expected handoff:** 2026-04-24 or 2026-04-25

---

## References

- **TECH-1289f:** Original design (browserautomation approach)
- **Issue: bctc-portal-discovery.md:** Prior findings + Option B failure analysis
- **GitHub commits:**
  - `0d1e0424` — Original Playwright deployment
  - `e78b355f` — Revert from Option B API to Option A Playwright
  - `0913c44d` — Initial browser discovery implementation
