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

### STEP qa-S31 · qa · 2026-08-22T18:05:00Z
**task-id:** FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED
**what-done:** Direct-Commit Verify (no branch, direct-to-main FIX). Independently re-verified AC-1..4, did not trust developer's commit-message claims alone.
**what-considered:**
- AC-3 data repair (`35be008d0`): extracted `git show f25dc3d27^:...` parent blob myself, byte-diffed the restored `c103`/`d4-auto` sections against it (`diff` exit 0, only trailing-EOF-newline noise) — genuinely byte-identical, not fabricated. Diffed the surviving Tier-1 body (`f25dc3d27`'s `c104`, 177L) against the new `c105`'s first 150 lines after a `sed` renumber — exact match, confirms the 150L-cap trim paid out of the NEW section, never a restored one. File now 3 sections/172L, matches row's own `measured_evidence` replay exactly.
- AC-1/AC-2 (`a7262f6e9`): read the real diff, not the message. `TIER=DATA` row added verbatim to §Tier Dispatch binding to `notebook (gated) → RETURN`; L130 bullet no longer says "falls through to default". New `elif AUDIT_TIER=="DATA"` in §Step 0d sets ONLY `FIRE_TICK`/`FIRE_TASK_ID` (same 2-var shape as the 1/2/3/5 branches beside it) consumed by the SAME downstream generic `task_claim` call — confirmed inert plumbing, zero new judgment/verdict logic, other tiers' own branches untouched by the diff (pure insertion). `notebook-compose.sh` confirmed untouched (0-line diff across both commits).
- AC-4: `grep AUDIT_TIER= .claude/commands/crons/*.md` myself → {1,2,3,4,5,DATA}, all 6 now have a §Tier Dispatch row (live grep, not copy-pasted).
- AC-5 explicitly left open by developer (needs 3 real post-ship cycles incl. 1 DATA fire) — not re-measured, per PO's own gating instruction.
**why-decision:** vc-approved / DONE_VERIFIED — all 4 in-scope ACs independently reproduced from git history + live file reads, no narration-only trust; no regression found on any sibling tier.
**why-change:** none from plan — straight verify-committed pass, single round.

### STEP qa-S32 · qa · 2026-08-22T20:15:00Z
**task-id:** FACTORY-ALERT-dedup-window-config
**what-done:** Direct-Commit Verify round 2 (ops rebuild-redeploy re-check after my own 2026-08-06 vc-changes deployment-gap ruling). Independently RAW-re-verified, not trusted from ops's status_note prose.
**what-considered:**
- Image: `docker inspect` `.Created`=2026-08-22T17:56:29Z, container `StartedAt`=17:56:38Z, ContainerID `cd90ef25` new (RestartCount=0) — genuinely recreated, postdates commit 43f4e3add (2026-07-28T23:25:42+02:00).
- Binary: `docker exec ... grep -a` myself — "seen within %dmin" present, "seen recently" absent (flip confirmed, not copy-pasted from ops report).
- Peer isolation: enumerated all 12 running containers' `StartedAt` — only alert-engine-1 changed; no `depends_on: alert-engine` anywhere in compose — `--no-deps` recreate provably isolated.
- Intent: read backlog-detail.json DoD verbatim — "config-sourced" = named `CooldownConfig.DedupWindowMinutes` field (not env/file runtime load) — diff matches DoD exactly; re-ran `go build`/`go test ./pkg/domain/... ./pkg/module/alert_pipeline/...` (host, static Go binary, no image-vs-host drift risk) 10/10 pass, mock-guard PASS, ancestry confirmed.
**why-decision:** vc-approved, DONE_VERIFIED — deployment gap from round 1 genuinely closed; code+deploy+intent all independently reproduced.
**why-change:** none from plan — routine round-2 re-verify of a flagged rebuild claim.

### STEP qa-S33 · qa · 2026-08-22T18:49:14Z
**task-id:** FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE
**what-done:** Re-verify (2nd bounce) of WF-3 lane-move fix in `main.md` (commits e6f4455a7 brief-correction, dc0f90334 agent-father re-apply). Did not trust agent-father's narration.
**what-considered:**
- Ancestry: both commits confirmed on main via `git merge-base --is-ancestor`. Diff isolated: `git show --stat dc0f90334` = 1 file, 29 ins/8 del, single hunk, no collateral change to WF-1/2/4/S2.
- Structural match: extracted WF-3's jq verbatim (main.md:473-483), compared line-by-line against WF-1 (main.md:331-338) — identical shape (head-reset → if-in-in_progress guard → backlog append → in_progress removal → else no-op), WF-3's only addition is the BLOCKED-status merge it alone needs.
- Own dry-run (not agent-father's): ran the extracted filter against a synthetic fixture — positive control moves row in_progress[]->backlog[] with status/hold_reason/resume_attempt_bound_exceeded_at/_by in the SAME write; negative control (sibling row) untouched; else-branch safe no-op.
- Duration parenthetical: reproduced dur_text formula myself, rendered "(12h0m)" correctly, matches WF-4's identical computation.
**why-decision:** vc-approved, DONE_VERIFIED — CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c) now genuinely satisfied, duration parenthetical present, zero blocking issue.
**why-change:** none from plan — straight re-verify, single pass. Task Report: `reports/TASK_REPORT_FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE.md`.

### STEP qa-S34 · qa · 2026-08-22T21:58:00Z
**task-id:** FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
**what-done:** Direct-Commit Verify (review[]->done_verified[]); independently re-ran every claim, did not trust developer narration.
**what-considered:**
- Live re-run verify-sprint-registry-referential-integrity.mjs: counted_violations=0, matches po_signoff table exactly (11 LIVE/2 RELABEL/3 STRIP applied, 8 PRE_SPRINT_LABEL exempt remain); zero rows still reference the 5 superseded ids.
- Fresh smoke orch-apply.sh write (bumped _updated_at/_updated_by): exit 0, Stage1h ran clean — the reported bare-Set-arg fleet-wide crash is genuinely fixed, not narrated.
- checkSprintRegistryReferentialIntegrity (orchStateSchema.ts:1765) confirmed to literally delegate to classifySprintRegistryDanglingIds — real, not re-derived.
- Full bun test reproduced independently: 15334/51/40 (dev claimed 15335/50/40, 1-test flaky delta) — all 51 failures span 16 files last touched 2026-05/06, none overlapping this task's diff.
- FOUND: the actual reconciliation write physically lives inside unrelated commit 986717b53 (architect, wrong Task: trailer) — shared-workdir collision, not in the 5 commits reported; content independently verified correct regardless.
**why-decision:** APPROVED/DONE_VERIFIED — every checked claim held live; the commit-attribution gap is a non-blocking process finding, not a functional defect.
**why-change:** none from plan — standard direct-commit-verify rigor, one extra independent discovery recorded.

### STEP qa-S35 · qa · 2026-08-23T09:00:00Z
**task-id:** FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION
**what-done:** qa[]-lane oldest-first drain. RAW-verified AC-4's mandated "next live chef fire" check against the persisted JSON, per the row's own handoff instruction — not trusted from status_note prose.
**what-considered:**
- Only 1 dish carries a cycle_id after the fix commit (5829a7ad2, landed 2026-08-14T21:04Z): docs/data/unified-agent-synthesis-2026-08-22-chef-evening.json. Confirmed genuine (TNB c115.5 independently cites the same cycle_id/fire-time, not fabricated).
- jq'd its top-level + metadata keys against chef-dish.md's mandated 7-key SCHEMA_OK spec (:864-914): file carries 9 keys (extra execution_notes/signals_consumed) and a reshaped metadata block (no timestamp_utc/layers_walked_summary) — a live SCHEMA_OK violation with NO [gap:schema_nonconformant_corrected] token and no self-correction, despite the post-write self-check (chef-dish.md:964) mandating exactly this catch.
- Cross-checked 2 pre-fix committed dishes (07-29/07-30 chef-evening) — both match the 7-key schema exactly, confirming this is drift, not a pre-existing/undocumented shape.
**why-decision:** CHANGES_REQUESTED — the fix's own newly-added enforcement mechanism did not fire on its first live opportunity; AC-4's external leg is unmet. Routed to agent-father (no .owner field on row; agent-father authored the fix).
**why-change:** none — hard rule requires verifying against real artifacts over status_note narrative; this is exactly that.

### STEP qa-S36 · qa · 2026-08-23T09:05:00Z
**task-id:** FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER
**what-done:** Direct-Commit Verify. Re-ran gate + tests myself, did not trust the 42-agent table in status_note.
**what-considered:**
- `bash scripts/audits/agent-bash-grant-coverage.sh --check` live: exit 0, 42/42 agents, table matches status_note verbatim.
- `agent-bash-grant-coverage.test.sh`: 10/10 pass. CI wiring confirmed live at .github/workflows/ci.yml:529-554.
- AC-6 (the hard bar — a live digest-predict cycle must self-commit via the new grant): grant landed 476646c4e (2026-08-14T21:11Z UTC); `git log` shows commit c4fc71708 (digest-predict notebook, 2026-08-22T17:48Z UTC) — real, after the grant, not a narrated claim.
- AC-8 spot-check: alert-commander/market-watcher/news-scout/fb-market-poster/orch-sentinel descriptions all now read "Bash is scoped to..." — self-contradiction resolved.
**why-decision:** APPROVED/DONE_VERIFIED — every AC (1,3,4,6,8) independently reproduced against live artifacts.
**why-change:** none.

### STEP qa-S37 · qa · 2026-08-23T09:08:00Z
**task-id:** FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE
**what-done:** Direct-Commit Verify of piece 2 (agent-father's main.md call-site edit) — piece 1 was already QA-approved in a prior cycle; re-verified it stayed intact.
**what-considered:**
- `bash scripts/auditor-notebook-commit.test.sh`: 24/24 pass, matches piece-1's prior record, unregressed.
- Read main.md:1148-1151 directly: notebook-commit call site now carries `--markers-file "$MARKERS_FILE" --cycle-tag "$FIRE_TASK_ID"`; ABORT bullet (:1177) names contract-plane-mismatch explicitly.
- Read the sibling heartbeat call site (~:1339): confirmed still the bare 2-arg form, deliberately untouched — matches the row's own AC-3 scoping.
**why-decision:** APPROVED/DONE_VERIFIED — both pieces of this PO-split row now confirmed end-to-end against live file content, not narration.
**why-change:** none.

### STEP qa-S38 · qa · 2026-08-23T09:11:00Z
**task-id:** TASK_2008a
**what-done:** No status_note existed — derived verification from files[]/dispatch_note's 3 cited commits + re-ran tests myself.
**what-considered:**
- Commits 75cc18eca/994a2c117/70bd7e7bd all confirmed ancestors of main; diff matches title (calendar_status via injectable-deps + SESSION_STATUSES enum gate).
- `bun test emit-pressure-state.test.ts`: 35/35 pass. `bun tsc --noEmit`: clean. mock-guard PASS. DDD: only interface-layer file imports infrastructure (architecturally correct); domain file (vnTradingCalendar.ts) has zero infra imports.
**why-decision:** APPROVED/DONE_VERIFIED.
**why-change:** none — empty status_note required deriving evidence from files[]/commits instead of trusting prose (none existed to trust).

### STEP qa-S39 · qa · 2026-08-23T09:13:00Z
**task-id:** TASK_2008b
**what-done:** No status_note existed. Located commit via `git log` on files[], verified content + tests myself.
**what-considered:**
- Commit a860a5b9f (real, on main): diff removes L150 calendar_status read + drops it from Step-8-SILENT emit_args, matches AC (FR-A3) exactly.
- `cowork-tick-preflight.test.sh`: 75/75 pass, incl. T2e which directly asserts emit args carry no calendar_status key.
**why-decision:** APPROVED/DONE_VERIFIED.
**why-change:** none.

### STEP qa-S40 · qa · 2026-08-23T09:15:00Z
**task-id:** TASK_2008c
**what-done:** Verified agent_father_implementation_note against the actual commit (none cited by id — found via git log on files[]).
**what-considered:**
- Commit 7beb78e07 (real, on main): telemetry.md L15 calendar_status arg deleted (FR-A4); pressure-read.md gains CALENDAR_STATUS_DOMAIN 5-value enum + fail-loud (FR-A5) — diff matches claim exactly, incl. correct non-touch of telemetry.md:63's distinct Step-6.1 payload field.
- Line counts refreshed headers (163L/117L) match `wc -l` exactly. No unit-test twin (documented, Step 4.3 is pure prose) — accepted given TASK_2008a/b's own code+tests independently close the mechanism this doc wires into, and live pressure-state.json shows a valid domain value ("weekend") flowing through end-to-end.
**why-decision:** APPROVED/DONE_VERIFIED.
**why-change:** none.

### STEP qa-S41 · qa · 2026-08-23T09:20:00Z
**task-id:** FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK
**what-done:** Re-ran the prior QA re-check's own prescribed command (git log since AC-3 fix landed) rather than trusting elapsed time alone.
**what-considered:**
- AC-1/AC-2 (stale caveat + same-tick clobber mutex): now solidly proven — 4 separate real weekday 16:0xZ co-fires (08-06/07/12/13) all show BOTH eod and offhours notebook commits landing cleanly same-tick, no clobber, no stale-caveat skip.
- AC-3 (news-scout L-7 on next weekday EOD fire): code landed (3d2ff4ee2/7a94f3dd5/f795efe35) but genuinely unexercised — `cowork-schedule.json` shows market-watcher-eod.last_fired stuck at 2026-08-14T16:10:51Z, 5+ weekdays with zero EOD fire since (consistent with the separately-tracked host-suspension gap, not a fix defect).
**why-decision:** HELD, no lane move — AC-3's specific proof bar (a real weekday EOD fire) still has zero opportunity to have occurred; flipping now would repeat the exact "certify on an unsettled/absent window" pattern this fleet is trying to stop.
**why-change:** none — matches the prior QA re-check's own standard, reapplied.

### STEP qa-S42 · qa · 2026-08-23T09:23:00Z
**task-id:** FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER
**what-done:** Re-ran the row's own 2026-08-06 QA CLOSE-GATE (G1/G2/G3) live, 18 days after that CHANGES_REQUESTED froze it.
**what-considered:**
- G1 (transport): still holds. G2 (live invocation): now holds — coverage-state.json `_updated_at` moved to 2026-08-22T20:11Z (was frozen since 07-25), per-ticker stamp groups are no longer a single blanket group (news_scout [23,34], market_watcher [23,31,3]).
- G3 (sweep_config): now holds — key present with correct defaults {48h,3}, not clobbered. market-watcher's own notebook shows `sweep_tickers_forced=3`, matching config — the rotation is actively firing, not just structurally present.
- `coverage-stamp.test.sh`: 29/29 pass; flow-doc wiring in all 4 sites confirmed present.
**why-decision:** APPROVED/DONE_VERIFIED — all 3 gates that failed in Aug-06 now independently hold on fresh live evidence.
**why-change:** none.

### STEP qa-S43 · qa · 2026-08-23T09:26:00Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Re-ran the test-pointer-only fix's own claim (10/10 GREEN against live HEAD) rather than trusting the prose.
**what-considered:**
- `test-fb-gate-checkd2-nonwaivable.sh`: 10/10 pass live. `test-fb-gate-checkc-negation.sh`: 6/6, no collateral.
- Read daily.md:649-687 directly: Check-D2 marked NON-WAIVABLE with the recompute-baseline fix protocol present; Check-C's own waiver path intact (narrowed, not deleted).
- Both commits (1b506cbdd, c678ef57e) confirmed on `origin/main` via fetch — not just local.
**why-decision:** APPROVED/DONE_VERIFIED.
**why-change:** none.

### STEP qa-S44 · qa · 2026-08-23T09:32:00Z
**task-id:** FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED
**what-done:** Live docker/dmesg probe of the current container, cross-checked against blocked_by row FU-RAG-DEPLOY-MEMORY's own certification floor (po ruling: window must start after 2026-08-22T12:40Z, run >=24h).
**what-considered:**
- Current container 16c59b5e929f: MemLimit=2GiB (matches dispatcher briefing, not stale 768m/1g AC text), StartedAt=2026-08-15T10:16:22Z, RestartCount=0, mem 70.57% now. Zero dmesg oom-kill events attributable to this container or its immediate predecessor (66656926d503) across the whole span.
- Current wallclock 2026-08-23T08:4xZ is only ~20h past the 2026-08-22T12:40Z floor — short of the required 24h; too early to certify either this row or its blocker.
- ANOMALY (flagged, not resolved, out of this row's scope): dmesg -T shows 2 fresh oom-kill events (Aug 19/20) on container id 92e6017318e4 — the OLD rag-service container believed retired since 08-14, absent from `docker ps -a` today. Either a zombie cgroup lingered or dmesg timestamp translation is unreliable across this host's suspend/resume boundary; does not implicate the current container/fix either way.
**why-decision:** HELD, no lane move — dispatcher explicitly flagged this as a "say plainly if too early" case; the data confirms it is.
**why-change:** none.
