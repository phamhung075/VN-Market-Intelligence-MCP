# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-mcp-server

**Sprint goal:** Systemic remake P1 — root-cause fixes (idle-loops→verif→detector) per 07-04 systemic review.
**Agent:** dev-mcp-server
**Started:** 2026-07-04T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-04T00:00:00Z
**task-id:** FACTORY-INTERFACE-confidence-score-50-mask
**what-done:** Grepped apps/mcp-server for `confidence_score ?? 50` / `confidenceScore ?? 50` in the /api/signals/stock handler — zero matches. stockSignalsHandler.ts:224 already reads `row.confidence_score ?? null` (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 marker present in comments).
**what-considered:**
- Assume stale detector output and implement anyway (rejected — would fabricate a diff on already-correct code)
- Search for a second/older stock-signals route that might still carry the mask (none found — server.ts:1359 has exactly one `/api/signals/stock/:code` route, delegating to this same handler)
- Verify via git history that the mask was already removed (confirmed: commit e3386bdfa "TASK-CONF-1 remove DEFAULT-50 confidence mask")
**why-decision:** Code, tests, and git history all converge on: this exact mask was fixed by a prior task (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 / TASK-CONF-1). Editing would be a no-op diff or risk introducing churn on a correct file.
**why-change:** No implementation change made — reporting NO-CHANGE-NEEDED per detection-never-ran ≠ failed-fix policy. Ran scratch behavior-proof (absent confidence_score → null) + existing regression suite (47 pass) + `bun tsc --noEmit` (exit 0) to confirm current state is honest, not to fix a live bug.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-07T17:50:00Z
**task-id:** CI-RED-c5b5f885-FIX
**what-done:** Pulled real GH Actions logs (run 28689707086 + 2 prior runs) — 1410-tool-diacritics-sweep.test.ts failed 3/3, 262-mcp-tools-042.test.ts 2/3. Both call getClimateRiskSignals/getEnergyGridStatus with no DI, hitting real network (weatherVn/hydrologicalData fetchers, 15s axios timeout > bun-test 5s default) under CI's 16-way parallel isolation. Mocked both fetcher modules (freeze-before-mock + afterAll-restore pattern, matched 1355b precedent); un-skipped 262's 2 previously-flaky energy tests. Verified isolation + together-with-siblings (257/258/259, both orders) + full-suite via ci-per-file-isolation.sh (no regression vs before-fix baseline). Committed 1efb6f918, pushed; CI run 28886901289 = success (bun test job = success).
**what-considered:**
- `.it.skip` both flaky cases (matches existing 262 precedent) — rejected as incomplete: doesn't cover 1410's real culprit, leaves 262 cases 1-3 (weatherVn) still real-network-flaky
- Add httpClient DI param to climateTools/energyTools (broader prod-code refactor) — rejected: out of "minimal targeted fix" scope, touches interface layer unnecessarily
- mock.module() the 2 fetcher modules in both test files, un-skip 262's dead tests — chosen: root-causes both files, matches repo's own established mock.module + afterAll-restore convention, zero prod-code touched
**why-decision:** Empirically probed (scratch reproduction) that mock.module() must precede the static climateTools/energyTools import and that afterAll-restore needs a value-copy (not a live import-binding alias) to actually protect sibling files — verified both hold before applying to the real files.
**why-change:** 183-alert-accuracy.test.ts (failed 1/3 runs) is unrelated (no network dep) — left untouched, out of scope. Local plain `bun test` (bare, no isolation) surfaced ~62 unrelated fails + a Bun-engine crash; disregarded as non-authoritative per the isolation script's own "NEVER bare bun test" comment and its scope leak into src/_deprecated/ — used ci-per-file-isolation.sh (CI's actual mechanism) as the real gate instead.
