# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## FIX 2026-08-23T09:30Z — FIX-SIGNAL-TYPE-ROUTING-GAP-bctc-image-fetch-degraded, P0 CI-red fix
- Added 1 Pipeline-B routing row (`bctc_image_fetch_degraded`) to `docs/agents/po/flow/triage-signals-longtail.md` — mcp-server `push_bctc_refined_unit`/`bctcImageFetchDegradedSignalWriter.ts`, dedup on `dedup_key`, mint FIX zone `cross-service/` next_agent `developer`. Placed in the longtail sibling (single-fire-so-far type, matches existing `bctc-data-quality-anomaly` precedent), not the hot-path main table.
- Guard `guard-signal-type-coverage.sh --check`: FAIL (`unrouted Pipeline-B to=po types: ["bctc_image_fetch_degraded"]`) → PASS, reproduced. Paired suite: 23/24 → 24/24, reproduced once (TEST10 live-files smoke).
- Committed `a309c9334` (file alone, pushed clean to origin/main, no rebase). Board write via `orch-apply.sh` moved the FIX row `backlog[]→review[]` (`next_agent: qa`; `ci_green_on_subsequent_push` gate not yet independently observed) — lands UNCOMMITTED, `docs/data/orch/orch-state.json` is outside agent-father's commit zone (FU-AGENT-FATHER-ORCH-SCOPE).
- **Not fixed here (flagged, out of scope):** a genuinely new, unrelated Pipeline-A type `cowork-fire` appeared live mid-task and re-trips the guard/TEST10 post-fix — different pipeline, different subject, no claim held. Guard's own self-filing fallback already auto-tracked it (`FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire`, backlog, owner po). Needs its own fresh triage/dispatch, not folded into this task.

## FIX 2026-08-23T09:45Z — cowork-team Step 4.7 + 5.3 doc-truth pair (2 P3 rows)

- 4.7 `tick-snapshot.md`: "pure bash cannot call MCP" false since `mcp-call.sh` f7d34918d
  2026-07-02 (row said 07-30 = mtime). Folded in-fence; ran verbatim, 20199B vs 20190B ref.
- 5.3 `spawn-fanout.md`: surface contract + provenance fix + fail-open negative control +
  >=2-distinct-marker threshold. `.output` = 187B symlink → 246939B transcript; the 1515B
  dispatcher-authored prompt ALONE scores 6/6.
- **LESSON: a detector whose markers come from its own prompt is not exogenous — grep
  `docs/signals/` before calling one fixed.** That grep found an unprocessed 2026-07-30
  signal: a 3rd FP, 1/6 on a disclaimer, on the CORRECT surface — scoping alone misses it.
- Out of zone → agents-architect: caps pattern `docs/agents/*/flow/**/*.md` matches nothing
  (bash `case` `**`==`*`); 173 flow files ungoverned. Rows NOT flipped (orch-state).

## Keep (maintenance) 2026-08-23T14:23 — CHECK6-FLEET-ROLLOUT-DEBUG-LOGGER-PROTOCOL

Scheduled cron tick. Pre-Check gate (`git diff --name-only HEAD~3..HEAD`) touched zero
`.claude/agents/*.md`/`docs/agents/*/flow/*.md` → Steps 1-2 (orphan+roster scan) SKIPPED per
CADRAT-3 routing. Steps 3-5 (sweep-fixes) + 5b (team-tool-recheck) ran unconditionally.

- **Scanned:** 41 real agent init.md cards (45 `docs/agents/*/` dirs minus `shared`/`tools`
  non-agent dirs, minus `semble-search` — a skill-usage pointer doc with no `agent:` YAML root,
  not an agent card despite the dir name — minus 3 structurally-INIT-MISSING dirs `cowork-team`/
  `dev-news-fetch`/`dev-team`, unchanged from prior cycles, out of Steps-1-2-scope this cycle
  since those were gated off).
- **Check #1 (fail-loud-protocol) / #2 (Error Boundary, one-hop+dispatch-table resolved) / #3
  (boundary_rules) / #4 (flow.default path resolves):** 41/41 PASS. (Own script initially mis-flagged
  all 41 as Check-4 FAIL — a macOS/BSD-sed `\s` portability bug in my own throwaway grep, not a
  real finding; re-verified with a portable Python regex, all 41 genuinely PASS. Lesson: don't
  trust a 100%-fail sweep result without a differential check against a known-PASS agent — cf.
  `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` pattern, same shape, caught
  before acting on it this time.)
- **Check #5 (version staleness, >90d):** 5 FAIL — `claude-manager-helper`, `dev-api-gateway`,
  `dev-kinh-dich`, `dev-rag-service`, `dev-stock-price`, all pinned `"2026-05-24"` (91d stale).
  Auto-fixed: bumped to `"2026-08-23"` (Step 4 table: mechanical, no manual authoring implied).
