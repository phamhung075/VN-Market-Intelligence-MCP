# Agent Father — Notebook

## Clean (router-dispatched, PO manual-dispatch DRS-STRANDED-OFF-ALLOWLIST) 2026-07-31T02:36:00Z TE-T11
- Wired `step-0-cowork/SKILL.md` into 10 flow files (chef, market-watcher/cycle+eod,
  news-scout, alert-commander, bctc-analyst, digest-predict×3, unified-agent/market-bootstrap):
  collapsed the separate `cycle-bootstrap/SKILL.md` + `regime-extraction/SKILL.md` pointer
  lines into one `step-0-cowork` reference each (`§ 0b` bootstrap-only where a flow doesn't
  consume `$REGIME`; `§ 0b-0c` where it does). All flow-specific inline logic (news-scout/
  alert-commander shape-validation gates, news-fallback derivation, tick-snapshot conditional)
  left byte-for-byte untouched — savings come from eliminating the 2 separate SKILL.md file
  reads, not from that in-file prose, so touching it would add risk for zero extra saving.
- Excluded the audit's 11th listed file, `cowork-team/flow/tick-snapshot.md`: it makes raw
  `get_cycle_bootstrap`/`get_macro_snapshot` MCP calls to PRODUCE the shared tick-snapshot
  other agents' bootstrap reads consume — it never invokes cycle-bootstrap/regime-extraction
  as a skill reader. Grep matched it only because a fallback-comment sentence contains the
  string "cycle-bootstrap/SKILL.md". Applying the swap there would be a category error (writer
  vs reader), not a genuine adoption gap — real scope is 10 files, not 11.
- Corrected the DoD phrasing per audit_ref: every new pointer line reads "→ skill:
  step-0-cowork/SKILL.md § 0b[-0c]" — never claims the composite "embeds the same
  GATEWAY-BLIND/regime-fallback boundaries" (it POINTS to cycle-bootstrap's Error-handling SSOT).
- Post-edit grep: `step-0-cowork` adoption count 0→10 (`grep -rl step-0-cowork
  docs/agents/*/flow/*.md`); zero remaining `cycle-bootstrap/SKILL.md` or
  `regime-extraction/SKILL.md` PRIMARY pointers in the 10 touched files (one intentional
  secondary SSOT-reference in alert-commander).

## Clean (router-dispatched, po daily-triage maintenance-lane) 2026-07-31T01:52:02Z TE-T08
- `.claude/skills/commit-mutex/SKILL.md` 256L→82L: inverted to a lazy-load hot card per
  the established repo pattern (signal-dashboard/doc-heal-system/pdf all split the same
  way — hot SKILL.md + `reference.md`). New `.claude/skills/commit-mutex/reference.md`
  (79L) holds the backoff table/jitter formula, full push rebase-retry bash, and
  No-Heartbeat/TTL rationale — loaded only on genuine contention or a failed push.
- Kept verbatim on the hot card (po landmine 2026-07-31T0132, all correctness gates,
  not just the flagged one): INV-GATEWAY-1 scope note, C-2/C-2b fail-closed paths, the
  foreign-restore rule, and — the flagged one — the PATHSPEC-SCOPED commit gate
  (`git commit ... -- <paths>`, "NEVER bare"). Post-write grep confirmed `-- <path1>`
  present in the commit example and all 5 gate-name strings still on the hot card.
- Fixed 2 live stale cross-references my own renumbering (Step 3d-PUSH→2d, Steps 1-4→1-3)
  broke: `.claude/skills/commit-boundary/SKILL.md` RULE 4 + its DRY-mirror line,
  `.claude/skills/commit/SKILL.md` Step 2. Did NOT touch `scripts/git-hooks/pre-commit`
  line 38 (same stale "Step 3c" comment) — `scripts/` is outside my commit_zone; flagged
  for developer/dev-team, non-blocking (hook's gating logic doesn't depend on the label).
- Left historical citations (architecture briefs, decision journals, `docs/WORK.md`) with
  old line numbers/step letters untouched — dated point-in-time evidence records, not
  live pointers, matching how prior lazy-load splits in this repo handled the same class.
