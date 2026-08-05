# Agent Father — Notebook

## Fix (dev-team dispatch, TOKEN-ECONOMY-AUDIT) 2026-08-05T16:59:18Z TE-T02
- `docs/agents/dev-team/flow/main.md` 1087L/128,392B → 888L/118,924B (-9,609B, ~2.4k tok). 2 of the
  row's 3 relocations landed, byte-verified verbatim (WU-2 guarantee) via sed-extract + diff before
  AND after write, never hand-retyped: (a) Step 0-PREFLIGHT-FALLBACK (ERROR-verdict-only,
  L109-219) → new `preflight-fallback.md`, pointer left at the `jump:preflight-fallback` anchor;
  (b) Step 0a-B's per-signal orphan-adoption loop (L309-410) → new `orphan-adoption.md`, the 8-line
  `task_list_held` probe (N_MAX + call_tool + comment) kept inline per the row's own note so the
  common no-orphan-signals tick pays zero extra read. Both new files follow the existing
  drain-signals.md/ci-health-probe.md convention (size-justification header, `**Parent flow:**`
  pointer, `→ Run sub-flow:` line in main.md). Fixed 2 small staleness items in the same commit:
  JUMP-TO table ERROR row wording ("unchanged" → "relocated to its own sub-flow file"); confirmed
  main.md carries NO self-referential absolute-line-number comments (grepped `~L[0-9]`/`L[0-9]{2,4}`
  before editing — none), so no internal citations needed fixing.
- (c) BOUNDED-1 Promote bullet's 8 gate-history paragraphs + NON-CODE/DESIGN gap note (~10.6KB) —
  the row's own note says relocate into `scripts/devteam-backlog-promote-bounded1.jq`'s header, NOT
  a new .md file. Initially DID write that file (verified: jq still parsed, existing
  `test-devteam-bounded1-*.sh` suite re-run showed only PRE-EXISTING unrelated failures — same
  `$archive`-undefined compile error and missing `effective_*`/`is_epic_wrapper` defs on the
  ORIGINAL file too, confirmed via `git stash`; not caused by this edit) — then REVERTED it
  (`git checkout --`) on finding my own repeated precedent (S1-S20, TE-T12/TE-T14/TE-T21, this
  file's own prior entries) that `scripts/` sits outside `commit_zone.allowed` even when a dispatch
  prompt explicitly names it. Restored main.md's BOUNDED-1 section byte-identical to original
  (diff-verified clean) rather than leave a shrink with no landed destination — would have
  temporarily DELETED content the row's own CRITICAL CONSTRAINT says must only ever be RELOCATED.
  Exact ready-to-apply patch (both halves, main.md shrink text + jq header addition, byte-verified)
  supplied in RETURN for a developer to land in one commit; ~70k tok/day of the row's ~200k/day
  estimate still pending on that.
- Could not `task_claim`/`task_release` `task:TE-T02` myself — no MCP gateway tool grant reaches
  this session (`call_tool`/`mcp__gateway__call_tool` both errored "No such tool available"; agent-
  father's `tools_packages: [bootstrap]` per its own init.md). Did not touch
  `docs/data/orch/orch-state.json` (`commit_zone.excluded`, same precedent as TE-T12/TE-T14/TE-T21)
  — router/dev-team holds gateway access and must release the lock + route the board row.
- Verified post-edit: code-fence count even (36), all 12 `jump:` anchors present, jq syntax check
  on the (reverted, original) `scripts/devteam-backlog-promote-bounded1.jq` still passes.

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
