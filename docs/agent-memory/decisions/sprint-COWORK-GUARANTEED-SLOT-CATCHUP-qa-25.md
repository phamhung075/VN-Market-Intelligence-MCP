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

### STEP qa-S29 · qa · 2026-08-15T08:59:20Z
**task-id:** FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW
**what-done:** Direct-Commit Verify round 3 (rebuild claim re-check). Independently re-verified all 4 router-mandated crux points, none taken on report's word.
**what-considered:**
- (a) `docker inspect` on the RUNNING container myself: image `.Created`=2026-08-15T08:44:00Z genuinely postdates commit 532fc71a0 (08:23:42Z); no src bind-mount confirmed.
- (b) in-container file re-check myself: root:root owned, mtime between commit-time and build-time, matches 19 siblings — hot-patch signature gone.
- (c) re-ran guard live myself (own script via DI seam, real prod data): limit=1→7,562 | 20→153,138 | 50→373,767 | 100→695,225 — exact match, independently reproduced, not copy-pasted. 9/9 test pass live.
- (d) jq-confirmed rebuild_required=false live; also independently caught that commit b4a810897 does NOT itself touch orch-state.json (only the notebook) — the actual board write landed in peer commit 5ea96f7b7 (unrelated FACTORY-APP-split-pollNews commit), confirmed via `git show`. Race is real, as the report itself flagged — no data loss, write content correct.
**why-decision:** vc-approved, DONE_VERIFIED. Deployment-durability gap from round 2 is genuinely closed; all evidence independently reproducible, not narrated.
**why-change:** none from plan — routine independent re-verify of a flagged rebuild claim, single pass.

### STEP qa-S30 · qa · 2026-08-15T09:02:31Z
**task-id:** FACTORY-APP-split-pollNews
**what-done:** Direct-Commit Verify — rework round 2 of my own 2026-08-12 CHANGES_REQUESTED (0f23a703f). Commit `72bcaf940` on main ancestry, `git show --stat` matches all claimed files (pollNews.ts + 5 new pollNews/ siblings + usecases.md).
**what-considered:**
- Read source myself: pollNews.ts genuinely 670L (claimed 671, trivial off-by-1); all 5 new files (resolveFetchers 110L/teChromiumRetry 56L/sourceHealth 59L/fetchAndRecordHealth 91L/allSourcesDarkAlert 103L) confirmed <=120L with real distinct substantive logic (fetcher resolution, cold-start retry, health-name classification, allSettled fetch+CB recording, DB-backed dark-alert cooldown) — not line-padding. Remaining ~480L (steps 2-5: normalize/dedup/insert/RAG/deep-fetch-gate, cascade/alert-gen/mention-velocity) confirmed still fully inline in pollNews.ts, exactly as disclosed — no undisclosed gap.
- Re-ran 16 targeted stage-1 pollNews test files myself: 84/84 pass, 209 expect() calls — exact match to claimed "209 pollNews-touching assertions", not re-trusted. tsc clean. mock-guard PASS. DDD/security greps clean (application-layer legitimately imports infra; no process.env/secrets in new files). size-lint --check: only 1 pre-existing unrelated offender (getBctcPendingRefineTool.ts, untouched here).
- DoD call: backlog-detail.json's own `dod` field names "one-extraction-per-PR" as an accepted AC bullet alongside "thin orchestrator" — process sanctions staged extraction. Materially different from 0f23a703f (zero pipeline-body extraction that round) — this is a genuine, verified real stage-1 extraction, honestly disclosed as partial.
**why-decision:** vc-changes (qa[]->review[]) — full DoD (<=120L) objectively still unmet at 670L so DONE_VERIFIED not warranted yet, but this is genuine verified PROGRESS matching the row's own documented ladder, not a quality failure. status_note framed as STAGE-1 VERIFIED/continue-ladder rather than defect-CHANGES_REQUESTED. redispatch_count 1->2, next_agent=dev-mcp-server, continue to stage 2 (dedup/insert).
**why-change:** none — router's progress-vs-failure framing question resolved by reading the DoD text directly; verdict mechanics (vc-changes JUMP-TO) unchanged, flow has no separate "progress" terminal state.