- Board-state discrepancy: dispatch prompt claimed `.task_board.in_progress[]` /
  `status:IN_PROGRESS`; live read found the row in `.task_board.backlog[]` /
  `status:BACKLOG` (`updated_by: "po (triage-20260731T0132)"`). Did not flip it —
  `orch-state.json` is outside agent-father's commit_zone; flagged for router/dev-team.

## Fix (router-dispatched, dev-team session) 2026-07-31T00:00:00Z FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL
- DECLINED: dispatched as owner=agent-father, next_agent=agent-father (board row +
  architecture brief `2026-07-29-qadrain-head-slot-decouple.md` §8 "Actionable sequence
  for agent-father") but the task is a production-code edit to
  `scripts/devteam-review-claim-qa-drain.jq` (`cross-service/`). `docs/data/system-map.json`
  `zones[].id=="cross-service"` names `specialist: "developer"`, not agent-father.
  Confirmed against own init.md (`not_my_job`: "Writing production code — that's
  developer"; `commit_zone.allowed` excludes scripts/) and 8 prior journal STEPs — zero
  `.jq`/production-code precedent, all agent/.md/flow/skill work.
- Same failure shape as the 2026-07-29T14:56:21Z A-30 row above: an architect-authored
  brief claims scripts/-touching authority for agent-father; on direct read of the
  canonical SSOT (system-map.json here, qa_note there) the claim does not hold. Recurring
  pattern — architect-class agents keep writing "agent-father implements" into briefs
  for scripts/ work without checking the zone-ownership table first.
- Did NOT edit the `.jq` file, did NOT flip the board row's status/lane, did NOT write a
  DJ-GATE-1 DONE/REVIEW entry (no completed action to gate). Wrote a DECLINE decision-
  journal STEP instead (S8). Recommended in RETURN: PO/router reassign board row
  owner/next_agent `agent-father` → `developer` per system-map.json, then re-dispatch;
  optionally loop back to agents-architect to fix the brief's §8 heading so this doesn't
  recur for Part 2/3 of the same epic.
  self-committed, per this task's own dispatch note (no gateway/MCP grant this session).

## Fix (router-dispatched, S4 UNBLOCK co-dispatch) 2026-07-30T23:11:49Z FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE+FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT
- Both BACKLOG/READY rows share next_agent=agent-father, same actuator (`tools:` line),
  flagged CO-DISPATCH by the cowork row's own deliverable text — landed in one edit pass.
- `FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT`: added `Bash` to news-scout.md +
  market-watcher.md `tools:` line (exactly 2 lines, per po's pre-adjudicated transport
  ruling on the row — not re-litigated).
- `FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE`: added `Bash` to
  alert-commander.md `tools:` line (1 line) — closes both the notebook commit-mutex gap
  (6 consecutive cycles uncommitted) and the `task_claim` session-id derivation gap that
  had it firing verified CRITICAL alerts without the duplicate-publish mutex.
- RAW pre-edit verify: all 3 `tools:` lines grep-confirmed still missing Bash;
  `git log --since=2026-07-29T12:32:22Z -- .claude/agents/alert-commander.md` empty,
  matching the row's own claim. RAW post-edit verify: all 3 now
  `Read, Write, Edit, Bash, mcp__gateway__call_tool` — no Glob/Grep added.
- No cascade: `docs/agents/tools/package/*.md` catalog MCP tools only, unaffected by a
  native Bash grant.
- Structural note: agent-father itself carries NO gateway MCP binding (own frontmatter:
  `Read, Edit, Write, Glob, Grep, Bash`) — edit-apply.md's MCP task-lock steps (5a/7b/8b)
  are unreachable; followed `.claude/skills/commit-boundary/SKILL.md`'s gateway-blind
  fallback instead (solo operation — `.head.status=idle`, `active_task_id=null` at check
  time).

## Fix (router-dispatched, po manual-dispatch-sweep) 2026-07-31T01:10:34Z UC-ASL-P6
- Reconciled the row's 2026-07-16 supervised_reason flag first: `docs/agents/system-auditor/flow/`
  has no `init.md` (only main.md/page-freshness.md/tier1-overrides.md/tier1-probe.md) — the
  agent's `init.md` is one level up (`docs/agents/system-auditor/init.md`). Row's file citation
  is accurate read that way; no phantom-file confusion in the row itself.
- main.md + tier1-probe.md: already fully disambiguated by a prior sprint
  (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED, 2026-07-29) — names
  `docs/data/DASHBOARD.md` as the live target, explicitly forbids `docs/handoffs/DASHBOARD.md`
  (confirmed still exists, 650B, untouched since 2026-07-20 — the real phantom). No edit needed
  there for the phantom-path class.
- init.md was NOT touched by that prior sprint: fixed 3 residual bare "DASHBOARD.md" mentions
  (skills bullet, forbidden_outputs, flow.catalog output) to name `docs/data/DASHBOARD.md` +
  `scripts/emit-dashboard-row.sh`. The forbidden_outputs one had been internally contradicting
  this same file's own not_my_job routing statement (findings → `.signal_queue`, not DASHBOARD.md).
- main.md RETURN block `NEXT: po (via DASHBOARD.md)` was a genuine phantom-PROTOCOL claim (not
  just a stale path) — grepped every po flow file, zero reads DASHBOARD.md. Fixed to
  `po (via orch-state.json .signal_queue row)` per this file's own inter_agent contract.
- SKILL.md (`.claude/skills/signal-dashboard/SKILL.md`) hot-path "Write protocol" line cited a
  stale pre-orch-apply.sh brief (bare temp-then-rename), contradicting its own CONCURRENT WRITERS
  CAS-guard mandate 2 sections below + `dashboard-protocol.md`'s already-correct WRITE step 4.
  Fixed to name `scripts/orch-apply.sh` directly. Left the same-class stale line in
  `dashboard-protocol.md`'s own preamble (L12) untouched — out of the task's explicit
  SKILL.md-only scope; flagged for follow-up, not silently dropped.
- DID NOT flip the board row BACKLOG→REVIEW or touch `orch-state.json` at all — own init.md
  `commit_zone` excludes it from agent-father commits except a signal-queue DONE-mark, and this
  dispatch (direct po manual-dispatch board row) has no linked signal_queue row. Deferred to
  router/po; RETURN block carries the exact `orch-apply.sh` jq transform for the lane move.

## Fix (dev-team S4 UNBLOCK dispatch) 2026-07-31T05:35:00Z FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
- Implemented `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md` §3/§4
  verbatim, two files, zero prod code: `docs/agents/po/flow/triage-signals.md` `ci_red` row
  (mandatory FAILEDFILE pre-dedup read AC-1, FILE-scoped `dedup_key` primary key AC-2,
  anti-amnesty fence vs `FIX-MCP-SUITE-HEALTH-BASELINE` AC-3, 0-fail backstop AC-4) and
  `docs/agents/dev-team/flow/ci-health-probe.md` (Hard Constraint #2 layer-c text + Step CI-3
  clarifying NOTE, doc-accuracy only — CANON-SCRIPT `ci-health-probe.js` untouched).
- Used byte-exact line-indexed extraction (python, scratch-only) rather than manual retype —
  the brief's replacement text is a very long single-line prose row with em-dashes/curly quotes;
  programmatically verified `git diff` matches the brief's own text byte-for-byte on all 3 edits.
- `size-lint` gate check: `ci-health-probe.md` grew 157L→163L; header still declares 157L but
  file is baseline-grandfathered with +/-10%/min-5L tolerance (172.7L upper bound) — PASS, no
  header update needed (brief itself flagged "no line-count budget concern").
- AC-5 retro-sweep note (already closed by po this cycle) re-checked live, not re-derived: a
  NEW ci_red fired since ratification (run 30606511365, frontend-eslint + size-lint failures)
  but that's a SEPARATE already-tracked pair of rows (FIX-CI-FRONTEND-ESLINT-BUNLOCK-*,
  FIX-CI-SIZELINT-MACRO-VMT-*), not a regression of the 3 files AC-5 covers — evidence stands.
- Board row was already ratified (po_goahead stamped, plan_only:false) and left in review[]
  deliberately per dispatch note (agent-father off DRS allowlist). Flipped next_agent
  agent-father→qa in place (no lane-move — status stays REVIEW, only next_agent changed) per
  repo precedent (`FIX-SWEEPGUARD-*`/`2026-07-13-FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE`: even
  pure flow-doc/bash fixes route through qa's RAW clause-content read, not self-closed by
  the implementer).