- **Check #6 (debug-logger-protocol, new since 08-22's `d65da8640`):** 40/41 FAIL — first `keep`
  cycle to run since the check landed, so this was the fleet's first-ever Check-6 sweep. Per the
  check's own SSOT (`docs/agents/shared/debug-logger-protocol.md` § Rollout: "auto-fix-driven, not
  a one-shot mass edit... other agents pick up the pointer via the same keep-cycle auto-fix
  mechanism already used for fail-loud-protocol.md") — auto-fixed all 40 this cycle by locating the
  end of each file's `knowledge.lazy_load:` array (generic block-end scan, not hardcoded to the
  `→ KLFL:` sentinel — 11/40 files don't carry that sentinel at all, confirmed live) and appending
  the same 4-line pointer block agent-father dogfooded 08-22, substituting per-agent `<agent-id>`
  in path/note and using the Read-then-Write-append note variant for the 2 confirmed Bash-less
  agents (`bctc-analyst`, `refine_bctc_md` — matches the protocol doc's explicit exception list,
  cross-checked against each `.claude/agents/<id>.md` `tools:` line, not assumed from memory).
  1 agent (`refine_bctc_md`) had no `lazy_load:` key at all (only `always_load:`) — added the key
  fresh rather than deferring, same low-risk mechanical pattern, now 41/41 clean.
  **Verification before commit:** every touched file's `knowledge:` sub-block parses cleanly in
  YAML isolation (dedented + `yaml.safe_load`) and contains the new lazy_load item; `git diff
  --stat` confirms pure additions only (no accidental deletions) across all 40 files; full-document
  `yaml.safe_load_all` was tried first and rejected 36/39 files — a false alarm, since these
  init.md files are markdown-with-embedded-YAML, not standalone YAML, and 36/39 **originals**
  fail the same strict parse (verified against `git show HEAD:<file>` before concluding this was
  pre-existing format, not something my edit broke).
- **Step 5b (team-tool-recheck):** ran unconditionally per its own spec (independent of the
  Pre-Check gate). HEADLINE: zero drift vs 2026-08-22T12:42Z — all 7 scope-in agents' frontmatter
  byte-identical, re-verified live not carried forward blind. 6 CRITICAL findings (Bash present,
  by the check's own Step-2 construction rule), all "honestly qualified" description text
  (unchanged since `476646c4e` 08-14 fixed the unqualified-claim gap this check was designed to
  catch — traced the commit history before concluding zero-NEW-findings ≠ check regression, per
  the check's own §3 FAIL-LOUD trap for a silently-broken detector; positive control still holds
  since alert-commander stays CRITICAL by construction regardless of description honesty).
  Mechanical enforcement still 0/0 (no `write_boundary` keys, no `agent-write-boundary-guard`
  hook) — standing gap, not re-escalated (already PO/architect territory per prior cycles). Full
  report: `docs/agent-memory/health/team-tool-recheck-2026-08-23-1423.md`.
- **Stale notebooks (Step 5, informational only):** 10/46 not committed in >30d — 2 look like
  split/archive artifacts (`cowork-refactory-expert-2026-07-11-fr1-atomic.md`,
  `pm-alpha-s2-rag-fts-rebuild-cron.md`), 8 are real per-agent notebooks aging out
  (`cowork-refactory-expert`, `dev-kinh-dich`, `dev-news-fetch`, `idea-forge`, `market-analyst`,
  `ops-mainserver-fetch`, `pm`... wait `qa-responder`, `semble-search`). Not actioned — information
  only per flow spec.
- **Not touched (out of scope, unrelated concurrent peer work seen in working tree at session
  start, explicit pathspec-only staging kept it off this commit):** `docs/agents/pm/flow/main.md`,
  several `docs/agent-memory/notebooks/*.md` and `docs/agent-memory/decisions/*.md` files already
  modified by other in-flight agent sessions.
- Trigger: scheduled. Agents scanned: 41. Auto-fixes: 45 (40 Check-6 insertions + 5 Check-5 version
  bumps, overlapping same 5 files). Escalations: 0 (all findings this cycle were mechanically
  auto-fixable; team-tool-recheck's Bash-vector gap is a standing, already-tracked recommendation,
  not a new escalation). Orphans: 0 (Steps 1-2 gated off, no new scan this cycle).
- Lesson: a brand-new fleet-wide check (Check #6, 1 day old) can legitimately fail 40/41 agents on
  its very first live sweep without that being a bug — the guide's own rollout design anticipates
  exactly this ("auto-fix-driven, not mass edit" = the sweep mechanism itself IS the rollout
  vehicle, and it fires in full on the first cycle it's reachable, not spread thin on purpose).

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
