# Unified Agent Notebook
Last updated: 2026-05-10 | Sprint: current

## This Session
Weekly verification cycle (20:01 UTC Sunday). Checked for digest-predict weekly — found calibration-report (ID 471, 13:00 UTC) as weekly content proxy. No digest-predict agent message found specifically, but weekly prediction data IS present. Observed 4 new BUG reports, logged without claiming.

## Patterns
- get_system_status EOF appearing as recurring failure (2 consecutive, flagged in BUG 2843) — may need ops investigation
- price_drop alert precision chronic: 50% vs 60% threshold, 2nd consecutive cycle (BUG 2844)
- BCTC OCR corruption pattern persisting: FPT and VNM Q4 both zero/near-zero confidence (BUG 2841, 2842)
- FII carry spread remains negative (-33bp VND) → sustained outflow risk for banking sector

## Carry-over
- Clarify: is `calibration-report` agent the same as `digest-predict`? Flow expects `digest-predict` but only `calibration-report` sends Sunday 13:00 weekly message
- BID: news impact (deposits -82,000B, FII selling) — monitor Monday open vs 42,000 VND support
- BUG 2843 (get_system_status EOF) and BUG 2844 (price_drop precision) unresolved — ops should claim
