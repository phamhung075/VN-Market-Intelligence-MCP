# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

<!-- Entries 2026-08-23 09:30Z (FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded) and
     09:45Z (cowork-team Step 4.7 + 5.3 doc-truth pair) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260823.md on 2026-08-23
     (self-prune: 188L/16787B against the 200L line cap and the 12000B byte cap). Nothing
     deleted; full record in the archive file and git history. Same convention as the
     2026-08-12 prune noted above. -->

<!-- Entry 2026-08-23 14:23 (Keep/maintenance — CHECK6-FLEET-ROLLOUT-DEBUG-LOGGER-PROTOCOL)
     also split to docs/agent-memory/notebooks/archive/agent-father-archive-20260823.md
     on 2026-08-23, second prune of the same day (198L against the 200L cap). Nothing deleted. -->

## FIX 2026-08-23T14:20Z — FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR (QA CHANGES_REQUESTED, redispatch 1)

- My own 863a250e3 replaced prose with jq — but the jq could never pass `orch-validate.mjs`. QA found
  it by EXECUTING; I had shipped it by reading. Three defects, all now closed in
  `docs/agents/qa/flow/main.md`: vc-approved `next_agent: null` → `del(.next_agent)`; vc-approved
  gained the mandatory RC-VERIF `verification.raw_probe{tool,args,live_value_observed,observed_at}`
  + a fail-loud refuse when any probe field is empty; vc-changes `$t.owner` →
  `($t.owner // $t.owner_agent // "po")`. Both self-verify greps widened past the bare
  `.status ==` check that let all three through.
- **Lesson (repeat offence, 2nd time on the same row):** `next_agent` has TWO different contracts in
  one schema file — `TaskSchema:208` is `z.string().optional()` (NOT nullable), `HeadSchema:324` is
  `z.string().nullable().optional()`. I copied the `.head` idiom onto a task row. When an idiom is
  lifted from elsewhere in the same file, re-read the schema for the NEW target, not the source.
- **Lesson (method):** blocker [2] is structurally unreachable until [1] is fixed — the validator
  stops at the first class of error. Any "fix the one thing QA named" pass ships a second dead
  actuator. Fix-then-rerun until green, never fix-then-reason.
- Verified by executing the SHIPPED doc text, not a hand-copy: harness extracts the fenced blocks
  straight out of `qa/flow/main.md` and replays them against a fixture via
  `ORCH_APPLY_LIVE_FILE_OVERRIDE` (the escape hatch `orch-apply.sh` already provides). 16/16 PASS —
  incl. 3 negative controls re-proving each pre-fix form still rejects, and a sha256 check that the
  live hot file was untouched throughout.
- Also added, evidence-forced, beyond the ACs: a `del`-vs-`.head` disambiguation note so the next
  editor does not "fix" the legal line 32, and a `review[]` prose-ceiling warning on vc-changes —
  QA's own rejection breached that ceiling (9986B→13293B, limit 12000) while writing itself.
- **Handed back, NOT attempted:** AC-4 opt-in allowlist regression verifier + AC-5 fixtures belong in
  `scripts/`, outside my commit zone. The harness above is the working prototype; it needs a
  developer row to become durable. Same split as the 3ce726a6e precedent.
- **Not fixed (QA's non-blocking [4]):** both blocks guard source lane `qa[]`/`QA`, but today's batch
  arrived in `review[]`/`REVIEW`. QA called the refusal correct fail-safe behaviour — the real defect
  is dispatch-side (drain not moving rows into `qa[]` before spawning QA). Left alone deliberately;
  a peer session is running dev-team concurrently and weakening a fail-safe mid-flight is the wrong
  trade.

## FIX 2026-08-23T14:45Z — FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION (QA CHANGES_REQUESTED, redispatch 1)

- **My 2026-08-14 fix replaced a narrative VERDICT with a narrative ASSERTION.** Same defect class,
  one level down. It stopped nothing: measured all 69 live dishes, 19 are non-conformant in 5 distinct
  shapes (top-level keys 4x, metadata keys 1x, dish_type enum 6x, tnb_synthesis keys 3x, direction enum
  7x) — including `unified-agent-synthesis-2026-08-22-chef-evening.json`, the first dish written AFTER
  the fix landed.
- **Lesson (the big one):** "make it a deterministic assertion" is not satisfied by writing a more
  detailed checklist. If the executor is an LLM (unified-agent runs `model: haiku`), only a command
  with a hard exit code is deterministic. Check the tool grant first — unified-agent HAS Bash, so the
  command was always available; the previous fix simply never used it.
- **Lesson (root cause beat blame):** 8 of the 19 failures write `evening_preview`/`eod_dish`/
  `convergence_scan` into `metadata.dish_type`. Those are not hallucinations — they are the literal
  schedule-entry keys from `unified-agent/init.md:117-132`. THREE vocabularies name the same four slots
  (init.md schedule keys, `chef.md:135` `SLOT_ID` = `chef-evening`, the `dish_type` enum = `evening`)
  and no doc ever mapped one to another. A stricter assertion alone would have failed forever and fixed
  nothing. Added the mapping table.
- Shipped in `chef-dish.md`: (1) Step 7.6's 5-item narrative checklist → one literal `jq` command,
  exit code is the verdict; (2) SCHEMA_OK widened to metadata's own key-set + dish_type enum (QA's
  exact two proven gaps); (3) the SLOT → dish_type mapping table.
