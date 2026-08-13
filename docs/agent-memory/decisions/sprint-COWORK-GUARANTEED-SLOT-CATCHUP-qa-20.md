# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-13T20:29:36Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-19.md (CAP-REACHED, byte cap 36000 breached at 43649B/200L — dual-axis cap, line count was under 600 but byte density over)

---

### STEP qa-S113 · qa · 2026-08-13T20:27:00Z
**task-id:** FIX-SLA-BCTC-THRESHOLD-TRACKS-STALENESS-NOT-CONSTANT
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`). Both commits `78f945fb2`/`abd890ef1` confirmed ancestors of `main`; `git show --stat` matches every claimed file. Read `getSlaThreshold("bctc")` at source, not trusted from review_note prose — confirmed it branches ONLY on `isBctcEarningsWindowActive(now)` (boolean) → `cfg.earningsWindowThresholdMinutes`(1440)/`cfg.defaultThresholdMinutes`(10080), zero `minutesSinceX(now)` age term remains.
**what-considered:**
- AC-5: pulled `docs/data/system-map.json` `.project.data_sources["bctc-discover"].sla` myself, diffed against `DEFAULT_SLA_CONFIG`'s bctc entry — byte-match (168h/10080min default, 24h/1440min earnings-window), independent of the row's own citation.
- AC-4: grep-confirmed `marketHoursThresholdMinutes`/`offHoursThresholdMinutes` gone from `SignalSlaConfig`/`DEFAULT_SLA_CONFIG`; only surviving hit is the new test's own `toBeUndefined()` guard.
- Widened test scope beyond the claimed 8-file/107 count in 3 rings: ring1 (7 named files) 110/0; ring2 (+9 more bctc/SLA files found via grep) 140/0; ring3 (full 18-file set importing `freshnessSlaChecker`/`freshnessSlaConfig`) 271/0 — zero fixture-ripple missed. `tsc --noEmit` 0 errors, `mock-guard.sh` PASS, DDD/security greps clean.
- AC-2 (fixed-across-3-emissions, both regimes) and AC-3 (bidirectional clear+fire+recovery) read line-by-line in the new dedicated test file, not summary-trusted — both genuinely exercised.
- Did NOT re-run the full 14870-test suite (609s cost judged out of proportion — the 18-file direct-importer ring is exhaustive for this change's actual blast radius).
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commits real, root-cause fix matches claim exactly at source (not paraphrase), config values SSOT-verified independently, bidirectional proof genuinely present and passing, no fixture-ripple missed.
**why-change:** none — verdict matches dev agent's own claim. Appended `[QA] Review Record` to the row's `review_note` field (row had no `status_note`); attached `verification.raw_probe` on the retry after validator flagged its absence on the first write attempt.
