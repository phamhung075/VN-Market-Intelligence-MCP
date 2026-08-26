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

## FIX 2026-08-25T19:55Z — FIX-SIGNAL-TYPE-ROUTING-GAP-notebook-undroppable-remainder-over-cap-breach (P1, router hand-dispatch, off DRS allowlist)

Added ONE row to the Pipeline-A routing table in `docs/agents/po/flow/triage-signals.md` for
`notebook_undroppable_remainder_over_cap_breach` (28 -> 29 types parsed by
`scripts/audits/guard-signal-type-coverage.sh`). Disposition was pre-adjudicated by PO
(`triage-20260825T1700Z`): dedup NON-TERMINAL LANES on `payload.file` -> FOLD, else mint a
`backlog[]` CHORE `owner: claude-manager-helper`, `zone: docs/agent-memory/notebooks/`. Committed
with the journal; no board write (orch-state.json outside commit_zone, FU-AGENT-FATHER-ORCH-SCOPE).

**LESSON 1 — which SIDE of an open-vs-closed namespace defect you are on is a READ, not a guess.**
This row's class has been redispatched 4x. Signal `type` is an OPEN namespace on the EMIT side
(`SignalRowSchema.type: z.string().optional()`) and a CLOSED, table-derived allowlist on the
CONSUME side. The 2026-08-23 architect brief already MEASURED and REJECTED constraining the emit
side: `orch-apply.sh` Stage 1 validates the whole candidate document all-or-nothing, so a
`z.enum()` on `type` upgrades "one signal misrouted" into "this entire write rejected", fleet-wide.
So the only correct move on an auto-filed `FIX-SIGNAL-TYPE-ROUTING-GAP-*` row is a CONSUME-side
table row. Say which side you are on before writing — the structural answer to the open namespace
itself belongs to `FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE` (architect), not
to these one-row rows, and promoting them one at a time is not the fix.

**LESSON 2 — the AC named a script that MUTATES state; running it verbatim would have been the
defect.** `guard-signal-type-coverage.sh --check` reads as a dry-run and is not one: `--check` is an
explicitly-ignored no-op flag, and on any unrouted type the script mints `backlog[]` rows through
`orch-apply.sh`. Proven, not assumed — the full-live-state run, redirected onto a COPY, minted 4 NEW
rows (`audit_finding`, `data_stale`, `detector_defect`, `tooling_defect`) that dedup did not cover.
Against the live file that would have been 4 unsanctioned board writes from an agent whose
commit_zone excludes orch-state.json entirely. Use `ORCH_APPLY_LIVE_FILE_OVERRIDE` /
`GUARD_SIGNAL_*_DOC_OVERRIDE` + a fixture path, and checksum the live file before and after.

**LESSON 3 — a coverage-guard AC can go VACUOUS between filing and dispatch.** The guard derives its
live-type set ONLY from `.dev_team_idle_chain.pending_triage_inbox[]`. PO's 18:15Z tick folded and
CLEARED every envelope of this type, so by dispatch time the guard could not name the type either
way — a bare re-run would have "passed" for the wrong reason. The honest proof is a paired control
on the REAL script with only the doc varying: pre-fix doc -> `FAIL ["notebook_undroppable_remainder_
over_cap_breach"]` exit 1; post-fix doc -> `PASS — Pipeline A: 1 live type(s) routed (29 known)`
exit 0. When an AC's oracle reads live state, pin that state in a fixture or the AC proves nothing.

**LESSON 4 — a keepalive that renews on a lock's own peer-held presence must feed an INDEPENDENT
counter, or "renewed" and "stranded" become indistinguishable.** faf84a6f6 renewed `resume_key` on
`claimed:false` forever without ever advancing `.head.resume_attempts` (that counter incremented only
on the success branch) — so a dead-but-once-committed specialist (satisfying WF-4's own `Task:
<TASK-SLUG>` git-log grep, taking its "S2's outer_claim peer-held check is the safety net" branch)
stayed permanently stranded: the safety net it named had itself become the thing renewing forever.
Fix (ecb825731): increment `.head.resume_attempts` on the RENEW branch too, sourced from OUTSIDE the
coordination.db lock it renews, so WF-3's pre-existing 3-attempt bound stays reachable. Bound the
counter at the site that RE-EVALUATES the same lock every tick (S2's dispatcher-wrap, keyed on
`.head.active_task_id`) — not at a sibling call site (ILC) whose peer-held branch is structurally
reachable at most once per row and therefore has no repeating loop to bound in the first place. Proof
must be EXECUTED against the real threshold check, not read off control flow: a scratch-fixture jq
run 3x + a real `git log --grep` against this repo's own history (finding faf84a6f6's own `Task:`
trailer) is what actually distinguishes "the bound fires" from "the code looks like it would."

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
