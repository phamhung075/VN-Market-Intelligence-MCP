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
