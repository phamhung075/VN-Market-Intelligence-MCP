# OPS: RAG Service Deploy & Durability Window Measurement

**Date**: 2026-08-14
**Task**: UNBLOCK-RAG-OPS-DEPLOY-AND-DURABILITY-MEASUREMENT-WINDOW (P0 CRITICAL PATH)
**Owner**: ops (session 632721c2-41e4-4aff-8d06-a47cf80dc0d7)
**Status**: Interim (measurement window in progress)

## Completed Actions

### Deployment (AC-1)
- Rebuilt rag-service from main HEAD (fix commit 0eb733b577 @ 2026-08-14T12:18:18Z)
- Old image: `sha256:4a955869f002...` (pre-fix, deployed 2026-08-14T09:23:21Z)
- New image: `sha256:26e681b0ca3a...` (deployed 2026-08-14T20:15:29Z)
- **Result**: PASSED

### Code Verification (AC-2)
- Verified repositories.py hash in container matches git HEAD
- Hash: `037bab197be2d73fed17c3bce08e7bce2c360f79200178843eee6f485c82a49e`
- **Result**: PASSED

### Durability Measurement Window (AC-3 & AC-4)
- **Started**: 2026-08-14T20:15:29Z (container .State.StartedAt)
- **Expected end**: 2026-08-15T20:15:29Z (24-hour window)
- **Status**: IN PROGRESS — background monitoring active (PID 66004)

**D1 (dmesg)**: Baseline captured, ongoing monitoring for kernel OOM events
**D2 (lifetime)**: .State.StartedAt unchanged (PASS so far)
**D3 (plateau)**: Collecting memory % time-series, 60-second interval
**D4 (mitigation)**: No restarts or interventions yet (PASS)
**D5 (evidence fields)**: Will be populated upon 24h completion

## Monitoring Artifacts

- `/tmp/rag-durability-measurement/baseline.log` — container config
- `/tmp/rag-durability-measurement/memory-samples.csv` — time-series data
- `/tmp/rag-durability-measurement/dmesg-baseline.log` — kernel logs
- `/tmp/rag-durability-measurement/monitor.log` — monitor process output
- `/tmp/rag-durability-measurement/final-report.txt` — summary (generated at 24h)

## Critical Notes

1. **Window must run uninterrupted** — any restart invalidates measurement (D4)
2. **No interventions during 2026-08-14T20:15:29Z to 2026-08-15T20:15:29Z**
3. **Prior window destroyed** — this is the first valid window attempt post-fix

## AC Summary

- AC-1 (new image deployed): **PASSED**
- AC-2 (code hash matches): **PASSED**
- AC-3 (durability measurement): **IN PROGRESS**
- AC-4 (dmesg evidence): **IN PROGRESS**
- AC-5 (report to PO): **PENDING** (awaiting 24h measurement completion)

## Next Steps

Final verdict will be delivered at 2026-08-15T20:15:29Z when the measurement window completes.