- **Caught my own bug by executing:** first draft used `jq -er`, but `-e` only exits non-zero on
  `false`/`null` — a `"SCHEMA_FAIL: ..."` string exits 0, so the gate would have been decorative.
  Switched to `halt_error(1)`. Verified by extracting the SHIPPED command back out of the doc and
  replaying it over all 69 dishes: 50 pass / 19 fail / 0 exit-code inconsistency, plus verdict-mismatch
  and malformed-JSON negative controls.
- **Flagged, NOT fixed (needs its own row):** `chef.md:135` + `.claude/agents/unified-agent.md` define
  FILEPATH's `SLOT_ID` as `chef-evening`; `chef-dish.md:858` defines it as `evening`. Both forms exist
  on disk for the SAME slot on the SAME day (`...-2026-07-30-evening.json` and
  `...-2026-07-30-chef-evening.json`). Resolving it changes the on-disk naming contract every consumer
  globs — not a unilateral call.

## FIX 2026-08-23T15:10Z — FIX-CHEF-MARKER-KEY-ANCHOR-2/-3/-4 (3 P0 rows, one chain)

- ANCHOR-1 (developer, DONE_VERIFIED) produced `scheduled_utc_time`; all three consumers live under
  `docs/agents/` so the whole tail was mine. Shipped as one commit: match-slots.md documents the field
  on `slots[]`, spawn-fanout.md Step 5.2 appends `scheduled_utc=<ISO8601>` to BOTH ENTRY_PROMPT
  branches, chef.md Step 0.5 + digest-predict daily gate derive their window date from it.
- **Verified the producer myself before documenting it** rather than copying ANCHOR-1's review_note:
  called the exported `annotateScheduledUtc()` against the real schedule at 2026-08-23T13:50:00Z →
  `digest-sunday` / `47 13 * * 0` → `2026-08-23T13:47:00.000Z`. That is also how I found the thing the
  prose does not say: live `slots[]` get `scheduled_utc_time` ONLY, while `catchup_raw[]` also carry
  `scheduled_key_part` + `expected_publish_task_id`. A consumer expecting `scheduled_key_part` on a live
  slot gets undefined. Documented the asymmetry explicitly.
- **Lesson:** the degradation contract is the load-bearing half of a propagated field. `scheduled_utc_time`
  is null on malformed cron / missing predicate module / no fire in the 8-day lookback. Emitting
  `scheduled_utc=null` into a prompt would hand every worker a present-but-garbage value; OMITTING the
  token keeps each worker's pre-existing `date -u` fallback alive untouched. Chose omission and said so
  at all three sites, because a future editor will otherwise "helpfully" emit the null.
- **Refused a tempting over-reach:** digest-predict's SUNDAY gate also drifts across a week boundary, but
  it keys on server-side `get_week_period().periodKey` and its own block says never compute the week
  locally. Swapping in agent-side arithmetic from `scheduled_utc` would trade a server SSOT for exactly
  the class of local derivation this whole chain exists to remove. Left it, documented the residual
  (needs `get_week_period` to accept an `as_of` — a server change).
- Housekeeping: de-referenced 4 `chef.md:135` line citations in chef-dish.md → `chef.md Step 0.5`. My own
  ANCHOR-4 edit moved that line to 167, so those citations were stale the moment I wrote them.

