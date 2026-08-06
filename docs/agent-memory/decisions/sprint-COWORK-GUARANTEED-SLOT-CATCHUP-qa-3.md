# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation, qa-2 byte-capped)

**Sprint goal:** cowork guaranteed-slot catch-up (ambient sprint at time of this entry; task below is unrelated dev-team Review-Lane QA-Drain work routed to qa)
**Agent:** qa
**Started:** 2026-08-06T18:05:00Z

---

### STEP qa-S38 · qa · 2026-08-06T18:05:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Row's own `commit: ec8f17ab6` confirmed on main ancestry, author-date 2026-07-23; `git show --stat` matches all 4 claimed files (`scripts/lib/devteam-eligibility.jq`, `bounded1-supervised-lane-report.sh`, new `devteam-bounded1-prose-sequencing-gate-verify.sh`, `docs/agents/dev-team/flow/main.md`).
**what-considered:**
- Re-ran the new regression verifier myself (not trusted from review_note prose): `devteam-bounded1-prose-sequencing-gate-verify.sh` → 5/5 PASS (AC-1 unbacked-not-eligible, AC-1b backed-eligible, AC-1c detail-side, AC-2 live UC-CDC-P5 stays held, control unaffected).
- Ran the 2 broader system-wide audits too: `devteam-dispatch-gate-satisfiability.sh` has 1 pre-existing FAIL ("BOUNDED-1 no-ops at in_progress>=1") and `bounded1-supervised-lane-report.sh` FAILs on 4 unrelated backlog rows with no dispatch lane — both structurally unrelated to this task's diff (different gate: WIP<1 cap in the CLAIM script, not `is_bounded1_eligible`'s new conjunct; the new conjunct can only ADD restriction, never cause a spurious fire). Sibling `devteam-bounded1-detail-disposition-gate-verify.sh` (flagged broken in review_note, 2026-07-23) now passes 10/10+control clean — fixed since by an unrelated later commit, not this task's concern either way.
- `bash -n`/read diff on `devteam-eligibility.jq`'s new `has_unbacked_sequencing_prose` def + its conjunct wiring — board-OR-detail OR-precedence matches every sibling `effective_*` def's convention; DDD/security greps clean; `mock-guard.sh --files` → PASS "no production source files to scan" (jq/bash/md only). No `.ts`/apps/ touched — `bun test`/`tsc --noEmit` structurally N/A.
- DJ-GATE-1: confirmed developer's own journal entry present (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md` line 30, `task-id:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE`) before flipping DONE_VERIFIED.
**why-decision:** APPROVED, DONE_VERIFIED. The task's own scoped regression verifier is 5/5 green on independent re-run; the 2 unrelated pre-existing audit failures are outside this row's file/gate scope and cannot be caused by an ADD-only eligibility conjunct.
**why-change:** none — verified exactly what the row scoped. Journal file rolled qa-2→qa-3 this entry (byte-cap breach, see qa-2's own CAP-REACHED sentinel).

### STEP qa-S39 · qa · 2026-08-06T16:07:00Z
**task-id:** BCTC-REPORT-ID-LOOKUP-TOOL
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commit `7a9eea6bd` confirmed on main ancestry; `git show --stat` matches all claimed files, `registry.ts` diff is 2-line pure-additive.
**what-considered:**
- Row's own test (5/5 PASS), `tsc --noEmit` clean, DDD/security/mock-guard clean — satisfies verify-committed's documented scope (touched-test-file, not full suite).
- Ran full `bun test` twice anyway as due-diligence (row's AC references a 30-cycle production dark-escalation): both runs contended by a concurrent peer session's own full-suite run (up to 4 `bun test` procs observed); failures were timeout-pattern on unrelated tools, zero grep hits for the reviewed files.
- AC "ESC-5 fires on known-escalation case" — verified via LIVE production evidence in `bctc-analyst.md` notebook (FPT ESC-5 TRUE, report_id resolved), not just the unit test — stronger than prose trust alone.
**why-decision:** APPROVED, DONE_VERIFIED. Isolated additive change, clean typecheck/DDD/security, dedicated test green, AND independently corroborated live in production — highest-confidence verify-committed case this batch.
**why-change:** none — row's own "not yet deployed" note (2026-07-23) is stale, superseded by 2026-07-24/08-06 live evidence; flagged in status_note, not treated as a blocker.

### STEP qa-S40 · qa · 2026-08-06T16:15:00Z
**task-id:** FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, mode=verify-committed, `qa[]` row, `branch:null`). Commit `8884569a0` confirmed on main ancestry; `git show --stat` matches all 4 claimed files (Dockerfile +12L wiring trio, entrypoint.sh rewritten non-fatal, new 210L regression test, sshExec.ts +9L comment-only, flag left `accept-new`).
**what-considered:**
- Re-ran row's own regression test myself: 11/11 PASS (static wiring + source-guard + live `sh`-subprocess behavioral checks against fake ssh-keyscan). `tsc --noEmit` clean, `mock-guard.sh` PASS, DDD/security greps clean.
- Full `bun test` run twice: 66 then 52 fail on unchanged tree (dev's own baseline 41) — flake signature (count itself moves), zero grep hits for entrypoint/sshExec/KNOWNHOSTS/Dockerfile in either log.
- Went beyond dev's own verification ceiling: this environment DOES reach the VPS (`nc -zv` succeeds, unlike dev's sandbox). Read `docker logs` of the actually-running mcp-server container (image built today, post-fix) — known_hosts seeded cleanly across several real restarts, zero WARN. Then `docker exec`'d in and ran `ssh -o StrictHostKeyChecking=yes -i /run/secrets/vps_ssh_key root@VPS echo ...` directly against the seeded known_hosts — SUCCEEDED. This live-proves the acceptance clause "StrictHostKeyChecking=yes SSH succeeds" as a mechanism, satisfying the PO ruling's gating condition for the deferred `accept-new`→`yes` code revert (scope item 2) — did NOT flip sshExec.ts myself (`not_my_job`: production code is dev's), flagged as an unblocked follow-up in status_note; `send_telegram(work)` attempted but unavailable — no gateway/MCP tool grant this sub-session.
**why-decision:** APPROVED, DONE_VERIFIED. Scope items 1+3 fully verified on committed code/tests/live behavior; item 2 is a real but separate out-of-scope-for-this-commit follow-up, now unblocked by today's evidence — not held against this row.
**why-change:** none — verified exactly what the row scoped, plus supplementary live proof beyond what dev's environment permitted.

### STEP qa-S41 · qa · 2026-08-06T19:10:00Z
**task-id:** FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commits `509188b48`+`5f81c1e51` confirmed on main ancestry; `git show --stat` matches the claimed 3 files (route, test, api-reference.md) exactly.
**what-considered:**
- Re-ran the touched test file myself: 92/92 pass (matches review_note count exactly). `tsc --noEmit` clean. `eslint` on the route file: 0 errors. `mock-guard.sh --files` PASS. No hardcoded dates/numbers found — `STALE_THRESHOLD_DAYS=14` is a duration constant, staleness date is derived via `computeLastScoredAt`/`describeStaleness`. `formatHitRate(null)` still renders "Chưa có" (line 300-303), never recomputes hitRate client-side (calibration echoed verbatim).
- Checked `related[]` for a real dependency on the concurrently-verified `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT`: row's own note states "Deliberately INDEPENDENT ... can ship immediately without waiting" — confirmed in code: `resolveExclusionReason` treats `exclusionReason` as fully optional with a generic fallback, no crash/degradation either way. No blocking dependency.
- Live-probed the running stack myself (not trusted from review_note): `curl :3001/dashboard/prediction-claims` — confirms the self-report's own "PENDING-REBUILD" admission (frontend container image built 2026-07-24, predates this fix's 2026-07-25 commit; new denominator/breakdown/staleness strings absent from served HTML). Per `PUSH-AUTONOMY-1` §5, the single-service rebuild + REAL-DATA verify is a separate ops-owned/PO-minted `VERIFY-<id>-REALDATA` gate, not a QA merge-gate blocker — code+tests are what QA verifies here.
**why-decision:** APPROVED, DONE_VERIFIED. All 5 deliverables (a-e) independently confirmed in code and tests; acceptance criteria (denominator/staleness/breakdown non-hardcoded, hitRate=null contract preserved, no client recomputation) hold under re-run, not just prose.
**why-change:** none — verified exactly what the row scoped. Flagging the stale-container gap in status_note for ops/PO visibility, not blocking this row on it.

### STEP qa-S42 · qa · 2026-08-06T19:30:00Z
**task-id:** FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Row carries its own PO-authored QA CLOSE-GATE (G1/G2/G3) explicitly forbidding approval on script tests alone — re-ran the gate live rather than the developer's 2026-07-25 self-report.
**what-considered:**
- G1 (Bash grant landed): HOLDS — `grep tools:` both news-scout.md/market-watcher.md = Bash-inclusive; flow-doc caveat also already repaired (FIX-COWORK-FLOWDOC-STALE-TRANSPORT-GAP-CAVEAT, 08-01).
- G2 (live invocation): FAILS — `docs/data/coverage-state.json` byte-identical to the exact 2026-07-25T16:14:39Z frozen state PO measured 12 days ago; 1 distinct stamp group both fields, same 58ins/58del uncommitted diff still sitting untouched. market-watcher's own notebook admits live write-skips TODAY (`coverage-write-skipped:mutex-ttl`, 08-06) and yesterday; news-scout's notebook claims success each cycle but the artifact contradicts it (possible confabulation).
- G3 (sweep_config self-heal): FAILS — `has("sweep_config")`=false, unchanged since 07-25.
- Re-ran `coverage-stamp.test.sh` myself: 29/29 PASS — confirms script quality is real; not the question. Confirmed commit `f824befee` on main ancestry, touches claimed files.
**why-decision:** CHANGES_REQUESTED. Artifact (script+tests+flow-doc rewiring) is genuine; the row's own acceptance bar (G2/G3, operational proof) is unmet live. This is a runtime/mutex-ttl + notebook-corroboration gap, not a design defect. Bounced qa[]→review[], routed to row's own owner (po) per flow's `verify-committed-changes` (no branch, no fixer target), redispatch_count 0→1.
**why-change:** none — followed the row's own embedded close-gate exactly.
