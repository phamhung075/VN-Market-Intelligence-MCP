# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · po (continuation 2)

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for missed slots, or correct the label.
**Agent:** po
**Started:** 2026-07-30T09:44:20Z
**Rolled from:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po.md` (625L > 600L cap, `### CAP-REACHED · 2026-07-30T04:57:52Z`). Per `.claude/skills/decision-journal/SKILL.md` § Cap Check the continuation filename is `sprint-<id>-<agent>-2.md`. Two sibling files written earlier today (`ruling-20260730T0906Z-po-triage-po.md`, `ruling-20260730T0921Z-sqlite-mechanism-po.md`) are off-contract names and, because `scripts/agents-flow/decision-journal-archive.sh` globs `sprint-*.md` only, are invisible to journal archival — logged as evidence on FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR, not re-fixed here.

---

### STEP po-S63 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
**what-done:** DEFERRED the ctx-bloat prune on `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-architect.md` (46429B vs 36000B) and minted the actuator-side root-cause row instead.
**what-considered:**
- File a claude-manager-helper prune/split → rejected: sprint is live (4 READY + 5 BACKLOG tasks), file uncommitted-modified at triage, content load-bearing design rationale; splitting races the live editor.
- Defer until sprint close, per the standing playbook → rejected as a FALSE PREMISE once probed: the id is in neither `active_sprints[]` nor `closed_sprints[]`, so it can never close and the deferral can never expire.
- Fold into existing P2 FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR → partially: that row's premise covers only NON-sprint-scoped journals; extended its scope + raised P2→P1, but the third-state hole needed its own row.
**why-decision:** Resolving all 40 referenced sprint ids showed 34 dangling — so this is a fleet-wide registry gap (513 journals / 5.5MB unarchivable, largest 331592B = 9.2x cap), not one file's bloat. Dogfood: this very journal resolved to the same dangling id.
**why-change:** Marked supervised+plan_only against the usual preference for dispatchable rows, because a dry-run proved the obvious fix (fail-loud referential check in `orch-validate.mjs`) would reject EVERY board write today. Reconcile must precede gate-arm; that sequencing is a design call.

### STEP po-S64 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-NOTEBOOK-DUPHEADING-DETECTOR-NO-DEDUP-NO-ACTUATOR
**what-done:** Minted one FIX for the `## Prior cycles` duplicate in `unified-agent.md`, covering emitter dedup + a repair path + the upstream anchor-uniqueness gap.
**what-considered:**
- Treat as hook re-fire noise only → rejected: lines 51/53 are a real, unrepaired corruption with an orphaned footer at 55.
- Treat as a duplicate of FIX-NOTEBOOK-AUTOPRUNE-SAMEDAY-TIE-DROPS-NEWEST (minted 09:18Z, same file) → rejected: that is a drop-loop selection-order bug; this is dedup + missing actuator. Same file, different mechanisms.
- Prune the notebook to cap → rejected: file is 100L/11996B, already under BOTH caps, so cap pressure is not the mechanism and a trim would erase the evidence.
**why-decision:** Six identical signals today (05:25:51Z→09:01:31Z), not the three the drain forwarded, so the condition is persistent AND the emitter has no dedup — it burned 3 of 7 signal slots this tick. All three governance layers are blind at once: emitter has no state, actuator was never built (detection-only by design), and the pre-commit immutability gate skips un-dated rolling headings by scope.
**why-change:** Overturned the script's deliberate "detection-only" choice for ONE signature only — two adjacent identical `## ` headings with blank-only between them contain zero content by construction, so deleting the first is provably lossless and cannot be the "legitimately-repeated content" that comment protects. Every other duplicate shape keeps current behaviour.

