---
sprint: BCTC-REFINE-STALL-RETRIGGER
branch: task/BCTC-REFINE-B2-vic-discovery-fix
size: S
zone: vps-scripts/
type: SPRINT-S
priority: P2
depends_on: [BCTC-REFINE-B1]
blocks: []
---

## TLDR

Based on findings from BCTC-REFINE-B1 (RAW-probe of VIC queue status), implement a structural fix for VIC's discovery gap. The fix depends on which root-cause hypothesis is confirmed:

- **If C-1 confirmed (PDF not in SSC index):** Implement re-discovery sweep that resets `url_not_found` rows for tickers still missing from `financial_reports` after a configurable window (e.g., 30 days post-earnings-season).
- **If C-3 confirmed (SSC title-match regex fails on Vingroup's format):** Fix the Vietnamese title-match regex in `vps-scripts/discover-bctc-urls-browser.py` to handle Vingroup's filing title format.
- **If C-2 (batch-size cap):** Documented in brief but likely resolved by subsequent enricher runs; no code change needed.

## [PM] Planning Context

- **Zone:** `vps-scripts/` (Python discovery script + deployment)
- **Type:** SPRINT-S (lean fix, depends on B1 diagnosis)
- **Size:** S (~2h: regex fix or re-discovery loop + test)
- **Priority:** P2 — structural fix; lower urgency than re-arm (A1) + watchdog (A2)

### Acceptance Criteria

**Conditional on B1 findings:**

#### If C-1 Confirmed (PDF discovery lag)
- [ ] **AC-C1-1:** Add re-discovery sweep: query `bctc_vps_queue WHERE status='url_not_found' AND updated_at < (now - 30 days)` → re-set to `pending, attempts=0` to allow re-try
- [ ] **AC-C1-2:** Integrate sweep into `fetch-bctc.sh` or create `sweep-old-url-not-found.sh` (called every 1h or daily after earnings season)
- [ ] **AC-C1-3:** Test: Manually set an old row to `url_not_found`, run sweep, confirm status→pending
- [ ] **AC-C1-4:** Live verification: After sweep runs, check that enricher picks up the row on next cycle

#### If C-3 Confirmed (SSC title-match regex)
- [ ] **AC-C3-1:** Identify Vingroup's BCTC title format from live SSC (grep B01 listing for Vingroup recent filings)
- [ ] **AC-C3-2:** Update regex in `vps-scripts/discover-bctc-urls-browser.py` function `_ssc_parse_rows()` to match Vingroup titles
- [ ] **AC-C3-3:** Test regex against sample HTML rows (include Vingroup + legacy VNM/VHM samples)
- [ ] **AC-C3-4:** Manual test: Run `discover-bctc-urls-browser.py VIC 2026 Q1` against live SSC, confirm URL found
- [ ] **AC-C3-5:** Rebuild + deploy via `scripts/deploy-vinahost.sh`

#### If C-2 (batch-size cap, likely resolved)
- [ ] **AC-C2-1:** Document finding: no code change needed; batch-size cap is moot once re-arm lands and enricher drains the queue
- [ ] **AC-C2-2:** Optional: file FU-BCTC-ENRICHER-BATCH-SIZE as future optimization (tune DEFAULT_BATCH_SIZE upward)

### Files to Read First

- `docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md` § Track (b) — root-cause hypotheses C-1/C-2/C-3
- `vps-scripts/discover-bctc-urls-browser.py` — `_discover_ssc()` + `_ssc_parse_rows()` regex
- B1 findings document (BCTC-REFINE-B1 AC-5 output)

### Files to Modify

**If C-1:**
- **Create (optional):** `vps-scripts/sweep-old-url-not-found.sh` (~40L)
- **Modify:** `fetch-bctc.sh` (integrate sweep, ~5L)

**If C-3:**
- **Modify:** `vps-scripts/discover-bctc-urls-browser.py` (regex update, ~10L in `_ssc_parse_rows()`)
- **Create:** `vps-scripts/test-ssc-regex.py` (test regex against samples, ~30L)

### Dependencies

- **Depends on:** BCTC-REFINE-B1 (must confirm hypothesis before implementing fix)
- **Independent:** Can run in parallel with A2/C1 (different zones: VPS vs mcp-server)

---

## Implementation Guidance

### If C-1: Re-discovery Sweep
```bash
# vps-scripts/sweep-old-url-not-found.sh
# Called daily post-earnings-season or weekly

DAYS_THRESHOLD=${DAYS_THRESHOLD:-30}
sqlite3 /path/to/bctc.db <<EOF
  UPDATE bctc_vps_queue
  SET status = 'pending', attempts = 0, updated_at = DATETIME('now')
  WHERE status = 'url_not_found'
    AND updated_at < DATETIME('now', '-${DAYS_THRESHOLD} days');
EOF
```

### If C-3: SSC Regex Fix
```python
# In discover-bctc-urls-browser.py, _ssc_parse_rows()

def _ssc_parse_rows(rows: list[dict]) -> list[dict]:
    """Parse SSC result rows, extract BCTC filing metadata"""
    results = []
    
    # Regex patterns for Vietnamese quarterly report titles
    # Handle multiple formats: "Quý N Năm YYYY" or "Q N/YYYY" or Vingroup-specific format
    patterns = [
        r'[Qq]uý\s+(\d+)\s+năm\s+(\d{4})',  # Standard: Quý 1 năm 2026
        r'[QqBb]\s+(\d+)/(\d{4})',           # Alternative: Q1/2026
        r'(V|v)ingroup.+[Qq]uý\s+(\d+).+(\d{4})',  # Vingroup-specific
    ]
    
    for row in rows:
        title = row.get('title', '').strip()
        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                quarter = int(match.group(1))
                year = int(match.group(-1))  # Last group is always year
                results.append({
                    'ticker': row['ticker'],
                    'quarter': quarter,
                    'year': year,
                    'url': row['url'],
                    'title': title,
                })
                break  # Stop after first match
    
    return results
```

---

## Risk & Notes

**Risk-1 (MEDIUM):** B2's success hinges on B1's diagnosis. If B1 can't confirm the root cause, defer B2 or implement all three hypotheses as fallback.

**Risk-2 (LOW):** Re-discovery sweep (C-1) could re-fire old enrichment cycles if NOT carefully scoped. Ensure the 30-day window is tight enough to avoid noise.

**Risk-3 (LOW):** VPS deployment requires `scripts/deploy-vinahost.sh`. After landing C-3 fix, push to VPS and verify live against SSC.

---

## Success Criteria (Done-Verified Gate)

✅ **DONE-VERIFIED when (per confirmed hypothesis):**

**C-1 Sweep:**
- Sweep script runs clean (no DB errors)
- Test row status transitions pending after sweep
- Enricher picks up swept rows within 2h

**C-3 Regex:**
- Regex tests pass (sample Vingroup + legacy titles)
- Manual `discover-bctc-urls-browser.py VIC 2026 Q1` finds URL against live SSC
- Deployed to VPS + verified live

**C-2 Documented:**
- Findings recorded; no code change needed