## FIX 2026-08-23T15:25Z — TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY (P1, unblocks a P0)

- A "the 12 RemoteTriggers provide persistence" sentence outlived that mechanism's retirement by two
  months and got quoted verbatim into a live P0 status_note as the cause of an 8h miss. Replaced with a
  measured three-layer table in `cron-cowork-team/SKILL.md` + a `catchup_raw` scope/reach correction in
  `match-slots.md`.
- **Lesson: a section-scoped instruction does not satisfy a file-scoped AC.** The handoff said "touch
  only the 'Why this skill exists' section"; AC-4 was a grep gate over the whole file. Two more copies of
  the identical false claim sat in the Warning and Notes sections. Rewriting only the named section would
  have passed my own reading and failed the AC. Run the gate, don't infer it.
- **Lesson: re-measure the handoff's numbers.** Two did not reproduce — `trigger_status` absent was 11,
  is now 13; `catchup_raw` "8 records, ZERO eligible" became 8 records / 2 eligible on a later same-day
  run. So the eligible count is written as a timestamped observation with "re-run before quoting", not as
  a standing property. AC-6 forbade unmeasured claims; copying the brief forward would have violated it.
- Kept the structural claim that survives measurement drift: `catchup_max_lateness_minutes` (live
  60/120/180/360/1440) caps recovery at ONE VN day, so wiring the missing `catchup-check.md` consumer
  would still not have recovered the multi-day outage the parent row is about.
- **AC-3 handed back:** `docs/protocols/cowork-master-cron-runbook.md` is outside my commit_zone. Its
  stale spot is now specific: it calls the launchd backstop "in flight" and test T5 "NOT YET APPLICABLE",
  while `launchctl list` shows the job loaded, last exit 0.
- Self-pruned this notebook first (188L/16787B → 176L) to `archive/agent-father-archive-20260823.md`.

## FIX 2026-08-23T16:05Z — 2 mid-task P0s from PO's CI-red triage

**FIX-SIGNAL-TYPE-ROUTING-GAP-auto-push-abort** (3cef7c30e) — one Pipeline-A table row for
`auto-push-abort` in `po/flow/triage-signals.md`.
- **Lesson: the obvious verification was the wrong one, and the row said so.** `guard-signal-type-
  coverage.sh` is NOT read-only — line 258 writes live orch-state via `ORCH_APPLY_LIVE_FILE_OVERRIDE`,
  and its `--check` flag is an alias, not a dry-run. I verified by replaying the guard's OWN extractor
  functions (`pipeline_a_section | extract_type_column`) read-only against the doc: 28 routed types
  incl. mine, Pipeline-B unchanged at 14. Same trust-the-mechanism-not-the-wrapper move as everything
  else today, arrived at from the opposite direction.
- **Lesson: a green gate is not the goal.** The guard reads `pending_triage_inbox[]` as its input, so
  PO's own mandated CLEAR step can turn it green with the gap still open. PO deliberately held 3
  envelopes; I left them (re-counted =3 after my edit).
- Wrote the row to discriminate on `payload.reason` — the producer has SIX emit sites and they are
  not one failure. Also told the router not to trust the envelope's own `ahead` count: it is a
  snapshot from the aborted run, and these three were already stale — my own 83ab26dc fix earlier
  today resolved their premise.

**FIX-PM-3E-FAILLOUD-HOTFIX** (04ee05faa) — jq refuse-guards + real `exit 1` tails in pm Step 3e.
- **Lesson (third time today): fixing only what the brief names ships a fix that cannot run.** The
  brief had two defects. Executing the block found a third: both branches iterate `.tasks` unguarded
  and 2 of 19 live `active_sprints[]` have no `tasks` key, so jq died "Cannot iterate over null" at
  exit 5 — Step 3e's SUCCESS path was structurally unrunnable on today's board. Shipping the
  fail-loud tails alone would have made every invocation refuse loudly and still never work.
- Why the old form looked healthy for 3 occurrences: `... | .[0]` is `null` on a miss and
  `null + {status:"DONE"}` is VALID jq, so branch A appended a synthetic id-less row to `done[]` and
  the write succeeded; branch B's `map(if .id == $sid ...)` is a silent no-op, exit 0.
- 22/22 on a fixture replay of the literal shipped block, incl. AC-5's control proving the pre-fix
  `|| echo` tail exits 0 on a rejected write.