### STEP po-S65 · po · 2026-07-30T09:44:20Z
**task-id:** FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE
**what-done:** Escalated the existing row P2→P1 with new evidence; returned it as UNBLOCK rather than minting anything new.
**what-considered:**
- Mint a new row for the task_claim rejection → rejected: same root cause (no Bash → no session id), so it belongs as scope on the existing row.
- Set supervised=true to signal caution → rejected: `supervised` alone is strictly the worst pairing (buys BOUNDED-1 exclusion, does not buy the SLS lane).
- Set supervised+plan_only to guarantee a lane → rejected: the fix is a known one-line tools-grant edit; quarantining it to planning adds a hop for nothing.
**why-decision:** Two reports corroborate on different planes — notebook commits dead 6 cycles (was 3), and a CRITICAL alert fired with NO published-marker tombstone because `task_claim` requires `owner_client_session`. That promotes it from memory hygiene to a live duplicate-publish exposure. RAW-verified structural, not self-reported: `.claude/agents/alert-commander.md:5` has no Bash.
**why-change:** No change from plan; left the flags untouched on purpose and recorded the measured strand (BOUNDED1=false, SLS=false) in the row so the next tick sees why it needs deliberate dispatch.

### STEP po-S63 · po · 2026-07-30T19:29:19Z
**task-id:** FU-CNYVND-DEAD-FIELD-REMOVE
**what-done:** Unparked the BLOCKED row from in_progress[] to backlog[] (disposition unchanged) after finding it was eating a WIP concurrency slot.
**what-considered:**
- Leave it — dev-team's own pickers will handle it (they will not: wip_in_progress is a bare lane length, no status filter).
- Flip it back to IN_PROGRESS so it looks live (falsifies state).
- Move to backlog[], keep BLOCKED + next_agent=architect — chosen.
**why-decision:** `scripts/lib/devteam-eligibility.jq` def `wip_in_progress` = `(.task_board.in_progress // []) | length`, read at source. With this BLOCKED row + one genuinely live row, wip=2=cap, so BOUNDED-1/SLS/RLC/DRS all no-opped fleet-wide against backlog=374/ready=54/review=184. Containment now, structural fix minted as FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS.
**why-change:** no change from plan.

### STEP po-S64 · po · 2026-07-30T19:29:19Z
**task-id:** FIX-DEVTEAM-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-DESTINATION
**what-done:** Minted P1 for 48 backlog rows (27 P0/P1) that no picker can reach, measured with the fleet's own include-ed predicates.
**what-considered:**
- Widen the DRS allowlist to ops/agent-father (rejected — the exclusions are ratified-deliberate, both cite real incident memory).
- Hand-dispatch the affected rows each PO tick (rejected — 48 deep, incidental discovery is not a mechanism).
- Mint the destination-half follow-up the library's own comment says was never minted — chosen.
**why-decision:** devteam-eligibility.jq:433-440 states the deferral verbatim; this is occurrence #2 of the FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER class (documented gate, absent downstream path) which last time idled a P0 6+ days. The gate is right; only the destination is missing.
**why-change:** no change from plan.

### STEP po-S65 · po · 2026-07-30T19:29:19Z
**task-id:** FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS
**what-done:** Minted P1 after confirming at source that owner_client_session is Zod-REQUIRED and 6 documented call sites omit it.
**what-considered:**
- Fold into FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT (rejected — that row owns the Bash grant, this is a schema-drift in the documented call).
- Fix only refine_bctc_md, the loudest victim (rejected — commit-mutex has the widest blast radius).
- One row covering every documented task_claim call site — chosen.
**why-decision:** coordinationTools.ts:104 is `z.string()` with no `.optional()`, read at source not from the tool description. alert-commander published WITHOUT its marker claim on 2026-07-30T00:12Z — a silently-absent publish mutex, not a cosmetic doc bug.
**why-change:** no change from plan.

### STEP po-S66 · po · 2026-07-30T19:29:19Z
**task-id:** FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP
**what-done:** Re-pointed next_agent router->qa, attached 07-28 live b1/b2 telemetry as an evidence pointer, and attached an explicit false-PASS warning on clause (a).
**what-considered:**
- Close it myself on the 07-28 evidence (rejected — PO must not self-verify a QA-owned gate on relayed log lines).
- Leave next_agent=router (rejected — no picker consumes a review[] row addressed to router; 8 days idle proves it).
- Re-point to qa with evidence + dormancy warning — chosen.
**why-decision:** Clause (a) reads "no ticker acquires NGAY NOP == run date over 3 cycles"; the BCTC producer is dormant (bctc stale 2008min, B-05 1951m, B-06 41h) so that clause can go green vacuously. Handing QA the trap is worth more than handing it a verdict.
**why-change:** no change from plan.

