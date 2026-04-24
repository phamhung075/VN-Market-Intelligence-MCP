---
agents: news-scout, developer, ops
trigger: price_stale, circuit_breaker_open, vps_health
---

# CRITICAL: HOSE Price Data 28 Days Stale

## HOSE Price Circuit Breaker Failure

**Detected:** 2026-04-24 06:21 UTC\n**Severity:** CRITICAL\n**Last successful fetch:** 28 days ago (669.4h old)\n\n### Impact\n- All HOSE stock prices stale (VCB, FPT, HPG, etc.)\n- VPS price-fetch service appears down or broken\n- Impact chains may use stale baseline data\n- Market snapshot calls return old prices\n\n### Root Cause Hypothesis\n- `vn-price-fetch.service` on VPS may have crashed/stopped\n- Circuit breaker opened after repeated failures → half-open state\n- No manual restart since failure occurred\n\n### Action\n- Dev team: SSH to VPS, check `vn-price-fetch.service` status\n- Run `systemctl status vn-price-fetch.service`\n- If failed: `systemctl restart vn-price-fetch.service` + check logs\n- Monitoring: Should return to OK within 2-3 fetch cycles (~2-3 min)\n\n### Related\n- Commodity prices also stale (4d old)\n- System status shows half-open circuits: Polymarket (165 fails), Foreign Flow (440 fails)\n