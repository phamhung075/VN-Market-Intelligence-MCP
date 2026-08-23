# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** active sprint per orch-state.json `.sprint_goal.entries[status==active]`
**Agent:** qa
**Started:** 2026-08-23T13:21:22Z (continuation of sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-25.md, rolled on BYTE_CAP breach — see that file's tail)

---

### STEP qa-S158 · qa · 2026-08-23T13:21:22Z
**task-id:** TASK-BCTC-INSPECT-LABEL-FIX
**what-done:** Independently re-ran tests/tsc/DDD/security/mock-guard against commit `237fa6e26` (buildLabel() quarter-duplication fix) — all green, matches developer claim exactly (49/49 + 60/60, 0 tsc errors). Verdict APPROVED/DONE_VERIFIED.
**what-considered:**
- Standard `pipeline` JUMP-TO (git checkout task/NNN branch): REJECTED — no branch exists (handoff `branch: none`), project-wide CLAUDE.md "NO branches" policy; checkout would fail.
- Direct-Commit Verify (`verify-committed`) literal source `qa[]`/status `QA`: row instead sits in `review[]`/status `REVIEW`, next_agent:qa — same technical precondition (branch:null, direct main commit) but different lane.
- Apply Direct-Commit Verify mechanics adapted to actual source lane (`review[]` → `done_verified[]` instead of `qa[]` → `done_verified[]`): SELECTED — precondition identical, target shape (status_note/qa_verified_at/verification.raw_probe) matches established fleet precedent (e.g. TASK-COWORK-CATCHUP-2, FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION).
**why-decision:** Re-ran every check myself rather than trusting prose: `bun test` on target file (49/49, 103 expect — exact match), 4 sibling regression files (60/60, 154 expect — exact match), `bun tsc --noEmit` clean, `mock-guard.sh` PASS, DDD/security greps clean (sole flagged import is a pre-existing untouched `interface→application` line, not a golden-rule domain→infrastructure violation per dev-standards.md:1796). Diff read directly matches architect D-1 spec verbatim; AC-14 assertion + 6-case normalizeQuarter() test block both present and correct, including honestly-documented Q0→0 edge case. BCTC Eval Gate + OOM Durability Gate both N/A (label-render-only, no report_id/durability claim).
**why-change:** Lane-move mechanism sourced from `review[]` not `qa[]` — flow doc's `verify-committed` template hardcodes `qa[]`/status `QA` as precondition; this row never passed through the dev-team QA-Drain, arrived via normal PM-decompose→developer→review[] chain instead, but is technically identical (branch:null/direct-commit). Adapted the jq template's source array/status guard only; target shape and evidence fields unchanged from precedent.

---

**STEP qa-S159** · 2026-08-23T13:45Z · **task-id:** REVIEW-LANE-QA-DRAIN-BATCH-20260823T1330Z (13 rows: 12 review[] next_agent=qa + 1 stranded in_progress[])

**what-considered:** (a) trust each row's own closeout prose and batch-approve; (b) re-run every load-bearing claim at source; (c) approve only the 7 agent-father rows named in the dispatch note.
**why-change:** chose (b). Rejected (a) — the dispatch note explicitly flagged CLEAN-NB-AGENT-FATHER as a possible false-shipped claim, which is the class this gate exists for. Rejected (c) after discovering the dispatch note's own framing was incomplete: 3 of the 5 rows it implied were unshipped (FIX-COWORK-TICKSNAPSHOT-STEP47, FIX-COWORK-SPAWNFANOUT-STEP53, FIX-AUDITOR-C04) carry implementation records in `verify_note`/`updated_by` rather than `status_note`, and were in fact shipped (commits `b545a69cc`, `d05864c40`). Reading only `status_note` would have wrongly rejected 3 landed fixes — FIX-COWORK-SPAWNFANOUT-STEP53's `status_note` still literally reads "LATENT, NOT SHIPPED" while the fix is on `main`. Stale prose cuts BOTH ways, not only toward over-claiming.

**Verdicts: 10 DONE_VERIFIED, 2 HELD, 1 routed back to owner.**

Anti-false-green checks that actually changed an outcome:
- `FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire`: the row's own note warned CI can go green merely because PO drained the guard's input array. Confirmed `cowork-fire` IS live in `.dev_team_idle_chain.pending_triage_inbox[]` at verify time AND the guard still exits 0 — so the pass is genuine, not a drain artifact. Paired suite 24/24 incl. TEST10 (prior QA cycle qa-S48 measured 23/24 with exactly this gap — independent corroboration the delta is this commit's).
- `CLEAN-NB-AGENT-FATHER-...-DISARM` (board-only closeout, explicitly re-verified rather than trusted): claim TRUE. `2c46efece` real, dated 2026-08-12, on `main` ancestry, subject names this task; archive file live (5981B); live notebook 99L/9179B under the 200L/12000B cap; 3/3 headings carry a date token. Critically, the "0 notebook-immutability-guard WARNs naming agent-father.md" negative is NOT vacuous — the guard is demonstrably alive, having fired as recently as 2026-08-23T09:52Z on pm.md/architect.md.
- `FIX-QA-VC-LANEMOVE-...` (my own flow file): did not merely confirm the blocks exist — executed both against a fixture. Happy paths correct; both refuse-guards fire correctly; and a guard error mid-pipe is safe because `orch-apply.sh` rejects empty stdin ("empty candidate — aborting"), so a failed jq cannot truncate the live file.
- `FIX-AUDITOR-C04`: the "byte-identical revert" of the out-of-zone `system-auditor/flow/main.md` edit verified by sha256 comparison of `d05864c40^` vs `70b3867d8` — identical (f1a8ee92b7d08755, 153599B).

**HELD (neither approved nor changes-requested — no defect evidence, precondition genuinely absent):**
- `FIX-PEK-EXTRACT-...`: code fix real and on `main` (`3db7a8dc8`, `blocking=False` → `acquire(blocking=True, timeout=wait)`), AC-1..AC-7 claimed PASS. But REBUILD_REQUIRED verified TRUE at source — the running `pdf-extractor` container was created 2026-08-15 and is "Up 8 days", i.e. it predates the 14:42 fix commit and does not contain the fix. AC-8/AC-9 are therefore not merely unrun but structurally uncertifiable today. Honouring the implementer's own explicit instruction: "Do NOT certify AC-8 on a zero-traffic window."
- `RAG-FTS-BUILD-MEMORY-BOUND`: PROSE BEATS LANE. Row is structurally READY-for-qa but its own `po_secondary_drain_20260823T0820Z` says verbatim "Stays REVIEW; done_verified STILL WITHHELD", AC#1 time-gated to `po_timegate_next_recheck_after: 2026-09-20`, plus a HARD GUARD warning that this row already produced one false green. Verifying it today would reproduce that exact defect.

**Standing red disclosed, not laundered:** full `bun test` has pre-existing failures on `main` (send_telegram routing, pollNews 9-source, 1844a backtest getAllRuns, logVpsPush). Unrelated to every row approved here by construction — all 10 approved commits touch only `.md` + `orch-state.json`, zero `.ts`/`.py`. Partly tracked already (`DEFLAKE-1187-POLLNEWS-DEAD-PATH`). Not used to block doc-only rows, not hidden either.

**Non-blocking defects recorded on rows for follow-up (not silently dropped):** pm Step 3e TRUE-branch has no `$row == null` guard — if `$SPRINT_ID` matches nothing it appends an id-less row to `done[]`; fail-safe in practice (Zod hard-rejects `task_board.done[N].id: expected string, received undefined`, live file untouched) but should mirror the explicit `error("id not in qa[] -- refuse")` idiom the qa row shipped. And the qa vc-* actuators are hard-guarded to source lane `qa[]`/`status=="QA"`, while every row in today's batch arrived in `review[]`/`status=="REVIEW"` — the guard correctly refuses rather than mis-writing, but the actuator does not yet cover the lane rows actually arrive in.

**STEP qa-S160** · 2026-08-23T13:56Z · **task-id:** FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT — **VERDICT RETRACTED, DONE_VERIFIED → CHANGES_REQUESTED**

**what-considered:** (a) let the DONE_VERIFIED stand — the row was already cold-evicted and reversing it costs a cross-file recovery; (b) accept the concurrent pm agent's report at face value and reject on both its claims; (c) re-test both claims myself and reverse only on what actually holds.
**why-change:** chose (c). Rejected (a) outright — an approval I can now show to be wrong is not something to leave standing because reversing it is inconvenient; eviction is a lifecycle detail, not a reason to keep a bad verdict. Rejected (b) because a peer's report is evidence, not a verdict — and it turned out to be half right.

**Claim 1 (lane resolution) — CONFIRMED, blocking.** Reproduced directly: with the parent in `ready[]`, Step 3e's closeout branch emits `{status:DONE, closed_at, children}` with **no id** into `done[]` and leaves the parent sitting in `ready[]`; `orch-validate.mjs` hard-rejects (`task_board.done[21].id: expected string, received undefined`). The partial branch is worse — its `map()`s only cover `in_progress[]`/`active_sprints[]`, so it silently no-ops, exits 0, and the `|| echo ABORTED` guard never fires. I then measured the real distribution instead of trusting pm's "8 of 9": rows carrying `children[]` live in **backlog 10 / done 9 / ready 6 / in_progress 1** — so the defect is broader than reported (backlog[] unhandled too) and the single lane the step does handle contains one row.

**Claim 2 (`next_agent: null`) — DOES NOT HOLD here.** The only null is inside `.head = {...}`, legal per `HeadSchema` `orchStateSchema.ts:324` (`.nullable()`); the closeout preserves the row's `next_agent` via `$row + {...}`. The real non-nullable-task-row defect (`:208`) is one I found and filed independently on FIX-QA-VC-LANEMOVE — it looks to have been carried across between the two rows. Recorded the non-confirmation explicitly on the row so the implementer does not go chasing a null this file never writes.

**Self-correction worth naming:** I had *already* found this exact not-found hazard on my first pass and written it off as a "non-blocking robustness nit / fail-safe edge case" because Zod catches it. The Zod catch is real, but I reasoned about *severity* from the failure mode alone and never asked **how often the miss happens**. pm's frequency evidence is the whole delta. Lesson: a fail-safe rejection is still a total loss of function if it fires on the common path — measure lane distribution before sizing a not-found branch as an edge case.

**Mechanics:** row had been cold-evicted to `archive/2026-08.json` `done_tasks[]` by peer commit `58bd68df6` before I could reverse it, so the retraction spanned two files — recovered the row, rebuilt it compact (14346B → 11884B: dropped the now-void `verification.raw_probe`, archived the prior status_note to `backlog-detail.json` since re-entering `review[]` at 14133B would breach the 12000B ceiling), inserted to hot `review[]` via `orch-apply.sh` (conservation 778→779, ceiling OK), *then* deleted the archive copy behind an assertion that it was already live in hot. Final uniqueness check: hot=1, archive=0.

**STEP qa-S161** · 2026-08-23T14:10Z · **task-id:** TASK-BCTC-INSPECT-UI-FILTERS — **VERDICT: DONE_VERIFIED (dual-origin live browser)**

**what-considered:** (a) trust handoff prose + curl-only checks since ops already confirmed the two `id=` strings render; (b) full live dual-origin re-verify per PO's `po_verify_chain` + user's explicit AC1-AC10 ask, using a real browser, not curl.
**why-decision:** chose (b) — router explicitly required "actually load the page in a browser... not just curl/API checks", and the handoff's own AC3 landmine warning (HUT string-quarter, 11 vs 13) is exactly the class of bug curl-on-static-HTML cannot catch (needs the client JS to actually execute `normalizeQuarter()`).
**why-change:** no change from plan.

Independently re-ran, not trusted from prose: unit tests `FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER.test.ts` 18/18; 5 named regression files 109/109 (`1976-bctc-inspector-page-nav`, `1273-bctc-inspect-overlay`, `PI3-bctc-inspect`, `PI3-bctc-inspect-reopen2`, `1271-bctc-inspect-md`); `bun tsc --noEmit` clean; DDD/security grep clean; `mock-guard.sh` structurally cannot scan `.html` (extension gap, not a false PASS I invented) so hand-read the full diff instead — zero fabricated/hardcoded data, every value sourced from the already-fetched `items[]`. Commits `2e66153fd`/`cab92d7c5` confirmed ancestor of local `main` (this repo's sole "already on main" reference — NOT pushed to `origin/main` yet, 59 unpushed commits queued behind an unrelated push-cadence gap; out of QA's scope here, ancestry-to-local-main is what the flow's Direct-Commit Verify checks).

Live Playwright (real headless Chromium, both origins, identical results): quarter facet 11 real options + placeholder "— tất cả (11) —" (NOT 13 — HUT's 2 string-`"Q1"` rows correctly coerced by `normalizeQuarter()` into existing numeric buckets, verified against raw `/docs` payload: 11 distinct `(year,quarter)` keys incl. the 2 HUT string rows). Ticker facet 50 + placeholder. AC5 AND-compose (ticker=HUT + quarter=2024-1) → exactly 1 doc, zero network requests fired. AC7 zero-match (ticker=HUT + quarter=2026-2) → single `disabled`+`selected` placeholder, status bar "Quý 2 2026 × HUT: không có tài liệu khớp", zero console errors (screenshotted both origins — pixel-identical). AC9 label "HUT Q1 2024" (not "Q1 QQ1 2024") confirmed live via paired commit `237fa6e26`. FR-7 selection-preservation: selected a real doc, applied a still-matching ticker filter, `select.value` unchanged + **zero** network requests fired (confirms no synthetic `change` dispatch — the existing handler would have re-fetched PDF/OCR/table/md for that doc_id had it fired) — `total_docs_fetch_count_whole_run=1` across the whole multi-filter interaction sequence, confirming AC2. Blast-radius: `/health` toolCount=183 ✓ (matches handoff); no `scheduler` field exists in `/health` at all (structural, not a regression — confirmed via source read, this task touched zero scheduler files); `/api/cron-status` layer_a_count=89 as the nearest proxy, off by one from the router's stated 88, unrelated to this diff. `/api/bctc-inspect` 200 both origins; `/dashboards/news-fetch/` 200 on `:3000` — `:3001` 404 confirmed structural (frontend has no route for that path prefix at all, pre-existing, not a regression). BCTC Eval Gate / OOM Gate: N/A (UI-only change, no report_id, no memory/crash claim).

VERDICT: `DONE_VERIFIED`. Appended `[QA] Review Record (direct-commit verify)` to the row's `status_note` (row arrived in `review[]`/`REVIEW`, not `qa[]`/`QA` — used the cycle-809/810 adapted-lane form, `review[]`→`done_verified[]`, guard on `status=="REVIEW"`); `verification.raw_probe` attached same write (avoids the qa-S159/S160-flagged vc-* actuator gap: that actuator both hard-guards to the wrong source lane for this row shape AND never writes `verification.raw_probe`). Self-verified persisted. Task Report `reports/TASK_REPORT_TASK-BCTC-INSPECT-UI-FILTERS.md`.

### STEP qa-S162 · qa · 2026-08-23T14:29Z
**task-id:** FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION
**what-done:** Direct-commit verify of commit `e806bcda1` (branch:null, dev-team Review-Lane QA-Drain row) — VERDICT `vc-approved`, actuated via the FIX-QA-VC-LANEMOVE jq/orch-apply.sh block (dry-run against fixture first, then live write), `qa[]`→`done_verified[]` same write.
**what-considered:**
- trust the row's own 53/53-GREEN claim vs re-running the test file live — re-ran live, matched exactly (53 pass/0 fail; RED baseline 38/15 also matched claim)
- run pipeline JUMP-TO vs Direct-Commit Verify — row has `branch:null`, checkout impossible, used verify-committed per dispatch table
**why-decision:** all 6 claimed files matched `git show --stat`, commit is ancestor-of-main, test suite genuinely green on re-run, mock-guard PASS (bash-only zone, no TS/JS to scan), no hardcoded secrets, NAMING-DRIFT correction (TELEGRAM_BUG_CHAT_ID→TELEGRAM_REPORT_BUG_CHANNEL_ID) independently confirmed correct via grep against the actual fallback chain in `_bug_chat_id()`. Not OOM/durability-class (alerting-gap fix), Durability Gate N/A.
**why-change:** no change from plan — this is the first QA pass on this row (no prior notebook/journal entry found), not a redispatch.

### STEP qa-S163 · qa · 2026-08-23T14:30Z
**task-id:** TASK-CRON-LIVENESS-PROBE-TESTS
**what-done:** Direct-commit verify of commit `2c9998018` (branch:null, dev-team Review-Lane QA-Drain row) — VERDICT `vc-approved`, actuated via the FIX-QA-VC-LANEMOVE jq/orch-apply.sh block (dry-run against fixture first, then live write), `qa[]`→`done_verified[]` same write, self-verify PASS.
**what-considered:**
- trust the row's own 87/87-GREEN + mutation-test claim vs independently re-running both — re-ran `cron-marker-liveness-probe.test.sh` live (87/87 match) AND independently reproduced the mutation test on a scratch copy (hoisted O2 above O1 in `cron-marker-liveness-probe.sh`): F1 went red (3/3 assertions: verdict/action/exit), 84/87, confirming F1 is not a vacuous pass — this fleet's documented false-green failure mode (dispatch note: "a passing suite that never exercised the defect").
- pipeline JUMP-TO vs Direct-Commit Verify — row has `branch:null`, used verify-committed.
**why-decision:** commit is ancestor-of-main, touches the row's claimed file, test suite genuinely green on re-run AND the negative control (mutant) genuinely fails on the exact O1-outranks-O2 defect axis, mock-guard PASS (bash-zone, no TS to scan, consistent with sibling `.test.sh` convention), CANONICAL pointer present in dev-standards.md. Not OOM-class.
**why-change:** no change from plan.

### STEP qa-S164 · qa · 2026-08-23T14:30Z
**task-id:** TASK-CRON-LIVENESS-PROBE-SCRIPT
**what-done:** Direct-commit verify of commit `2c9998018` (branch:null, dev-team Review-Lane QA-Drain row, sibling of qa-S163's TESTS row, same shared commit) — VERDICT `vc-approved`, actuated via the FIX-QA-VC-LANEMOVE jq/orch-apply.sh block (dry-run against fixture first, then live write), `qa[]`→`done_verified[]` same write, self-verify PASS. Scope held to the SCRIPT row only per dispatch instructions — did not verify or move the TESTS row (a concurrent qa session's territory; confirmed post-write it landed independently with no CAS collision, both rows now in `done_verified[]`, neither left in `qa[]`).
**what-considered:**
- trust the row's own 87/87-GREEN claim vs re-running the test file live — re-ran `cron-marker-liveness-probe.test.sh` directly, matched exactly (87/87), and confirmed the mocks are real stubs (`ps`/`stat` overrides + `mcp_call()` stub at test.sh:109), not vacuous.
- run `bun tsc --noEmit` per the Pipeline checklist vs treating it N/A — no `.ts` touched by this commit and no `tsc` script exists at repo root (root `package.json` has no `tsc`/`check` alias reaching it); logged as N/A rather than silently skipped.
- pipeline JUMP-TO vs Direct-Commit Verify — row has `branch:null`, used verify-committed.
**why-decision:** commit is ancestor-of-main, `git show --stat` touches the row's claimed file (plus sibling `.test.sh` + 2 docs, shared commit), test suite genuinely green on re-run, all 6 measured traps spot-verified present in the shipped `.sh` (LC_ALL=C, no etimes, stat %m not %Sm, O1-before-O2 ordering, PID triple, transcript-path), mock-guard PASS (0 findings — `.sh` outside its `.ts/.tsx/.py/.go` scan set, compensated with manual diff read), no hardcoded secrets/process.env. Not OOM/BCTC-class, both gates N/A. Did not treat this fleet's known cron-liveness trap (absence-of-evidence read as DEAD) as satisfied by prose — verified the O1/O2/O3 ranking and mandatory UNKNOWN branch directly in the shipped code, not merely in the review_note.
**why-change:** no change from plan.

### STEP qa-S165 · qa · 2026-08-23T14:33Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Re-check of my own prior HELD verdict (13:50Z) — VERDICT stays HELD (not vc-approved, not fixer-bound): moved `qa[]`→`review[]` via the vc-changes actuator, `next_agent` forced literal `"ops"` (not the owner-fallback default, owner/owner_agent both null on this row).
**what-considered:**
- trust the drain-side `next_agent:qa` reroute vs re-derive independently — row's own `next_agent_note`/`ac8_ac9_blocker` fields plus my prior HELD note already name the exact 3-step remaining path (rebuild→requeue→24h window); re-verified each step live rather than accepting the drain's implicit "ready for qa" framing.
- accept detail_ref's `next_agent: qa` (stale copy, updated_at 12:51Z) vs the hot row's `next_agent: ops` (13:50Z+) — hot row wins, detail_ref predates my own prior routing decision and was never synced.
**why-decision:** live-verified blocker(1) NOW RESOLVED (container recreated 14:14:48Z, `docker exec` grep confirms `acquire(blocking=True, timeout=wait)` + `PEK_SEMAPHORE_WAIT_SECONDS=1800` present) but blocker(2) UNRESOLVED (live `market.db` query: `pek_triggered=0`; 0 pek_extract/SemaphoreContendedError log lines since container start; container up ~15min, far short of the required ≥24h traffic window) — AC-8/AC-9 remain structurally uncertifiable, not a code defect. Re-ran AC-1..7 independently, not on trust: commit `3db7a8dc8` real+main-ancestor+touches claimed files, 49/49 pytest pass INSIDE the actual deployed image (`docker exec`, not host), mock-guard PASS. No defect found → did not route to fixer (fix-root-cause discipline); named `ops` explicitly since it is the only party positioned to do steps (b) requeue + (c) wait, matching my own 13:50Z precedent.
**why-change:** continuation of my own 13:50Z HELD verdict on the same row, one blocker closed since then (rebuild), one still open (traffic window) — not a fresh finding, a re-measurement.

### STEP qa-S166 · qa · 2026-08-23T14:32:37Z
**task-id:** FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR
**what-done:** Verified redispatch-1 fix `cf281daed` by EXECUTING the shipped `vc-approved`/`vc-changes` blocks (not reading them) against a throwaway fixture via `ORCH_APPLY_LIVE_FILE_OVERRIDE` + real `orch-apply.sh`/`orch-validate.mjs`. APPROVED.
**what-considered:**
- trust "one drain worked once" as proof vs re-execute the literal current blocks — task brief flagged intermittency explicitly; ran positive + negative controls instead.
- read the diff only vs replay pre-fix (`863a250e3`) forms too — replayed both pre-fix defects live, both reproduced the exact validator error qa's own prior CHANGES_REQUESTED cited.
**why-decision:** 6/6 fixture runs matched claim: vc-approved fixed form exit0+self-verify PASS; vc-approved pre-fix (`next_agent:null`) → validator "expected string, received null", exit1, live file untouched; vc-changes fixed form (owner absent→owner_agent, both absent→"po") exit0 both; vc-changes pre-fix bare `$t.owner` (owner absent) → same validator error; RC-VERIF empty-probe fail-loud refuse fired correctly. Commit is main-ancestor, touches only the row's claimed file. `grep ZZTEST` on live hot file = 0 throughout — no fixture leakage.
**why-change:** no change from plan; this row IS my own flow's actuator, so I closed it by landing my own real write below, not narrating it.

### STEP qa-S167 · qa · 2026-08-23T14:33Z
**task-id:** FIX-CHEF-MARKER-KEY-ANCHOR-1
**what-done:** verify-committed on row's `commit=777ec912f` → FAILED `git merge-base --is-ancestor` literally; traced via git log/reflog: 777ec912f was amended 26s later to `e315472b7` (content-identical diff, reviewed_at cross-checks to the second) — verified the real commit instead of blocking on a stale hash. vc-approved, `commit` field corrected in the same write.
**what-considered:**
- hard-fail on literal ancestor-check miss (send back to developer for a hash-only fix) vs re-derive real commit via the flow's own Fallback clause and verify that — content-diff (empty) + timestamp cross-check (row.reviewed_at 13:58:07Z vs e315472b7 committer-date 13:58:08Z UTC) made fabrication implausible; chose re-derive, corrected the row rather than bouncing a working change for a metadata artifact.
- treat as OOM/BCTC-class (extra gates) — neither applies (no memory/crash/report_id in scope).
**why-decision:** e315472b7 is a real ancestor-of-main `git commit --amend` of 777ec912f (reflog: `main@{15:58:08+0200}: commit (amend)`), all 3 claimed files present in its stat, all tests green re-run live (own suite 90/90, 3 siblings 34/34+53/53+75/75), mock-guard PASS, no DDD/secret hits, docs/WORK.md entry present with Task:/AC: trailers, ANCHOR-2/3/4 scope-correction claim independently confirmed on the live board (next_agent=agent-father, status=TODO).
**why-change:** no change from plan; the stale-commit-hash finding was unplanned (surfaced only by literally running the ancestor check rather than trusting the row's own field).

### STEP qa-S168 · qa · 2026-08-23T14:38Z
**task-id:** FU-RAG-DEPLOY-MEMORY
**what-done:** Re-assessed at the matured ≥24h floor. D1/D2/D4 PASS on live evidence; D3/D5 NOT SATISFIED and NOT reconstructible. HELD at `qa[]` (no lane move), root cause fixed by shipping `scripts/durability-mem-sample.sh` and opening a real instrumented window.
**what-considered:**
- flip DONE_VERIFIED because the wall clock matured and the downstream `RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE` chain is blocked on it — refused; the AC is D1-D5, not "24h elapsed", and this family has three recorded false certifications.
- route `vc-changes` to force movement — refused; zero evidence of a code/config defect (`4df192e05` verified, 1g→2g diff intact), so CHANGES_REQUESTED would be a fabricated finding.
- hold again with "recheck after N hours" (the prior three cycles' disposition) — rejected as *the* recurring defect: the blocker was never patience, it was that nobody was sampling, so a fourth deferral guarantees a fourth identical note.
- fit D3 on the six existing ad-hoc point reads — refused after computing it: they are sawtooth phase samples (73.03%→54.10% in 17 min), and a controlled 26-sample/13.1-min series fits to +0.129 pp/min, which would "FAIL" D3 on pure short-window noise. Both certifying and rejecting on that number would be wrong.
**why-decision:** D1 window 2026-08-22T12:40:04Z→14:21Z = 25h41m, zero kernel OOM in a dmesg buffer spanning 2026-08-20T11:53:13Z→2026-08-23T14:20:33Z, negative proved non-vacuous (901 `docker0` hits, same buffer) and VM clock confirmed UTC. D2 identity unbroken (`16c59b5e929f`, StartedAt `2026-08-15T10:16:22.548533876Z`, RestartCount 0). Cap read LIVE = 2147483648, not from the thrice-stale AC prose. D4 clean (only in-window compose commit `3db7a8dc8` touches pdf-extractor env). D3/D5 impossible: rag-service logs 0 memory lines in 10630 since window open, no metrics endpoint, no sampler, `docker stats` has no history. Parked the measured values under `qa_durability_probe_20260823T1437Z` — deliberately NOT the six canonical D5 field names — so no later reader mistakes a partial result for a satisfied D5.
**why-change:** changed the *class* of disposition from "too early" to "structurally unmeasurable, instrumentation now installed"; new window open 14:36:47Z, earliest legit close 2026-08-24T14:37Z.

### STEP qa-S169 · qa · 2026-08-23T14:41Z
**task-id:** FU-RAG-DEPLOY-MEMORY
**what-done:** Found and proved by execution that this row is exempt from the only automated DONE_VERIFIED evidence gate. Escalated on-row; did not patch (apps/mcp-server is out of qa's zone).
**what-considered:**
- report the code reading alone (`checkVerificationGate` guards on `!RC_VERIF_GRANDFATHERED_IDS.has(id)`) — insufficient; my own last cycle's retraction came from reasoning about a failure mode instead of firing it.
- run the repro on the live file — refused; used `ORCH_APPLY_LIVE_FILE_OVERRIDE` against a fixture and unset it after, verified UNSET.
**why-decision:** paired repro with a control. Identical `del(.verification)` + `status:"DONE_VERIFIED"` transform: `FU-RAG-DEPLOY-MEMORY` (member, orchStateSchema.ts:569) → "Stage 0 + Stage 1 PASS", write applied; `FIX-MARKETWATCHER-EODMD-…` (non-member) → "VALIDATION FAILED (1 issue) … without verification.raw_probe" → "ABORTED: validator exit 2". So the exemption, not the evidence, decides — on an OOM-class P0 with 3 prior false greens in-family and a downstream row pressuring it toward DONE_VERIFIED. Bar §4 already documents this as a known open gap with process-control-only mitigation; this is the live proof it is exploitable on the worst possible member.
**why-change:** unplanned finding, surfaced only because the OOM gate told me to check the grandfather list.

### STEP qa-S170 · qa · 2026-08-23T14:20Z
**task-id:** FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION
**what-done:** `vc-approved`/DONE_VERIFIED (adapted source lane: row sat `review[]`/REVIEW, so the shipped actuator's `status=="QA"` guard does not match). Also flipped `FACTORY-APP-split-assembleBriefing` first, which completes this row's own verification_gate end-to-end.
**what-considered:**
- accept the `review_note`'s AC coverage — refused for AC-5, which the note simply omits; ran `devteam-deps-satisfied-sole-failure-report.sh` myself.
- treat the note's "KNOWN BLOCKING CROSS-DEPENDENCY" (Component 3 / raw_probe) as a blocker — checked: `cf281daed` shipped it, and I exercised it live this cycle; also brief §6 never assigned Component 3 to this row.
- count `DONE_VERIFIED` occurrences in the two `.jq` files (3 and 2) as AC-3 violations — read every line instead: all five are comments, zero writes.
**why-decision:** 4/4 commits ancestor-of-main; harness 42/42 exit 0; tsc 0; AC-2 and AC-4 demonstrated on the *real* board (`drain_source_lane=done` on FACTORY-APP…, `secondary_dispatch_target=po` with status still DONE on FIX-PO-TRIAGE-SIGNALS-TABLE…); AC-5 re-measured with named reasons for every remaining member (2 depend on cold-evicted rows — brief §0/§5 out of scope; 2 depend on `TASK_RUNIDLE-1-AUDIT`, hot in `done[]` with next_agent=pm, i.e. inside SECONDARY-drain's eligible set awaiting 1-row/tick throughput); sole-deps_satisfied starved count moved 59→58 and `FACTORY-APP-split-assembleEveningSummary` left the starved set after the demonstration flip.
**why-change:** ordering change from plan — verified the child (`FACTORY-APP-split-assembleBriefing`) *before* the parent, because the parent's verification_gate literally requires "a done[] row transitioning to DONE_VERIFIED through the new producer with real command output".

### STEP qa-S171 · qa · 2026-08-23T14:34Z
**task-id:** FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION
**what-done:** Independent post-hoc re-verification of a row a peer had already flipped. CONFIRMED. Then RETRACTED my own governance claim about it ~10 min later.
**what-considered:**
- accept the peer's `raw_probe` (suite 53/53) — insufficient: that suite stubs `CURL_BIN`, so it cannot prove the escalation is reachable in production. Ran a real-environment no-network smoke test instead.
- read the row's fields and conclude "self-certified, gate bypassed" — I DID this and it was WRONG (see why-change).
**why-decision:** escalation proved reachable end-to-end: real `.env`, no `FIRER_ALERT_CHAT_ID` override, only `SLOT_MATCHER_CMD` forced to exit 7, `CURL_BIN` a capture stub → zero `ESCALATION-BLOCKED`, `_bug_chat_id()` resolved non-empty, well-formed sendMessage POST constructed. Scope verified by grep, not assumption: the script reads `last_fired` ZERO times, so it cannot false-escalate against the 9 stale slots — and `market-watcher`/`alert-commander` committed today against 8-9d stale stamps, confirming `last_fired` tracks the cowork path, not delivery.
**why-change:** **RETRACTED** the "self-certification that never passed the qa gate" claim. I inferred it from `updated_by=developer` + absent `qa_verified_by` without checking the decision journal — where peer STEP qa-S162 records a full verify. Corrected on-row to what the evidence supports: a provenance-stamping gap, not a gate bypass. Also corrected point (4) of the qa-S169 escalation, which had cited the same two rows. **Absence of a field is not evidence of absence of the work.**

### STEP qa-S172 · qa · 2026-08-23T14:45Z
**task-id:** SYSREMAKE-P2-T9-QA-GATE
**what-done:** Triaged all five `ready[]` rows carrying `next_agent=qa`; found every one non-executable; recorded the measured blocker on each and routed to `po`.
**what-considered:**
- run the executable fraction of each (e.g. T9's orch-validate/orch-apply legs without T3/T5/T6) and report a partial green — refused; a partial gate reported as a gate is the exact false-green shape these rows exist to prevent.
- run `QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL` assertion 2 (force Layer B dead) — refused on safety: a live peer session was running dev-team plus agent-father/agents-architect/ops/developer in parallel; CronDelete-ing the master would have killed them. Recorded assertion 1 as PASS (plist loaded, last exit 0) so it is not redone.
- change lane to BLOCKED myself — declined; re-declaring dependencies and re-laning is po/pm's call, so I routed rather than re-laned.
**why-decision:** measured each: T9 needs T3/T5/T6, all `ready`/READY with `files=[]`; FANOUT-T8 needs T1/T2/T4, all `ready`/TODO; SESSION-DOWN names two gates (`OPS-COWORK-GUARANTEED-SLOT-INSTALL`, `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED`) absent from every hot lane; STALE-SLOT-DISPOSITION-TABLE's 4 declared deps are all TODO *and* its named "frozen 2026-08-23T09:00Z snapshot" does not exist on disk; SIGINBOX-LIVE-FIRST-RUN-GATE's dep is READY, unbuilt. **Systemic finding: 4 of the 5 carry `depends_on: []` while naming their prerequisites in prose only** — so the gating is invisible to `deps_satisfied()` and the rows present as dispatchable to qa. Same class as the pickers-blind-to-prose defect.
**why-change:** no change from plan; the `depends_on: []` pattern was an unplanned finding from checking all five instead of starting the first one.
