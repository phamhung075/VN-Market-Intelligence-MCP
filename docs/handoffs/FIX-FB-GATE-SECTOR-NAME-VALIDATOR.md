---
task_id: FIX-FB-GATE-SECTOR-NAME-VALIDATOR
epic: AUDIT-FB-GATE-PROSE-HARDENING
type: FIX
size: S
status: REVIEW
owner: developer
created_at: 2026-06-21
zone: scripts/
---

# FIX-FB-GATE-SECTOR-NAME-VALIDATOR

## Summary

Add Check-E (sector/company-name validator) to `scripts/fb-data-integrity-gate.sh`
and fix the latent line-344 `[[: 0\n0: syntax error` bug.

## Root causes fixed

### Bug (line-344 syntax error)
`grep -c` exits with code 1 when 0 lines match. The `|| echo "0"` fallback then fired
alongside grep's own stdout "0", producing a two-line value `0\n0` that failed `[[ -gt 0 ]]`.
Fixed both occurrences (lines 343 and 353) by replacing `|| echo "0"` with `|| true` and
normalising to scalar via `grep -m1 '^[0-9]' || echo "0"`.

### Check-E (new)
Sector/company-name validator, entirely driven by SSOT `docs/data/system-map.json`
`.project.watchlist` — no hardcoded ticker→sector map.

**E1 — sector-keyword contradiction:**
Detects parenthesised sector labels on watchlist tickers. Patterns matched:
- `TICKER (wrong_sector_kw ...)` e.g. "HPG (ngân hàng)"
- `(wrong_sector_kw ...) TICKER`

Sector-family↔keyword mapping derived from SSOT sector strings (English labels drive
family classification; FAMILY_VI_KEYWORDS maps families to Vietnamese terms found in posts).
Guard: if the contradicting keyword appears in the ticker's own canonical sector string,
no violation (prevents VRE "Real estate / Retail REIT" firing on the "retail" keyword).

**E2 — company-name alias mismatch:**
Curated list of known wrong aliases (VNM→Nestlé, SAB→Heineken, etc.). Fires when both
the ticker AND a false alias appear in the same post.

## Files changed

- `scripts/fb-data-integrity-gate.sh` — 2 bug fixes + Check-E block (~130 lines added)

## [Developer] Implementation Record

- **Files modified:** scripts/fb-data-integrity-gate.sh — Check-E added + 2 floor_zero bug fixes
- **Tests written:** DoD shell runs (4 scenarios — see below)
- **Git commits:** [see commit below]
- **tsc status:** N/A (bash script)
- **Full suite:** 4 DoD scenarios all green
- **Docs updated:** NONE (script pointer in dev-standards.md already current; no new file)
- **Graphify:** skipped (no docs impacted)

## DoD verify runs

### DoD 1 — clean post (correct sectors) → PASS, exit 0
```
bash scripts/fb-data-integrity-gate.sh docs/social/fb-post-2026-06-19.md 2026-06-19
[INFO] fb-data-integrity-gate: live snapshot fetched from http://localhost:3000/mcp/api/prices/batch
[PASS] fb-data-integrity-gate: 0 violations
exit=0
```

### DoD 2 — "HPG (ngân hàng)" injection → BLOCK, exit 1
```
[BLOCK] Check-E sector-mismatch: HPG (canonical=Steel) labelled as 'ngân hàng' (wrong family=banking) in post
[BLOCK] fb-data-integrity-gate: 1 violation(s) — fix ALL before STEP 5 write
exit=1
```

### DoD 3 — "VNM (Nestlé)" injection → BLOCK, exit 1
```
[BLOCK] Check-E company-alias: VNM (canonical=Vinamilk) — post contains wrong alias 'nestlé'. Likely fabrication.
[BLOCK] fb-data-integrity-gate: 2 violation(s) — fix ALL before STEP 5 write
exit=1
```

### DoD 4 — selloff path (exercises floor_zero fix) → no line-344 error
```
[BLOCK] Check-C breadth-narrative: post uses selloff/bán-tháo language but live VN-Index=-0.32% (< ±2%). Verify breadth data before publishing.
exit=1
```
No `[[: 0\n0: syntax error` on any run.

## QA checklist

- [ ] Run DoD 1–4 above from repo root
- [ ] Confirm Check-E fires for: FPT (công nghệ) labelled "ngân hàng", VIC (bất động sản) labelled "thép"
- [ ] Confirm no false-positive on VRE (Real estate / Retail REIT) with post text "VRE (bất động sản, Vincom Retail)"
- [ ] Confirm system-map.json SSOT is read dynamically (no hardcoded ticker map in script)