### STEP po-S67 · po · 2026-07-30T21:58:26Z
**task-id:** FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION
**what-done:** Minted a P0 for the missing DONE_VERIFIED producer after measuring 8 rows (4× P0) starved on it, and flipped exactly ONE dep token to unstarve the P0 commit-sweep chain.
**what-considered:**
- Loosen `deps_satisfied()` to accept plain `DONE` → rejected: that deletes the landed-vs-verified distinction the strict token exists to enforce, and would auto-dispatch successors of genuinely unverified work. The gate is right; the producer is missing.
- Hand-flip all 10 `done[]` rows to DONE_VERIFIED and clear the measurement → rejected: PO would be ratifying work it never checked. `TASK-COWORK-CATCHUP-2` and `FACTORY-APP-split-assembleBriefing` carry `next_agent=qa` and nobody has verified them; they stay `DONE` as live evidence.
- Fold into `FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP` (P2, review, also about `done[]`) → rejected after reading it: that is a count-vs-age EVICTION axis mismatch, a different defect from verification promotion.
- Do nothing, treat as bookkeeping → rejected: a P0 was blocked on a P0 that was blocked on a STRING, for 12h, while the defect it prevents fired a 5th time at 21:30:47Z.
**why-decision:** Three legs RAW-verified, not inferred. (1) `scripts/lib/devteam-eligibility.jq` `deps_satisfied()` requires the exact token and says verbatim "plain DONE is NOT sufficient". (2) `grep -rn 'task_board\.done\b'` across `scripts/devteam-*.jq`, `scripts/agents-flow/*.sh`, `docs/agents/dev-team/flow/*.md` (excluding `done_verified`) returns ZERO — no picker reads `done[]`; the only two mentions are cold-eviction. (3) `DONE_VERIFIED` is written only by 25+ hand-minted one-off jq scripts. So `done[]` is a terminal-looking dead-letter queue: 4 of its 11 rows carry a `next_agent` no sweeper reads. Third instance of this repo's documented-consumer-with-no-producer class.
**why-change:** Flipped `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2` DONE→DONE_VERIFIED — a departure from "mint the systemic row and change nothing else". Justified because that row's own `po_closure_20260730` already carried a file:line-precise PO RAW-verification from 09:05:59Z (4 skill pathspec sites, 3 init.md `RULE 1-3 (incl. 2.5)` lines, commit `aa6c044ba`), re-read at source before stamping. Only the token was wrong. Decisive test run BOTH sides: `is_bounded1_eligible` on `FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL` was `false` with `deps_satisfied` the SOLE failing gate before, `true` after; starved set 8→7 on the live file.

### STEP po-S68 · po · 2026-07-30T21:58:26Z
**task-id:** FIX-SIGNALQUALITYAUDIT-WRITE-GATE-UNREACHABLE-BY-EMITTER-CONTRACT
**what-done:** Refuted the relayed "expected residual noise" framing on Telegram report 4220, installed `rebuild_required=true` + a 3-step verification gate on a review row that had `verification_gate=null` AND `acceptance=null`.
**what-considered:**
- Accept the relay (alert measures pre-fix staleness, QA will close it) → rejected on evidence, see below.
- Mint a new row for the deploy gap → rejected: `FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT` (P1, next=ops) already owns the class; annotated it with the fresh instance instead.
- Resolve 4220 as `fixed` → rejected: nothing is fixed in the runtime.
**why-decision:** Both planes read, not one. `docker exec … grep -c deriveAuditConfidence /app/src/domain/services/signalValidator.ts` = **0** in-container vs **1** on host; image `sha256:1bba4e58c9d2` created `08:27:58Z` predates commit `43e0d7ddc` (`21:30:47Z`) by 13h; `docker inspect` Mounts confirms `apps/mcp-server/src` is baked in, not bind-mounted. So the fix cannot take effect and the alert is CORRECT, not residual. Container shows `Up 18 minutes` against `CreatedAt 08:28` — someone restarted the service at ~21:31Z believing that deployed it; a restart re-runs the same image.
**why-change:** Also wrote the gate itself rather than leaving it to QA. A `review`/`next_agent=qa` row with both `acceptance` and `verification_gate` null forces QA to improvise, and here the two plausible improvisations fail in opposite directions — host source reads GREEN, live container reads RED, both wrong for the same reason. Gate ordered deploy-assert → live-DB behaviour → negative control, with an explicit instruction not to accept the SLA alert going quiet as evidence.

