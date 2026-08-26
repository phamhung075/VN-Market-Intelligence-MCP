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

<!-- Entries 2026-08-23T15:25Z (TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY), 2026-08-23T16:05Z
     (2 mid-task P0s from PO's CI-red triage), and 2026-08-24T13:35Z
     (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260825.md on 2026-08-25
     (AC-2 retention: current cycle + 2 prior = 3 sections ALWAYS; this Keep/maintenance
     write pushed the count to 6). Nothing deleted; full record in the archive file and git
     history. Same convention as the prior splits noted above. -->

<!-- Entry 2026-08-25T03:05Z (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260825.md on 2026-08-25,
     second prune of the same day: this cycle's own append put the file at 159L/12835B,
     over the 12000B byte cap (200L * 60B, same derivation context-bloat-backstop.sh uses).
     AC-2 retention (current cycle + 2 prior) preserved. Nothing deleted; full record in the
     archive file and git history. -->

<!-- Entry 2026-08-25T13:01Z (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260826.md on 2026-08-26
     (AC-2 retention: current cycle + 2 prior = 3 sections ALWAYS; this Keep/maintenance
     write pushed the count to 4). Nothing deleted; full record in the archive file and git
     history. Same convention as the prior splits noted above. -->

## FIX 2026-08-26T03:10Z — FIX-PO-TRIAGE-SIGNALS-AGENT-FLOW-DEFECT-TYPE-UNROUTED (P0, router hand-dispatch, off DRS allowlist)

Added 5 signal-type routing rows to docs/agents/po/flow/triage-signals.md: Pipeline-A `flow-defect`/`flow_defect`
alias, Pipeline-A bridge for `detector_defect`/`audit_finding`/`preserved_bug_no_tracking_row`/`tooling_defect`,
Pipeline-B rows for the same 4. Fixed AC-3 circular to==po self-loop in the any-unknown-type fallback.

Scope widened mid-task: router surfaced a live `detector_defect` (to=architect) envelope proving the
Pipeline-A-bridge gap was real, not hypothetical — the guard genuinely scans BOTH planes (its own
historical self-filed gap rows for flow_defect/auditor_cycle_missing/signal_feedback prove it), so
PO's "guard scans only one plane" hypothesis is FALSE. Real gaps: (a) Pipeline-A/B rule sets are
deliberately disjoint, any type needs a bridge row on both if it can arrive via either; (b) CI only
ever inspects a git-committed snapshot, and Pipeline-A's pending_triage_inbox self-drains before
commit, so CI structurally almost never observes a live Pipeline-A-only miss.

Verified via a scratchpad COPY of orch-state.json (never live — guard mints a row on `--check` too):
BEFORE/AFTER both reproduced for the real detector_defect live occurrence + a synthetic flow-defect
pair. Closed 2 now-stale self-filed `signal-type-registry-gap:*` rows this fix directly resolves;
filed a new P2 finding (FIX-GUARD-SIGNAL-TYPE-COVERAGE-PIPELINEA-CI-BLIND-AND-BROAD-BRIDGE-GAP,
owner=developer) for the CI-blind mechanism and ~13 other unrelated stale gap rows found on the board.
drain-signals.md §0a-3 out of scope — its routing column is informational-only by its own text.

Commits: 579e7c685 (triage-signals.md), 0bac54347 (orch-state.json terminal-flip). Row -> review[].

## Keep (maintenance) 2026-08-26T12:57Z — scheduled cron tick, zero escalations

- Trigger: scheduled (`cron-agent-father` tick, coordination param `cron-daily-sweep`). Pre-Check
  gate (`git diff --name-only HEAD~3..HEAD` at cycle start, commits touching
  `docs/data/orch/archive/2026-08.json` / `docs/data/orch/orch-state.json` /
  `docs/signals/processed/...`) touched zero `.claude/agents/*.md`/`docs/agents/*/flow/*.md` →
  Steps 1-2 (orphan+roster scan) SKIPPED per CADRAT-3 routing. Steps 3-5 (sweep-fixes) + 5b
  (team-tool-recheck) ran unconditionally.
- **Scanned:** 41 real agent init.md cards (same scope baseline as 08-25 — 47 dirs minus
  `shared`/`tools`, minus `semble-search` pointer doc, minus 3 structurally-init-missing dirs
  `cowork-team`/`dev-news-fetch`/`dev-team`).
- **Checks #1 (fail-loud-protocol) / #2 (Error Boundary, one-hop+dispatch-table resolved, run
  live) / #3 (boundary_rules) / #4 (flow.default path resolves) / #5 (version staleness >90d) /
  #6 (debug-logger-protocol):** 41/41 PASS, all six — zero auto-fixes needed this cycle
  (`bctc-analyst` closest to the staleness threshold at 89d, still under 90d).
- **Step 5b (team-tool-recheck):** zero drift vs the 2026-08-25T12:59Z report — daily cadence
  held (1-day gap this time, not 2). Same 6 CRITICAL findings, same honestly-qualified
  descriptions, positive control (alert-commander) held, mechanical enforcement still 0/0.
  Report: `docs/agent-memory/health/team-tool-recheck-2026-08-26-1257.md` (commit `ffc3951b3`).
- **Stale notebooks (Step 5, informational only):** 11/47 not committed in >30d (oldest 3 tied at
  115d: `idea-forge.md`/`market-analyst.md`/`semble-search.md`) — unchanged count and identity
  from 08-25.
- **Escalations: 0. Orphans: N/A (Steps 1-2 gated off this cycle).**
- Self-pruned this notebook (oldest section split verbatim to
  `archive/agent-father-archive-20260826.md`) before landing, per AC-2's always-3 steady state.
- **Lesson:** none new — second consecutive clean sweep; zero drift on both the Top-6 checks and
  the tool-grant recheck.

## Task-dispatch 2026-08-26T13:20Z — TASK-COWORK-CATCHUP-10, CANCELLED (true dup mis-ID'd)

- Router dispatched this P0 row despite PO's do-not-dispatch note, after both blocking conditions
  (TASK-COWORK-CATCHUP-9 done_verified; PO's named alt-target DONE_VERIFIED) fired.
- PO's note named TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY as the duplicate. Disk check: that row's
  own AC-3/status_note (agent-father, 2026-08-23T16:20Z) says it explicitly did NOT ship
  `docs/protocols/cowork-master-cron-runbook.md` — outside agent-father commit_zone — and split that
  scope into `FIX-COWORK-RUNBOOK-DOC-STALE-LAUNCHD-BACKSTOP-STATUS` (po, 2026-08-23T15:27Z, owner
  developer, still BACKLOG). That backlog row, not DOC-TRUTH-LAYER-INVENTORY, is the real duplicate.
- Confirmed the residual is genuine, not a phantom: runbook SS1/5/8-T5 still call
  F1-LAUNCHD-COWORK-BACKSTOP "in flight"/T5 "NOT YET APPLICABLE"; that row is DONE_VERIFIED and its
  launchd firer is loaded+running live today (`launchctl list` on this host: LastExitStatus=0). Also
  independently re-checked the RemoteTrigger/"Layer A" language the router flagged as a prior sore
  spot — all 9 mentions already correctly marked RETIRED (07-07 freshen), nothing stale there.
- Verdict: outcome 3 (premise different from either offered outcome) — genuine duplicate, but of the
  backlog row, not the one PO named, AND agent-father structurally cannot own the fix (file outside
  commit_zone) even if it were not a duplicate. Zero runbook edits made.
- Action: CANCELLED (do_not_reopen) via `jq | scripts/orch-apply.sh`, cross-linked the surviving
  backlog row, reset `.head` to idle, corrected PO's status_note in place (see full note on the
  archived row). Commit `838f67349`.
- Lesson: a status_note asserting "X will absorb this" should be re-verified against X's OWN
  completion note once X actually closes — a forward-looking dup guess can be falsified by the
  cited row's real AC outcome, and the correct successor may be a THIRD row minted afterward, not
  the one originally named.

## Task-dispatch 2026-08-26T20:04Z — Behavioral-Verification Gate (deploy-aware ordering), 6/7 files landed

- Built `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md`
  §9's in-zone files, live and enforcing: `po/flow/main.md` + `ba/flow/main.md` (mint-side
  `verification.behavior_predicate`, commit `ee158a9ea`), then `qa/flow/main.md` (Direct-Commit
  Verify CHANGES_REQUESTED gate) + `ops/flow/docker.md` (Behavioral-Predicate Probe loop, writes
  `verification.behavior_probe`, reopens `match:false` to `review[]`) + `orch-sentinel` OH-2.4
  (FULL+LITE) (commit `900d640ad`). Mint-side landed strictly first — the CUTOFF constant
  (`2026-08-26T19:57:54Z`) is that commit's own landing time, read back via `git show -s
  --format=%cI`, so the gates can never reject a row minted before the field existed (the
  router-flagged ordering hazard the brief itself didn't cover).
- `orchStateSchema.ts` `checkVerificationGate()` (§5c, the actual hard-reject) is `apps/` — filed a
  precise patch-spec signal for dev-mcp-server (`docs/signals/2026-08-26-fix-...schema-handoff-...json`,
  commit `0bf6a073c`) instead of editing it. Until that lands, nothing MECHANICALLY blocks a
  DONE_VERIFIED flip missing `behavior_predicate` — only the qa flow-doc conditional (agent-honored,
  not code-enforced) does.
- §9's handoff table named the wrong file for the OH-STATE counter
  (`docs/agent-memory/modules/tool-usage-stats.json` has no OH-STATE key at all) — corrected in the
  signal + built the counter in the real writer, `emit-scorecard.md`.
- Live board `priority` field is a mixed P0-P3/high-low convention (measured: 61 P0, 317 P1, 82
  'high', 1 'HIGH', plus P2/P3/low/medium/normal/med) — flagged explicitly in the schema handoff so
  the P0/P1 hard-reject condition doesn't silently under-scope to only the P-tier rows.

## EDIT 2026-08-26T20:28Z — task FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW, router-dispatched (QA rework return)
- Change: corrected 3 false-claim prose instances in docs/agents/dev-team/flow/main.md asserting INCIDENT_CAP sits outside/never competes with the shared WIP<=2 slot -- wip_in_progress (scripts/lib/devteam-eligibility.jq) has no claimed_by filter and DOES count incident rows, a deliberate asymmetry already documented in that jq file (L153-157), not an oversight. Description-only fix, jq untouched (out of scope per QA remediation instruction).
- Files modified: 1 (docs/agents/dev-team/flow/main.md, commit f44e4bc04)
- Cascade: none
- Validation: 3/3 false-claim instances found and corrected (QA cited 2 by stale line number; swept for a 3rd per dispatch instruction and found one at the ILC UNCONDITIONAL paragraph, not previously flagged)
- Decision: re-worded to match scripts/lib/devteam-eligibility.jq own documented wording verbatim, per dispatch instruction not to invent new prose. Board: manually moved row review[] -> qa[] (status REVIEW -> QA, next_agent -> qa, commit stamped to f44e4bc04) via jq | scripts/orch-apply.sh -- NOT via the automated devteam-review-claim-qa-drain.jq script (this was a direct router-dispatched write, not a dev-team tick), so its BGFAN-1 claimed_at-correlated auto-dispatch will not discover this entry; flagged in the row status_note that a router hand-dispatch of qa (verify-committed mode) is the next required action. .head deliberately left byte-identical (confirmed via diff) -- this write path never touches it. orch-state.json NOT committed by this agent (router-owned file per commit_zone.excluded note in .claude/agents/agent-father.md).
