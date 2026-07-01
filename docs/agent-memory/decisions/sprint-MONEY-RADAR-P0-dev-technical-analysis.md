# Decision Journal — Sprint MONEY-RADAR-P0 · dev-technical-analysis

**Sprint goal:** Money Radar Phase 0 — capital-flow/smart-money-rotation detection, divergence-centered.
**Agent:** dev-technical-analysis
**Started:** 2026-07-01T00:00:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-07-01T00:00:00Z
**task-id:** MONEY-RADAR-P0-T1-OSCILLATORS
**what-done:** Implemented `POST /ta/money-flow-oscillators` (Go :5003) — OBV, rel-vol z-score(20), up/down volume ratio, degraded close-only VWAP (`is_proxy=true`).
**what-considered:**
- Endpoint shape: single-ticker-required vs multi-ticker default-to-watchlist (like `/ta/roc-momentum`, `/ta/relative-strength`, `/ta/52w-proximity`) → chose the latter for consistency + the GENERIC/no-hardcode mandate.
- OHLCVBar: add `Volume` field to the shared value object vs a new close-volume-only type → extended `OHLCVBar` (zero-value safe, DRY, matches DDD reuse of the existing repo/port).
- Window sizing for rel-vol-z / up-down-ratio / VWAP: single 21-bar threshold (20-window + 1 direction anchor) for all three, rather than ragged per-metric minimums → simpler, no partial-window edge cases.
- Data source: reused `SQLiteMultiTickerOHLCVRepository` (added `volume` to its SQL SELECT) rather than the single-symbol `ohlcv_repository.go` (left untouched, no consumer needs it here).
**why-decision:** Multi-ticker default matches 3 sibling endpoints already shipped in this service and directly satisfies "compute for any watchlist ticker ... query the watchlist from system-map.json (never bake the list/count)". Extending `OHLCVBar` avoids a parallel type and keeps the repo/port surface small.
**why-change:** No change from the architecture brief (`docs/architecture-briefs/2026-07-01-money-radar.md` §11.1, §2 C1) — implemented exactly the 4 mandated oscillators, no MFI/CMF/A-D/Chaikin.

### STEP dev-technical-analysis-S2 · dev-technical-analysis · 2026-07-01T00:00:00Z
**task-id:** MONEY-RADAR-P0-T1-OSCILLATORS
**what-done:** Rebuilt + recreated the `technical-analysis` container (single-service, `--no-deps`, avoiding peer-kill) and RAW-probed the live endpoint post-restart; confirmed image ID changed (`768871da...` → `14cc6c62...`).
**what-considered:**
- Defer rebuild+verify entirely to ops/qa (standard RETURN template `REBUILD_REQUIRED: true`) vs self-verify pre-review per this task's explicit VERIFICATION GATE instruction.
- Chose self-verify because the task spec explicitly required a post-restart re-probe before flipping to review (§10 stale-image mitigation) and this is a same-zone, single-service, non-destructive rebuild.
**why-decision:** Task instructions explicitly mandate self-verification against a genuinely rebuilt container before REVIEW; `docker compose up -d --no-deps technical-analysis` is zone-scoped and does not affect peer services.
**why-change:** No change — this satisfies rather than substitutes the standard ops/qa rebuild-verify chain; qa will still RAW-re-check independently per the loop.
