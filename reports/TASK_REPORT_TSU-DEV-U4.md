## Task Report TSU-DEV-U4
date: 2026-06-07
outcome: APPROVED

changed: [
  apps/macro-indicators/pkg/application/dtos.go (8 new fields),
  apps/macro-indicators/pkg/application/usecases.go (+68L: resolvePrevSessionVnIndex + computeDelta + Execute() U4 block),
  apps/macro-indicators/pkg/application/usecases_test.go (+205L: T-U4-1..T-U4-7),
  apps/macro-indicators/pkg/domain/ports.go (+6L: FetchPrevSessionVnIndex method),
  apps/macro-indicators/pkg/infrastructure/repositories.go (+51L: FetchPrevSessionVnIndex + fetchPrevSessionVnIndexFromDB),
  apps/macro-indicators/pkg/infrastructure/repositories_test.go (+108L),
  apps/macro-indicators/pkg/interface/http/handlers_snapshot_contract_test.go (+10L: FetchPrevSessionVnIndex stubs)
]

## Test Results
- Go test -count=1 ./...: 12/12 packages PASS
- go vet: 0 errors
- Unit T-U4-1..T-U4-7: all present and covered
- Live endpoint POST :5004/snapshot: vnIndexDelta=7.35, vnIndexDirection="up", oil/gold/usdVnd=null/"unknown"
- Gateway passthrough MCP :3000: all 8 new fields confirmed in served payload

## DDD Compliance: PASS
domain/ports.go: imports context+time only. No infrastructure or application imports. Fence-A clean.
application/usecases.go: imports domain + module + primitives only. Fence-B clean.
infrastructure/repositories.go: only imported by cmd/server/main.go. Fence-C clean.

## Security: PASS
No hardcoded secrets. No process.env. DB access read-only (file:?mode=ro). No new HTTP endpoints.

## Additive-Only (AC-U4-7): PASS
git diff dtos.go: additions only. No existing field renamed or removed. All 8 new fields appended to MacroSnapshotResponse.

## mcp-server Health: PASS
RestartCount=0. Status: Up (healthy). "Up 21 seconds" during ops pass = normal rebuild restart, not crash-loop.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Commit 9880eadc already on main (no separate branch to merge — dev committed directly to main per NO-BRANCHES policy). APPROVED — orch-state TSU-DEV-U4 REVIEW→DONE.

---

## QA Gate Cycle-2 — 2026-06-13 (commit 56822e4a, test-only seed-date-rot fix)

changed: [apps/macro-indicators/pkg/infrastructure/repositories_test.go (39 lines, test-only)]
tests: 12/12 Go packages pass / 0 fail | tsc: N/A (Go-only) | ddd: PASS | security: PASS
verdict: APPROVED

Smart-Skip: test-only change — DDD/security/mock-guard at code-review level only.

G1 LIVE BEHAVIOR PASS: POST :5004/snapshot → vnIndexDelta=-6.959999999999809, vnIndexDirection="down"; oilUsdDelta=null, oilUsdDirection="unknown"; goldUsdDelta=null, goldUsdDirection="unknown"; usdVndDelta=null, usdVndDirection="unknown". Real computed delta, direction in {up,down,flat}, null/unknown for uncomputable metrics (DSI).
G2 UNCACHED TEST PASS: go test ./... -count=1 → 12/12 packages ok (0.414s..3.374s). No "(cached)" output.
G3 SEED-DATE PASS: grep hits at lines 198/225/271/278 = 2026-05-26 fixture timestamps in FetchVNIndex resolution tests (NOT window queries, NOT T-U4). T-U4-5 block (L838-935) uses time.Now().UTC().AddDate offsets only — zero calendar literals feeding relative-window queries.
G4 ADVERSE-DATE PROOF: d0=now-2d, d1=now-1d, d2=now; ORDER BY date DESC OFFSET 1 = d1=1220.5; invariant for any UTC run date.
G5 DIFF SCOPE PASS: git show --stat 56822e4a = 1 file only (repositories_test.go). Runtime dtos.go/usecases.go/repositories.go absent.
G6 DSI INTENT PASS: null/unknown for oil/gold/usdVnd is intentional — no daily history table for these metrics. Not a defect.

DJ: sprint-TOOL-SURFACE-UPGRADE-qa.md § qa-S8
