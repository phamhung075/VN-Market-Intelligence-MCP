# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract — add look-back/catch-up to the guaranteed-slot firing path (cowork-match-slots.js / cowork-guaranteed-slot-firer.sh / live dispatcher startup), dedup via published:<slot_id>:<VN-work-date>, no retro-post across VN-date rollover.
**Agent:** qa
**Started:** 2026-08-15T07:59:08Z (continuation of sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-24.md, CAP-REACHED — byte cap 42181/36000, line count 199/600 still under)

---

### STEP qa-S27 · qa · 2026-08-15T07:59:08Z
**task-id:** FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET
**what-done:** Direct-Commit Verify (Review-Lane QA-Drain, mode=verify-committed). Independently RAW-re-verified all 5 router-mandated points, dev status_note not trusted.
**what-considered:**
- AC-1: grep-confirmed the 4 field names in STRUCTURAL_FIELDS at 90e84270d, `git diff 90e84270d HEAD` on the file = empty (no drift).
- AC-2: temp-swapped working tree to pre-fix (90e84270d^) content, ran suite live — genuine RED 18/19 with exact livelock ABORTED message; restored (diff clean) — GREEN 19/19.
- AC-3: independently read all 5 sibling claim scripts' exact line ranges — all move the claimed row OUT of a guarded lane into an unguarded one; secondary-drain.jq confirmed the only in-place-inside-guarded-lane stamper.
- AC-5: live board query — SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD updated_at=2026-08-15T07:40:55Z (off frozen 08-11), secondary_* fields present, matches claim exactly.
- Full regression: orch-row-prose-ceiling-check-tests.sh 19/19, orch-apply-wrapper-tests.sh 89/89. All 4 commits on main ancestry. tsc N/A (scripts/ outside tsconfig include). mock-guard PASS. Notebook commit f79bdbdad content-survival confirmed (3-section drop-oldest cap, not data loss).
**why-decision:** vc-approved, DONE_VERIFIED — every router-mandated check independently reproduced with matching results; zero blocking ISSUE.
**why-change:** none from plan — routine independent re-verify, single-pass clean.

### STEP qa-S28 · qa · 2026-08-15T08:39:09Z
**task-id:** FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW
**what-done:** Direct-Commit Verify round 2 (rework of my own 2026-08-12 CHANGES_REQUESTED). Independently RAW-re-verified guard logic, live data, losslessness, toolCount — all PASS — but found a NEW blocking deployment-durability defect not raised by the rework's own report.
**what-considered:**
- Code: read 532fc71a0's full diff — guard checks `text.length` post-assembly (not `limit`), matches claim.
- Tests: targeted file 9/9, 5 sibling files 87/87, `tsc --noEmit` clean, `mock-guard.sh` PASS — all reproduced myself on host.
- Live data (own DI-seam invocation, not trusting reported numbers): limit=1→7,562 (silent) | limit=20→guard fires at 153,138 (drift claim reproduced) | limit=50→373,767 | limit=100→695,225 (exact match to their number).
- Losslessness: diffed guard-written oversized file vs. raw guard-disabled fetch for limit=100 — byte-identical (695,225B, 100/100 rows).
- toolCount: git-checkout A/B on ONLY the touched file (rest of tree at HEAD) — 183 both before+after this diff, confirms pre-existing/unrelated drift claim.
- NEW FINDING: `docker inspect` — running mcp-server image built 2026-08-13T19:15:38Z, BEFORE commit 532fc71a0 (2026-08-15T08:23:42Z). Container's copy of the file has post-build mtime + non-root uid 501/dialout (every sibling file root-owned, build-time mtime) — no src bind-mount in either compose file. Conclusion: out-of-band `docker cp` hot-patch, not a real image rebuild. `rebuild_required` field on the row still `true`, never resolved across 2 rounds. The "live-verified in the running container" claim in the rework's report was tested against this hot-patch, not a durable deployment — a container recreate/restart (routine fleet event) would silently revert the fix.
**why-decision:** vc-changes (CHANGES_REQUESTED) — code/tests/logic all independently correct, but the deployment substrate backing the "live production verify" claim is not durable; requires a genuine `docker compose build mcp-server && up -d` (ops/PO, per feedback_rebuild_after_dev_change.md) + re-verify before DONE_VERIFIED.
**why-change:** escalated beyond router's mandated checklist — router asked to independently confirm (a)-(d), all confirmed true, but I also independently caught a 5th gap (deployment durability) neither the router prompt nor the rework's own report raised.

