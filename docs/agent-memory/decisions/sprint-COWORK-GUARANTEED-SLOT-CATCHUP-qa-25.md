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

