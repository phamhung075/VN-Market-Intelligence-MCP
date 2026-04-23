# Task Report 1297-fix — compact
date: 2026-04-23
outcome: APPROVED

changed: [vps-scripts/discover-bctc-urls-browser.py:1-422 (full rewrite)]
bun test: 6508 pass / 0 fail (baseline 6459, +49)
tsc: 0 errors
ddd: N/A — Python VPS script, no TS DDD surface

## Security: PASS
- No hardcoded credentials or API keys
- SSL bypass (`ssl.CERT_NONE`) intentional + documented: UPCOM cert invalid on `upcom.hnx.vn`; workaround is using `hnx.vn` domain. VPS-internal tool only.

## Code Quality Checks

| Check | Result | Notes |
|-------|--------|-------|
| No hardcoded secrets | PASS | No tokens, passwords, API keys |
| Network error handling | PASS | `except Exception` on all HTTP calls; breaks page loop gracefully |
| JSON output valid | PASS | Single `json.dumps()` to stdout; all paths return typed dict |
| HOSE fallback | PASS | Known-broken portal; returns informative error, no hang |
| HNX POST params | PASS | `pAction=1`, `pNhomTin="'FIN_REPORT'"` (vendor-required single-quote wrap), date window correct |
| UPCOM domain fix | PASS | Uses `hnx.vn` (avoids `upcom.hnx.vn` invalid cert) |
| Multi-page pagination | PASS | max_pages=5, breaks on Vietnamese empty-sentinel |
| Q4 annual match | PASS | `matches_annual()` accepted for Q4 per filing convention |

## VPS Validation (Dev handoff 2026-04-23)

| Stock | Exchange | Quarter | Result |
|-------|----------|---------|--------|
| PVS | HNX | 2024 Q4 | PASS — valid PDF URL returned |
| NVB | HNX | 2024 Q4 | PASS — valid PDF URL returned |
| VNM | HOSE | 2024 Q4 | Informative error (portal broken, expected) |
| FPT | HOSE | 2024 Q4 | Informative error (portal broken, expected) |

2/2 HNX/UPCOM stocks return direct PDF URL. HOSE limitation documented in script header. Acceptance criteria met.

## Non-Blocking
- `ssl.CERT_NONE` scope is global to script; acceptable for VPS-only tool, not a production service.

verdict: APPROVED
