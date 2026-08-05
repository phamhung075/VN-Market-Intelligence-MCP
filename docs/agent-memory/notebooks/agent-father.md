# Agent Father — Notebook

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

## Fix (router-dispatched, sprint CADENCE-RATIONALIZATION-20260804) 2026-08-04T20:10:00Z CADRAT-3+CADRAT-7
- CADRAT-3: git-diff pre-check gate (`HEAD~3..HEAD`) added to code-janitor/flow/main.md
  (skips Decision-Tree DRY scan when src/|apps/*/src/ untouched; 3 every-scan sweeps stay
  unconditional) and agent-father/flow/keep.md (skips Steps 1-2 orphan+roster scan when
  .claude/agents/*.md|docs/agents/*/flow/*.md untouched; Steps 3-5 stay reachable).
  claude-manager-helper/flow/main.md untouched (precedent, not edited). AC-4 dry-run proof
  ran against real git history for both gates (correct-skip + correct-fall-through each).
- CADRAT-7: news-scout-sentiment cron 05:00→01:30 UTC (self-contradicted "pre-market" label
  — 12:00 ICT was 3h post-open, inside lunch) in cowork-schedule.json + news-scout/init.md.
- **Lesson (live, costly near-miss):** `git commit -m ... -- <path>` on a path that is ALSO
  modified elsewhere in the working tree does NOT respect a partial `git apply --cached`
  stage for that path — pathspec-commit implies `--only`, i.e. WORKING TREE content wins,
  index is ignored for named paths. First CADRAT-7 commit attempt swept 22 unrelated live
  `last_fired` bumps from cowork-schedule.json (a dispatcher-mutated hot file) into the
  commit. Caught via the sweep-guard hook's non-blocking warning, not by me pre-checking.
  Fix pattern for isolating one hunk in a concurrently-dirty tracked file: stage the hunk
  (`git apply --cached`) → `git checkout-index -f -- <path>` to materialize ONLY the index
  content into the working tree → commit with pathspec (now safe) → restore the backed-up
  full working-tree content afterward so other agents' pending writes aren't lost.
- Wrote the one allowed exception write (signal_queue DONE-mark, `orch-apply.sh`, read-back
  confirmed) addressed to po requesting QA verify + task_board lane-move — did not touch
  task_board rows directly (`commit_zone.excluded`), same precedent as prior cycles above.

## Fix (router-dispatched, PO self-triage) 2026-08-05T09:32:49Z FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR
- Confirmed both defects live before editing: grepped all 14 `docs/agents/po/flow/*.md` —
  `sprint-kickoff.md`, `channel-audit.md`, `market-group.md`, `telegram-reports.md` each had a
  prose-only "append to `.task_board.backlog[]`" step with zero `orch-apply.sh` pipe (2 carried a
  dangling "§2.3 atomic write" pointer to a section that never existed anywhere in the repo); vs
  `manual-dispatch-sweep.md`/`supervised-goahead.md`/`triage-signals.md` which already pipe.
  `main.md`'s commit-mutex `own_paths` declared `["docs/agent-memory/notebooks/po.md"]` only —
  `orch-state.json` genuinely excluded from PO's own commit, matching the row's own diagnosis.
- Fixed the 4 sub-flows in place: replaced prose with inline `jq ... | bash scripts/orch-apply.sh`
  at each mutation point, field-shape unchanged. Widened `main.md`'s commit-mutex `own_paths` to
  `[notebook, decision-journal path, orch-state.json]` — one committer per cycle (supersedes
  decision-journal's own separate bare-commit rule for PO specifically, never touches the shared
  skill). Added AC-3: mandatory `git show --stat $(git rev-parse HEAD)` self-verification before
  any RETURN may claim "committed"/"confirmed in HEAD" — stated as a generic reusable rule
  (write-then-assert-persistence must re-read git HEAD, not the write call's exit code) so
  tran-ngoc-bau/cowork can adopt without re-deriving the mechanism, per the row's own scope note.
- Verified: re-ran the 3 existing PO regression verifiers
  (`po-triage-mint-backlog-status-lane-coherence-verify.sh` 42/42,
  `po-manual-dispatch-sweep-verify.sh`, `po-goahead-producer-verify.sh`) — all still PASS, no
  regression from the edits. `orch-state.json` untouched by my session (`git status` clean on it).
- Declined to author `scripts/audits/po-mint-orchapply-actuator-verify.sh` (the row's own AC also
  asks for this) — `scripts/` is outside `commit_zone.allowed`, same boundary as S1-S20 precedent
  above. Documented the exact grep predicate as a spec inline in `main.md` § Regression verifier
  and handed off via RETURN (NEXT: developer/architect) rather than widening my own commit.

## Keep (maintenance, router-dispatched, scheduled daily) 2026-08-05T12:57:56Z
- Pre-Check gate (CADRAT-3): `git diff --name-only HEAD~3..HEAD` matched zero `.claude/agents/*.md`
  or `docs/agents/*/flow/*.md` paths (last 3 commits touched notebooks + signal files only) →
  correctly SKIPPED Steps 1-2 orphan+roster scan, fell through to Steps 3-5 with empty
  scan-orphans output (0 ORPHAN/MISSING/UNREGISTERED/PHANTOM).
- Top-5 sweep ran against all 42 `docs/agents/*/init.md` (the real full agent-definition files —
  `.claude/agents/*.md` are thin bootstrap pointers only, confirmed 0/42 carry fail-loud-
  protocol/boundary_rules inline by design). Checks 1/3/4 (fail-loud-protocol, boundary_rules,
  flow-path resolves + Error Boundary present in flow main.md) PASS fleet-wide except
  `semble-search` (fails #1+#3) — NOT auto-fixed: it's a Task-tool utility subagent (haiku
  model, wraps `semble` CLI) outside the guide's two agent families (Cowork/Dev Team), so
  bolting on full-lifecycle sections may be architecturally wrong, not a genuine gap. Escalated
  to PO: bring into compliance vs. document as an explicit guide exception (utility/tool-wrapper
  class) — guide currently has zero carve-out for this shape.
- Check #5 (version >90d stale): 13/42 flagged — architect/ba/code-janitor/cowork-refactory-
  expert/fixer/idea-forge/ops/pm/po/qa-responder/qa (2026-04-26, 101d) + dev-mcp-server/
  dev-pdf-extractor (2026-05-06, 91d). Did not blind-stamp: spot-read 2 of the 13 in full
  (po, architect — confirmed every cross-referenced path in tools_package/flow.default/
  knowledge.always_load actually resolves) plus reconfirmed all 13 already pass Checks
  #1/#3/#4 before bumping `version:` → `2026-08-05` on all 13, the documented mechanical
  auto-fix (sweep-fixes.md Step 4). Guide itself defines no `version` field semantics (grepped
  guide + all 6 guide-*.md parts, zero hits) — treated the bump as "confirmed still-compliant
  as of this date", not a fabricated content claim.
- Step 5 stale-notebook report (info only, no action): 4/46 notebooks >30d —
  semble-search/market-analyst/idea-forge (94d), qa-responder (69d).
- FYI-only per dispatch note (NOT actioned — keep.md has no backlog-scan step, so this wasn't
  "reached" this cycle): `FIX-AUDITOR-A30-PROBE-SH-MISSES-RAG-SERVICE-CONTAINER` (P1,
  next_agent=agent-father) — `docs/agents/system-auditor/probe.sh`'s A-30 mem-creep deep-probe
  is scoped to `MCP_CONTAINER` only (derived line ~123, deep-probe block ~138-159), no
  rag-service loop; live-verified the gap myself by reading the script. Left untouched per the
  explicit "not a directive to go out of your way this cycle" instruction — surfacing in RETURN
  for developer/architect.