### STEP po-S69 · po · 2026-07-30T23:02:00Z
**task-id:** FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH
**what-done:** Ratified architect's deliverable at source and stamped `po_ratified_at` + `po_blocking_gate=artifacts-uncommitted` on the review row.
**what-considered:**
- Accept the row as done on architect's own completion signal → rejected: `supervised`/ratification discipline says never sign off on a relayed verdict.
- Ratify and mark done_verified → rejected: all 3 deliverables are still UNTRACKED.
**why-decision:** Ran `scripts/audits/po-manual-dispatch-sweep-verify.sh` myself → PASS 13/13, incl. negative controls D/J proving supervised&&plan_only rows are excluded (the producer does not poach SLS's lane) and G proving the idempotency guard is real code, not prose. Then live-exercised Step 1 against the real board: 46 unflagged candidates (43 DRS, 3 XOR), and Step 2's stamp applied through orch-apply with conservation 730/730. The work is correct.
**why-change:** Withheld done_verified. Artifacts are untracked while `main` is 4 ahead of origin and dev-mcp-server holds a large concurrent uncommitted edit set — the exact `feedback_dead_worker_uncommitted_live_file_revert` exposure. Gate = pathspec-scoped commit of exactly those 4 paths.

### STEP po-S70 · po · 2026-07-30T23:02:00Z
**task-id:** (ambient — 6th triage pass, tick 2026-07-30T22:37Z)
**what-done:** Declined to mint on the `context_bloat_breach` signal's own terms; instead traced the recurrence to the journal WRITER's rollover and minted that.
**what-considered:**
- Force-split the live developer journal → rejected per `feedback_ctxbloat_breach_on_live_sprint_file_defer` (it grew 154,793→156,774 B mid-triage; it is actively written).
- Mint against `FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR` → rejected: that row exists (P1) and correctly owns the ARCHIVER, blocked behind the dangling-ids row.
- Do nothing and defer again → rejected: 2 signals fired 16 min apart, 4 journals breach in this sprint alone.
**why-decision:** Natural experiment, not inference. `.claude/skills/decision-journal/SKILL.md` § Cap Check rolls to `-2.md` only on `LINES -gt 600`; there is no byte branch. In this sprint the ONLY journal that rolled is `po.md` — the ONLY one that crossed the LINE cap (625L). architect (211L/51,945B), dev-mcp-server (312L/79,545B) and developer (488L/156,774B) all sit under 600 lines, so their rollover never fires while the byte detector screams every cycle. Fleet-wide 10 journals sit in this blind spot, worst `sprint-SYSTEMIC-REMAKE-P1-qa.md` at 225,553 B / 504 L.
**why-change:** This satisfies the DEFER precedent instead of contradicting it — fixing the rollover touches no existing file's content; it makes the NEXT write roll over.

### STEP po-S71 · po · 2026-07-30T23:02:00Z
**task-id:** (ambient — telegram report 4222)
**what-done:** Classified report 4222 as a confirmed false positive of the liveness guard that `FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED` itself shipped; batched a narrow FIX.
**what-considered:**
- Treat as a fresh resolver stall and dispatch → rejected on live evidence.
- Fold into the existing REVIEW row → rejected: that row's fix is correct and working; this is a defect in its new watchdog's predicate.
**why-decision:** Read the live in-container DB, not the review_note's prose (`feedback_host_cli_integrity_check_false_ok_verify_through_runtime`): the 2 unresolved rows are id 49 `stock_code=MACRO` (1,306.9h) and id 74 `stock_code=MULTI` (850.9h), both `price_at_signal=null`, both `chain_catalyst` from news-scout. Non-ticker pseudo-codes have no price series, so `checked_at` can never advance — structurally unresolvable. 103/105 resolved. The resolver is healthy; `checkStalledResolutionLiveness()` counts these two forever and will emit a BUG alert every day in perpetuity, with text that misattributes it to "price lookup failing".
**why-change:** No change from plan; the dispatcher's "not yet dispatched to anyone" read was right, but the disposition is FP-suppression, not stall-diagnosis.

### STEP po-S72 · po · 2026-07-31T00:30Z
**task-id:** FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH
**what-done:** Traced the single-ticker "[kinh-dich] HVN 503 insufficient price data" alert to a TOTAL outage of `/stock/price/history` for every ticker, minted it P1, and corrected the falsified runtime evidence on the deploy-lane row surfaced by the manual-dispatch sweep.
**what-considered:**
- Accept the alert at face value as a thin/new-listing data gap for HVN, not actionable → rejected: the live DB holds 775 HVN rows (2023-06-27..2026-07-30) and the handler's own query window returns 22.
- Blame the api-gateway not-deployed-rerouter → rejected: its mapping is correct and `/mcp/api/prices/history` returns count:22 through the SAME gateway; only the stock-price hop is empty.
- Attribute it to the stale 16-day stock-price image / deploy lane → rejected: the 3 commits since that build never touch the read path, and the defect is present in current source, so a rebuild would not fix it.
**why-decision:** Reproduced the root cause in isolation rather than inferring it — `sqlite3 'file:data/live/market.db?mode=ro' 'PRAGMA journal_mode=WAL;'` returns `attempt to write a readonly database (8)` and swallows the following SELECT, while the same SELECT without the WAL pragma returns 22; live `PRAGMA journal_mode` = `delete`. fetchers.go:303/:240 still carry `mode=ro&_journal_mode=WAL` while the two sibling repos in the same package already dropped `mode=ro` with a comment naming this exact conflict — a 2-of-4-call-sites partial fix. The `//nolint:nilerr` at :318-320 turns the error into HTTP 200 + `[]`, which is why a total outage surfaced as a per-ticker 503.
**why-change:** No change from plan for the triage sweep. Deviation on the manual-dispatch candidate: instead of dispatching FIX-MCP-SERVER-DEPLOY-LANE-STALL as written, I stamped an evidence correction — its "RUNTIME-VERIFIED" grep targeted `/app/apps/mcp-server/src/...`, a path that does not exist in the container, so 0 matches came from a missing file; the real path shows 9 occurrences and the image was rebuilt 2026-07-30T22:06Z, not 07-25.

### STEP po-S73 · po · 2026-07-31T00:56Z
**task-id:** FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
**what-done:** Traced report 4229's bctc-analyst-slot-4 double-fire to an ALREADY-BOARDED, already-CONFIRMED row rather than minting a 9th cowork row; re-escalated it P2→P1 and cleared `plan_only`.
**what-considered:**
- Mint a new FIX for "dispatcher double-fires a non-guaranteed cowork slot"
- Attach to FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE / -ROUTER-INTENT-MUTEX-BYPASS
- Re-escalate the tombstone row and discharge its own probe gate
**why-decision:** The tombstone row's `po_retraction_2026-07-16` downgraded it P1→P2 *solely* because "BLAST RADIUS on a slot-bearing tick = INFERRED, NOT observed", with AC-3 demanding a forced same-tick re-fire on a slot-bearing tick before acting. That probe has now run in production twice in 27h (slot-3 07-30 21:00Z, slot-4 07-31 00:00Z) — the decisive test declared un-run was already measured by an incident. Mechanism fits exactly: both sessions started inside the 00:00–00:14 band, so `leader-lock.md:40` floors both to BOUNDARY_MINUTE=0 ⇒ identical key `cron:cowork:2026-07-31T00:00Z`, released at Step 6 and re-won by the re-fire. Ruled the two guaranteed/router rows out at source, not by title: all 4 bctc slots are `guaranteed:false` in cowork-schedule.json, and this was an unattended cron tick with no router.
**why-change:** Changed from "mint" to "re-escalate existing" per prior-art discipline — the row already had the root cause, the fix, and the ACs; only its evidence bar was unmet.

### STEP po-S74 · po · 2026-07-31T00:58Z
**task-id:** FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE
**what-done:** Drained the report queue 9→0 with real dispositions and found the second root cause behind the recurrence.
**what-considered:**
- Report "no resolve tool in my grant" as a structural gap and mint a row
- Test the grant before concluding, then locate why the drain never happens unattended
**why-decision:** The "no tool" premise is false — `process_telegram_report` worked 9/9 and both planes went empty. But the 07-30 retarget's tool-doc cause is necessary and NOT sufficient, which is why this recurred inside 24h. Grep-verified the durable cause: `po/flow/telegram-reports.md` is a 131-line ORPHANED sub-flow — it already contains the correct ack at Step 2f, but `grep -rn "telegram-reports" docs/agents/po/ .claude/` returns ONE hit, the file's own header comment. main.md's Dispatch and Branch-Workflows tables both omit it; No-Task Guard:105 names the READ and never the ACK. So the queue drains only when a human/router explicitly says so (07-30 by hand, 07-31 by spawn prompt). Inverted producer/consumer gap: producer correct, route missing.
**why-change:** No new row — folded both causes into the row that already owns the outcome, split as AC-1 (tool doc) / AC-2 (main.md pointer) / AC-3 (assert BOTH planes, since single-plane assertion is how 07-30 looked done while the route stayed dead).

### STEP po-S75 · po · 2026-07-31T00:56Z
**task-id:** UC-ASL-P6
**what-done:** Ran the mandatory manual-dispatch sweep: 43 unflagged candidates (41 DRS-stranded, 2 ready-XOR), stamped the top one and folded it into this tick's BATCH.
**what-considered:**
- only path: sub-flow mandates exactly ONE top-priority candidate per invocation
**why-decision:** UC-ASL-P6 is rank-1 (P1, idx 8) and its own `supervised_reason` states it is deliberately withheld from BOUNDED-1 and reachable by "deliberate on-demand dispatch of agent-father" only — precisely the class this producer exists to serve. Supervised-hold pre-check ran first and returned `should_hold=false` (head=FU-MACRO-SNAPSHOT-TIER-WORSTOF), so no ratification was owed this tick.
**why-change:** no change from plan.

### STEP po-S76 · po · 2026-07-31T01:32Z
**task-id:** FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A
**what-done:** Executed FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY AC-1 by hand on CI-RED-8e1e66e5 (that row is still BACKLOG/unshipped) and root-caused `bun test` to a live-data defect, not a test defect.
**what-considered:**
- Dedup all 3 failing jobs into the 2 existing READY CI rows ("same standing red")
- Read the failing-file identity per job first, then dedup on FILE, not on SHA
**why-decision:** `gh run view --log-failed` gives `FAILEDFILE: src/__tests__/1837a-pipeline-state.test.ts` — a file owned by ZERO rows. Reproduced locally: live `.head` is `{status,active_task_id,next_agent}` with no `updated_at`/`updated_by`. HeadSchema:226-227 marks both optional so orch-apply.sh passes it; the test requires them. The stamper that would fix this already exists (orch-stamp-updated-at.mjs) and its own header cites HeadSchema:227 as why nothing complained — then covers rows only. Residual surface of a shipped fix.
**why-change:** Deliberately did NOT hand-repair `.head`. That would turn CI green, erase the evidence, and let the actuator (AC-2) never ship — symptom over root cause.

### STEP po-S77 · po · 2026-07-31T01:32Z
**task-id:** FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS
**what-done:** Found the existing size-lint READY row covers 1 of 8 live offenders; minted 2 sibling zone rows and corrected the existing row's now-unsatisfiable job-level AC.
**what-considered:**
- Dedup into the existing macro row (its dedup_key is `ci_job:size-lint|...`)
- One `multi` row for all 7 remaining, architect splits
- Per-zone split: apps/mcp-server (6) + apps/pdf-extractor (1)
**why-decision:** Offender count went 1→8 in ~21h — a red gate has zero marginal cost, so the ratchet is broken. Dedup would have hidden 7 files. `multi` adds an architect hop while main is red. Per-zone split lets 3 zones work in parallel; I recorded its honest cost: all three share ONE job conclusion, so no row can verify at job level — each gets a FILE-level AC instead.
**why-change:** Also stamped the existing macro row: its AC-1/AC-4 are no longer satisfiable alone. Left the `--update` landmine intact and escalated it — with 8 offenders a single `--update` now grandfathers all of them.

### STEP po-S78 · po · 2026-07-31T01:32Z
**task-id:** FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION
**what-done:** Rejected dev-team's CLEAN disposition on all 4 commit-sweep-guard bug-escalations; they are true positives.
**what-considered:**
- Accept "benign, hook can't see the pathspec" and close as CLEAN
- Accept "hook too noisy" and file a repair_task_request against the hook
- Read the hook + rerun its verifier before adjudicating
**why-decision:** The premise is self-contradictory and falsified at source. pre-commit:445-454: `next-index-*.lock` ⇒ SCOPED ⇒ `exit 0` silent; `index` ⇒ BARE ⇒ warn. Re-ran `scripts/audits/verify-commit-sweep-discriminator.sh` this tick: VERDICT PASS on git 2.49.0, C2 confirms git pre-resolves a scratch index for a pathspec commit. So a `BARE commit about to absorb` payload proves no pathspec by construction. `git show --stat` clean only means no peer staged anything in the race window — luck, not correctness.
**why-change:** No 7th "make commits pathspec-scoped" row — 6 exist, all detectors. Minted the missing ACTUATOR (staged warn→reject) plus the missing adjudication rule. Flow docs already grep clean, so this is improvised agent behaviour only an enforcing gate stops.

### STEP po-S79 · po · 2026-07-31T01:32Z
**task-id:** TE-T08
**what-done:** Manual-dispatch sweep: 20+ unflagged candidates, stamped rank-1 TE-T08 and folded it into this tick's BATCH; supervised-hold pre-check returned no hold.
**what-considered:**
- only path: sub-flow mandates exactly ONE top-priority candidate per invocation
**why-decision:** TE-T08 is P1, `next_agent=agent-father`, off the DRS allowlist — exactly the stranded class this producer serves — and it routes to agent-father, so it costs dev-team no dev WIP slot and runs parallel to the CI work.
**why-change:** Added a coupling landmine to the row. T-08 inverts the commit-mutex SKILL to a ~60L hot card; the pathspec-commit line MUST stay in the hot card, or the refactor deletes the only in-context instruction preventing the bare commits S78 just proved are live at 14/8h.

### STEP po-S80 · po · 2026-07-31T01:40Z
**task-id:** FIX-COLDEVICT-WITHIN-FILE-PEER-CONTENT-CAPTURE
**what-done:** Caught a live positive control for this row — the architect's commit absorbed my own 4 triage rows 2 min after I wrote them — and cleared the `plan_only:null` that was stranding it.
**what-considered:**
- Treat it as a sweep-guard instance and fold into the row minted at S78
- Check whether the hook fired before classifying it
**why-decision:** `.git/sweep-guard.log` has ZERO entries after 01:17:02Z, so the hook never fired on 95a1083e5 — **correctly**, the commit WAS pathspec-scoped and legitimately named orch-state.json. The guard's detection unit is the FILE PATH (pre-commit:445-454); this defect lives strictly INSIDE one file every writer legitimately stages, so no pathspec discipline can ever reach it. Distinct row, must not merge.
**why-change:** Content was conserved (both writers went through orch-apply.sh; conservation check 738=738) — only ATTRIBUTION was lost. So the AC should assert on ownership, not only on conservation; the dangerous variant is a stale-read writer landing a rollback under an innocent title.

### STEP po-S81 · po · 2026-07-31T02:12Z
**task-id:** po Step 0-SIG triage — 5 drained signals + board hygiene
**what-done:** Triaged all 5 signals dev-team drained this tick; minted 2 new P1 backlog rows (`FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR` next=architect, `FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR` next=developer) via `scripts/po-triage-20260731-0212-branchhijack-sweepguard-retroactive.jq` → orch-apply (738→740, signals 131→131, Stage 0+1 PASS). Additive `po_review_note_20260731T0212` on the parent sweepguard REVIEW row so QA sees the gap without being blocked by it. Manual-dispatch sweep: 41 unflagged candidates (39 DRS-stranded, 2 ready-XOR), stamped+folded TE-T11. Supervised-goahead: head idle → no-op. Step 0-TNB: c119 already ACK'd 2026-07-28T22:55:09Z, no newer handoff. Dashboard inbox empty. BUG telegram 4505.
**what-considered:**
- Signal 1 (commit-sweep-guard BARE, PM's `8d233ccc5`): payload carries NO `escalated=` field — it was emitted 01:43:28Z, ~28min BEFORE the actuator commit `eac71308e` that introduced the field. Read that absence as pre-actuator ⇒ equivalent to `escalated=false` ⇒ CONFIRMED true positive → `pendingObservations[]`, no per-occurrence FIX row (the triage row's own rule). Considered and rejected treating a missing field as "cannot disposition": the payload's leading `[sweep-guard] BARE commit about to absorb` tag is by itself the construction proof, and pre-commit:453-454 `exit 0`s silently on SCOPED before either the log write or `write_signal`.
- Signals 2/3 (context_bloat, architect + dev-team-2 journals): verified the rollovers AT SOURCE rather than trusting the relay — `### CAP-REACHED · 2026-07-31T01:35:33Z` is the literal last line of the architect journal, `### CAP-REACHED · 2026-07-31T01:59:27Z` the last of dev-team-2, and `-dev-team-3.md` exists (5866 B). Both already-handled → close, no action. NOTE both are BYTE-cap breaches (54601/36000 and 40728/36000) with line_count 221/113 far under the 600L cap — i.e. exactly the blind spot `FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER` (REVIEW) owns; both agents rolled by hand, the skill did not make them.
- Signal 4 (`cowork-team-...T02:07:26Z`): read the file directly rather than accepting the summary. `type=cowork-fire`, classification FIRE, `errors:[]`, alert-commander-market spawned on cadence, leader_lock acquired. `cowork-fire` is NOT in the Step 0-SIG routing table ⇒ falls to the `any unknown type` row ⇒ log + skip. Deliberately did NOT mint a row for the routing-table gap: the payload also reports `signal_backlog: 20` and `docs/signals/` holds 79 undrained files, ~64 of them `cowork-team-*` — so the real observation is a drain-side accumulation, logged to pendingObservations rather than fixed from the PO side.
- The branch-hijack signal: dev-team's commit `3b20fc8c9` claimed "zero existing board rows". Re-ran the dedup myself over EVERY lane on /branch|worktree|hijack|checkout/i → 10 hits; 8 are the word "branch" used in a code-path sense, but 2 are genuine adjacencies dev-team did not surface (`UC-RDL-P7` policy, `SPIKE-C44-PARALLEL-PROOF` worktree mechanism). Wrote both into AC-3 as a mandatory pre-implementation boundary statement, and flagged that if the fix chooses worktree isolation then SPIKE-C44 is a dependency, not a sibling.
**why-decision:** The sweepguard row is NOT from any signal — it came out of verifying signal 1's disposition and is the load-bearing find of this tick. `.git/hooks/pre-commit` is a SYMLINK into `scripts/git-hooks/`, so `eac71308e` landing == deploying with no install step. Replaying the hook's own predicate (`grep -Fc " actor=<id> "`, threshold 3) against the live 156-line log: 64c7c677-…=70 and ad265f86-…=6, both ⇒ `escalated=true` ⇒ `exit 1` on their next BARE commit. And `actor` is `$CLAUDE_CODE_SESSION_ID` (pre-commit:487), which every subagent of one router session shares — provable off signal 1 itself, whose `actor=` for PM's commit is the identical string PO/dev-team/developer are running under this tick. So the shipped actuator is a de-facto instant fleet-wide reject flip — the exact flip the brief deliberately staged as a Phase-2 with 24h observation + rollback — and its "per-actor" scoping is vacuous in production. Did NOT re-open the parent row: its 4 ACs are all met AS WRITTEN, the miss is in the AC set's reach, not in the implementation of it. AC-4's live positive control used a fresh actor in a scratch repo with an EMPTY log; both defects are structurally invisible under exactly those two conditions (same class as `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`), which is why the new row's AC-5 forbids repeating that control shape and AC-1 forbids truncating the log to pass.
**why-change:** Two rows minted rather than one: different zones-of-fix (git-hook bash vs cross-cutting agent-isolation design), different owners (developer vs architect), no shared file. Signal 5 (agents-architect brief_complete) closed as a late-draining duplicate — verified the parent row is already REVIEW/next=qa (`5d7401303`), so re-dispatching would have double-claimed a row already past implementation.
