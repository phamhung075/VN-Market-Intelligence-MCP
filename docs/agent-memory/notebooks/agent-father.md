# Agent Father — Notebook

## Clean (router-dispatched, PO manual-dispatch DRS-STRANDED-OFF-ALLOWLIST) 2026-08-01T00:00:00Z TE-T14
- `docs/agents/system-auditor/flow/main.md` Step 0c was prose `Read docs/data/system-map.json and
  extract:` + a 6-bullet key-path list underneath — the bullets never actually gated the Read, so
  the step full-read the whole 1757L/~50.6KB file (~12.7k tok) every `runtime_or_fetch_or_db_audit`
  cycle regardless. Rewrote as a single `jq -c` projection over the same 6 key-paths (microservices
  id/external_port/zone, host_runtime_set.services + not_deployed_by_design, data_sources
  cadence/threshold/geo_blocked, databases id/path, zones id/specialist) → ~4.8KB/~1.2k tok, plus a
  `jq`-unavailable fail-loud fallback (full-read same paths by hand).
- Verified live before writing: grepped real field names off the file (`external_port` singular,
  not the row's paraphrased `external_ports`) rather than trusting the task description's bullet
  text; ran the exact jq command against the live file post-edit — exit 0, all 6 arrays populated
  (11/12/0/28/7/12). Grepped fleet-wide for `Step 0c` and `jq.*system-map.json` callers — no other
  file references this step's old prose shape, no cascade edit needed.
- Did NOT touch `orch-state.json` (`in_progress[]→review[]` lane-move) — own init.md
  `commit_zone.excluded` names it "NEVER in agent-father commits except the ONE allowed
  signal-queue DONE-mark", and this is a task_board row, not signal_queue. Same precedent as
  TE-T12/S16: declined the dispatch prompt's instruction to run `orch-apply.sh` myself; supplied
  the exact transform in RETURN for dev-team/router to apply.

## Fix (dev-team dispatch, PO triage DRS-STRANDED-OFF-ALLOWLIST) 2026-08-01T01:20:00Z TE-T21
- `.claude/skills/task-lock/SKILL.md` 283L→186L. §Session-Presence Row (73L) was near-verbatim
  duplicate of dispatch-claim's own claim/heartbeat/current_task-reclaim/non-adoptable blocks —
  replaced with a 7L pointer. Verified the dedup direction BEFORE editing: task said point at
  CARD.md §0a, but CARD.md:38 is itself only a 1-line forward-pointer at SKILL.md — SKILL.md §Step
  0a is the actual fuller/authoritative spec (497L incl. full code), so pointed there instead,
  matching the source audit's own proposal (`docs/architecture-briefs/2026-07-12-token-economy-
  lazyload-audit.md#T-21`). Lesson: when a task names a candidate SSOT, verify it isn't itself a
  thin pointer one hop from the real fuller doc — don't dedup toward a summary-of-a-summary.
- Also deleted §Phase Status (23L shipped-sprint commit-SHA changelog, recoverable via `git log`)
  and §Legacy Backward-Compat Fallback (14L "TRANSITIONAL" note for a matching-ladder rung) — the
  latter is not just stale prose but factually WRONG now: grepped live
  `coordinationStore.ts:716,761` and confirmed TASK_1980/P1-FINAL already deleted the fallback
  rungs the section claimed still existed. Left as-is it would have actively misled a future reader
  into thinking a dead code path was live.
- No other active flow/skill/package doc references the 2 deleted section names or breaks — only
  historical audit/handoff docs cite exact old line numbers (point-in-time citations, untouched by
  design). `dispatch-claim/CARD.md` needed no edit — read for SSOT verification only.

## Fix (router-dispatched, PO triage 2026-08-01T04:07Z tick) 2026-08-01T04:57:50Z FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES
- `po/flow/triage-signals.md`'s routing table only covered dev-team's `pendingSignals[]`
  drain (11 types) — jq-measured live `.signal_queue.rows[]` (`to==po`, 132 rows) against
  it and confirmed 0/16 distinct hot types matched; the doc's own "unknown type" fallback
  absorbed 100% of that separate pipeline (root cause: `main.md`'s Pre-check reads the
  queue but never told PO which table entry to route by — the doc existed in isolation).
- Added a "Live `.signal_queue.rows[]` inbox" section: 5 highest-volume types inline
  (signal_feedback/microservice_degraded/data_stale/system-issue/db_integrity_breach,
  86% of the 132) + new lazy-load sibling `triage-signals-longtail.md` for the other 11
  (routing-gap, orch-health-finding, tool_contract_gap, bctc-data-quality-anomaly,
  config_drift, context_bloat_breach, methodology-flag, notebook_unparseable_breach,
  ops_followup_request, recurring_churn_escalation, triage-persist-request) — size-cap
  split, not a dump into one giant table. Rules were mined from the `disposition` field
  already recorded on the live "triaged" rows (PO's own improvised practice), not invented.
- Fixed `bug-escalation`'s undocumented 3rd payload class: `[sweep-guard] SAME-FILE
  DIVERGENCE` signals carry no `escalated` key by construction (plain-string payload,
  architecture brief `2026-07-21-commit-path-peer-index-sweep-guard.md` §2.7, permanently
  NON-GOAL/non-blocking) — old table forced `escalated=` parsing that would always fail on
  it. New branch dedup-bumps `FIX-SWEEPGUARD-SAMEFILE-DETECTOR-UNSTAGED-PATH-FALSE-POSITIVE`
  (open, 10/10 confirmed FP) instead of re-minting, with a conditional true-positive path
  once that FP root cause ships.
- `.claude/skills/signal-dashboard/SKILL.md`: added cowork-team/dev-team as declared `po`
  senders (measured the two actual largest, previously undeclared); admitted `triaged`/
  `RETRACTED` to the status enum (127+3/132 live, zero prior doc backing) — flagged, but
  did NOT fix, that `scripts/orch-cold-evict.sh`'s `TERMINAL_SIGNAL_STATUSES` default omits
  both (0/130 `triaged` rows ever evict) — out of `scripts/` commit_zone, needs a developer
  follow-up FIX row.
- New inline jq guard (`triage-signals.md` § Regression verifier — signal-type coverage)
  in place of a `scripts/audits/*.sh` file (outside `commit_zone.allowed`) — live-verified:
  PASS/rc=0 against the real orch-state.json, FAIL/rc=1 + names the type on a synthetic
  `zz-synthetic-unrouted-test` fixture row.
- Did NOT touch `orch-state.json`'s task_board row myself (`commit_zone.excluded`, same
  precedent as TE-T12/TE-T14/TE-T21) despite the dispatch prompt asking for the flip —
  supplied the exact BACKLOG→REVIEW `orch-apply.sh` transform in RETURN for router to run.
