# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## EDIT 2026-08-15T11:34Z — FIX-COWORK-CRON-SIBLING-PROCESS-DEFER, router-dispatched (intent=edit)
- Signal consumed: `docs/signals/2026-08-15-cowork-cron-registration-sibling-process-defer.json`
  (type=architecture_brief, from=agents-architect — no auto-consumer in main.md's dispatch table,
  router triggered me directly with intent=edit per the signal's own note).
- Brief: `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md`.
  2-file implementation contract, `.md`-only, own zone.
- File 1 `.claude/skills/cron-detect-loop/register.md`: removed the user's uncommitted
  "Block/Interdit" paragraph (misplaced — that file governs cron-detect-loop's own 4 jobs, not
  the unrelated cowork-team `*/15` dispatcher). `git diff HEAD` post-removal = 0 lines — the
  paragraph was never committed, so nothing to land for this file.
- File 2 `.claude/skills/cron-cowork-team/SKILL.md`: Step 1a rewrite adds a client-side
  `$PPID`+`lstart($PPID)` process fingerprint (`payload.registering_process`, Step 1c) compared on
  the `hb.ok==true` fast path — closes the root-caused gap (two sibling OS processes sharing one
  `$CLAUDE_CODE_SESSION_ID` both passed the old session-UUID-only check and independently
  `CronCreate`'d a duplicate `*/15` entry). Mismatch → DEFER (WORK telegram, no local `CronCreate`)
  with a `heartbeat_at`-based self-heal (age>1800s = presumed-dead sibling, steal+re-register).
  New "Sibling-Process Defer — Fallback Only" subsection replaces the removed note's intent as an
  explicitly-labeled fallback (not primary — brief rejected resurrecting the retired
  `feedback_router_cowork_defer_to_live_leader` convention as primary).
- Out of scope, not actioned (per signal's own `_note_to_agent_father`): brief §0.4's fire-election
  RE-ENTRANT double-dispatch hole (`leader-lock.md`, dev-team Step[3], auditor tiers,
  `dispatch-claim/CARD.md`) — flagged for PO scoping; architects-architect already dropped a
  separate `brief_complete` signal to PO for it.
- Size governance: file was already over the 200L skill-file cap pre-edit (242L, flagged
  2026-08-11, routed-to-po, never remediated) — my edit (242L→283L) tightened the new prose after
  the live `context-bloat-backstop` hook auto-fired a fresh breach signal
  (`docs/signals/context-bloat--claude-skills-cron-cowork-team-SKILL-md-2026-08-15T112802Z.json`,
  line+byte cap). Did NOT attempt a full split/prune — that's PO/claude-manager-helper territory
  per the 08-11 precedent (`routed-to-po`), out of this task's bounded 2-file scope. Left the fresh
  breach signal for dev-team's normal drain to route.
- Signal file itself: NOT moved to `docs/signals/processed/` — `docs/signals/` is outside
  agent-father's `commit_zone.allowed` list (`docs/agents/`, `docs/agent-memory/`,
  `.claude/skills/`, `.claude/agents/` only); that drain/processed-move is dev-team's own
  mechanism (`agent-chaining-protocol.md` § Cross-Team Signal Directory), out of scope here.
- Lock: no gateway binding this session (confirmed — `mcp__gateway__call_tool` absent from tool
  grant). Docker reachable → SQL-replication fallback (`docker exec
  vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against `/app/data/coordination.db`
  `task_locks`) for claim (`task:FIX-COWORK-CRON-SIBLING-PROCESS-DEFER`) + commit-mutex, both
  live-verified no conflicting row before `INSERT OR IGNORE`, released after push. Commit
  `0468c2821` pushed to `main`.

## EDIT 2026-08-15T00:24Z — FIX-NEWSSCOUT-COMMIT-POLICY-NEVER-MECHANICALLY-WIRED,
router-dispatched (intent=edit)
- Bug: `docs/agents/news-scout/flow/stage-log-notify.md` L14 stated "Off-hours cycles retain
  their own per-cycle commit" but no step anywhere in news-scout's flow tree ever executed a
  git/commit-mutex call (`grep -rn "commit"` showed only that one prose line + unrelated
  dedup-log strings). Router's own RAW-verification confirmed it live: tick 2026-08-15T00:00Z,
  `slot=news-scout-offhours` — agent's tool-call log had zero git/commit-mutex invocations, only
  2 coverage-stamp.sh calls + a tmux check; `docs/agent-memory/notebooks/news-scout.md` genuinely
  modified on disk (real c269 section) but left uncommitted after the run.
- Fix: ported market-watcher's identical, working off-hours-self-commit block verbatim
  (`docs/agents/market-watcher/flow/cycle.md` — FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-
  SKIPS-COMMIT-LOSES-NOTEBOOK, 2026-08-06) into `stage-log-notify.md`: `task_claim` mutex guard
  (bounded 2-retry, 5s apart, proceed-unguarded WARN on 3rd fail) → `git_commit_retry` with a
  trailing RULE 2.5 pathspec (`-- docs/agent-memory/notebooks/news-scout.md`, per
  `.claude/skills/commit-boundary/SKILL.md` — a bare commit sweeps whatever else is staged) →
  `task_release` in a finally → BUG-channel fallback on exhausted retries. Used a DIFFERENT mutex
  key (`news-scout-notebook:main`, confirmed no collision) from market-watcher's own
  `market-watcher-notebook:main` since both agents can co-fire in the same cowork batch. Gated on
  `slot=news-scout-offhours` (the invocation prompt's `slot=` param, per the same cowork-dispatcher
  convention market-watcher's `main.md` already documents — news-scout's own `main.md`/`cycle.md`
  don't route sub-flows by slot, so the check reads the literal invocation prompt directly at this
  step); preserved the existing "deferred to market-watcher eod.md" sentence unchanged for
  `slot=news-scout-market`/`slot=news-scout-sentiment`/manual invocations.
- File grew 113L→140L, over the 120L flow-file cap — added a `size-justification` header (same
  pattern as sibling `stage-signals.md` and market-watcher's own `cycle.md`, both already
  over-cap for the identical non-factorizable-block reason).
- Lock: no gateway binding (tool grant Read/Edit/Write/Glob/Grep/Bash only). orch-state
  `.head.status=in_progress` but both `task_board.in_progress[]` rows (UC-CCA-P3 zone
  `cross-service/`, UC-CDC-P1 zone `multi`) are unrelated to my zone (`docs/agents/news-scout/`,
  `docs/agents/agent-father/`) and awaiting `next_agent` (qa/pm), not live concurrent writes here
  — Solo operation exception applied per `commit-boundary/SKILL.md`, no lock claimed.
- Scope respected: did not touch `docs/agent-memory/notebooks/news-scout.md` (not my notebook to
  edit) per the dispatch instruction.

## EDIT 2026-08-14T23:03Z — task TASK_2008c (UC-CDC-P1 3-way split, agent-father slice),
router-dispatched
- Context: UC-CDC-P1 (compute `calendar_status` server-side, break the circular self-recycling
  loop) decomposed by PM into 3 tier-1/independent tasks — TASK_2008a (dev-mcp-server, FR-A1/A2),
  TASK_2008b (developer, FR-A3), TASK_2008c (this row, agent-father, FR-A4/A5,
  `docs/agents/cowork-team/flow/` zone). Zero `depends_on`; no coordination needed with 2008a/2008b.
- FR-A4: deleted `telemetry.md` Step 6.0's `"calendar_status": "<CALENDAR_STATUS from Step 4.3>"`
  arg (L15) from the `emit_pressure_state` call_tool block — the WORK-path half of the
  self-recycling loop (dispatcher read the value out of pressure-state.json in Step 4.2, then
  wrote it straight back on Step 6.0); TASK_2008a closes the server-compute half. Step 6.0's own
  MANDATORY/un-skippable invariant untouched — only the one arg line removed. Confirmed L63's
  payload `calendar_status` field (Step 6.1 observability write) is a distinct purpose, out of
  FR-A4 scope, left as-is.
- FR-A5: `pressure-read.md` Step 4.3 previously silently fell through to the no-suppression branch
  for ANY value outside `["holiday","weekend"]` — indistinguishable from a legitimate `"unknown"`,
  the exact mechanism that let a stale `"closed"` literal persist undetected for days. Added
  explicit `CALENDAR_STATUS_DOMAIN=[open,half_day,weekend,holiday,unknown]`; any value outside it
  now logs + `send_telegram(channel="bug", message="[pressure-read] out-of-domain calendar_status:
  <value>")` before falling through to the SAME unchanged no-suppression path — no new blocking
  behavior, no rate-limit (self-heals within one tick once TASK_2008a lands). Style matched to
  existing `spawn-fanout.md` IDENTITY_CHECK=FAIL `channel="bug"` precedent.
- Refreshed both files' stale `size-justification` headers to actual post-edit counts:
  `telemetry.md` 153L→163L (net −1, still over the 120L flow-file cap, pre-existing exemption),
  `pressure-read.md` 90L→117L (net +12, now under the 120L cap outright). No unit-test twin for
  either FR (Step 4.3 is pure LLM-narrated prose, no JS/TS mirror) — verification is live-tick
  notebook observation per the row's own AC.
- Lock: no gateway binding (tool grant Read/Edit/Write/Bash only) — Solo operation exception
  applied (`.head.status=idle`, `active_task_id=null` at read time) per `commit-boundary/SKILL.md`;
  no lock claimed, none needed.
- Board disposition: `TASK_2008c` `ready[]` → `review[]`, `status: TODO → REVIEW`,
  `next_agent: null → qa`, `agent_father_implementation_note` added, via `scripts/orch-apply.sh`
  (validate + conservation-check both PASS, `task_total` unchanged 695→695). Left UNCOMMITTED per
  `FU-AGENT-FATHER-ORCH-SCOPE` — write is on disk, ready for the next commit sweep.

## EDIT 2026-08-15T04:45Z — task FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW, router-dispatched (intent=edit)
- Change: generalised RAG-MEM-DURABILITY-BAR v2 (D1-D5) fleet-wide — new SSOT
  `docs/standards/oom-durability-verification-bar.md` (detection rule, D1-D5, §4 grandfather-
  exemption/retraction guard, v1-failure rationale) + wired into `docs/agents/qa/flow/main.md`
  (new "OOM-Class Durability Gate" in Pipeline + mandatory cross-ref in Direct-Commit Verify
  gating `vc-approved`, the observed path for OOM-class rows).
- Files modified: 2 (1 new: `docs/standards/oom-durability-verification-bar.md`; 1 edited:
  `docs/agents/qa/flow/main.md`, 275L→~304L, size-justification header refreshed)
- Cascade: none — no `.claude/agents/qa.md` frontmatter/routing change, no roster/CLAUDE.md impact
- Validation: 5/5 passed (qa.md frontmatter intact; flow-catalog paths resolve; no inter_agent
  routing touched; all cross-referenced paths in new doc exist; code-fence count in main.md even)
- Decision: defect 5 (stale grandfather exemption on falsified rows) needs an
  `orchStateSchema.ts` runtime guard to close in code — out of this row's `files` scope (`apps/`)
  and agent-father's own `forbidden_outputs` (no production code); documented as a process-level
  compensating control + flagged the open engineering gap for a future dev-mcp-server task instead
  of minting one myself (orch-state.json excluded from my commit_zone).
- Lock: no gateway binding this session (confirmed live — `mcp__gateway__call_tool` absent from
  tool grant). Docker reachable → used the documented SQL-replication fallback
  (`docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against
  `/app/data/coordination.db` `task_locks`) for claim (5a) + heartbeat (7b), live-verified no
  conflicting row before INSERT OR IGNORE, per `edit-apply.md`'s Gateway-less exception ladder.
