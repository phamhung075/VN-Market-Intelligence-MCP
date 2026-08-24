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

## FIX 2026-08-24T13:35Z — FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT (P0, half 2/2)

Wired the shipped `spawn_decision`/`signature` fields (half 1, commit `820b52759`, live-verified via a
full `auditor-tier1-probe.test.sh` re-run: 264/264 GREEN, incl. the exact worked-example signature
`mem_creep:vn-market-intelligence-mcp-pdf-extractor-1`) into the actually-armed cron prompt.
- `.claude/skills/cron-detect-loop/register.md` L84 (Job 2): fields list now names `spawn_decision`,
  `signature`. Byte-preserved the ALL_GREEN passive-health-masking sentence verbatim (diffed —
  untouched). Replaced only the old bundled `Otherwise (verdict=FAILURE, OR stale-ALL_GREEN, OR
  unreadable) -> spawn` OR-clause: stale-ALL_GREEN/unreadable keeps its old terse spawn consequence
  (arm 2, untouched in effect); `verdict=FAILURE` now forks into an `Else` branch that reads
  `spawn_decision` directly — `DEBOUNCED` -> log + no spawn, `SPAWN` or missing/unparseable -> spawn
  (AC-2 fail-open stated as its own explicit clause, not implied). Added a dated pointer note above the
  CronCreate block (mirrors the file's own changelog convention) citing the brief + commit.
- `docs/agents/system-auditor/flow/tier1-probe.md`: added the AC-3 top-of-file pointer right after the
  existing L20-28 "NEVER write heartbeat" restatement, same style — debounce is cadence-only, every
  A-xx check here still runs at full fidelity whenever the subagent DOES launch.
- AC-4 RAW-verified, not asserted: `grep -n "spawn_decision\|signature" docs/agents/system-auditor/
  flow/main.md` → zero matches (exit 1). Confirmed `main.md`'s Tier Dispatch needs no edit — the
  pre-gate JSON is read only by the cron prompt.
- AC-5 confirmed by reading: `.claude/commands/crons/cron-system-auditor.md`'s own header already says
  "Manual/ad-hoc reference only" and intentionally omits the pre-gate — no change needed, unchanged.
- Verification: traced the new prompt text by hand against 3 real JSON shapes — a live ALL_GREEN run
  (`bash scripts/agents-flow/auditor-tier1-probe.sh`, heartbeat age ~0min), and FAILURE+SPAWN /
  FAILURE+DEBOUNCED transitions (both proven live by the T-DEBOUNCE-1 test case, corroborated with a
  throwaway scratch repro). All three branch correctly.
- **Live-cron caveat, stated because the prompt for this row demanded it:** Job 2 is registered in
  THIS router session from the OLD register.md text — editing the file does NOT re-arm a running
  session's cron (CronCreate is session-scoped, confirmed elsewhere in this same file's own "Why this
  skill exists" section). The debounce stays functionally inert on the LIVE tick until the session
  re-arms (`/cron-detect-loop`, which only re-creates jobs Step 1 finds MISSING — re-arming Job 2
  specifically needs a `CronDelete`+`CronCreate` cycle, not just a re-run of the skill as-is). Re-arm
  IS safe mid-flight: AC-2's fail-open means the worst case during a swap window is a tick still
  spawning under the OLD unconditional `verdict=FAILURE -> spawn` clause — identical to today's
  behavior, never a false suppression. I hold no CronList/CronCreate tools (agent-father's tools
  package is `bootstrap`-only) so I could not query or actuate this myself — flagged to the router.
- orch-state.json write (ready[]->review[], owner/next_agent=qa) executed via `scripts/orch-apply.sh`
  but left UNCOMMITTED per my own zone exclusion (FU-AGENT-FATHER-ORCH-SCOPE: orch-state.json is
  router-owned, not an agent-father commit target outside the one signal-queue DONE-mark carve-out) —
  same split as the sibling half's own `d490fef11 chore(orch): ...backlog[]->review[]` commit, done
  separately from its `fix(scripts/agents-flow)` commit.
