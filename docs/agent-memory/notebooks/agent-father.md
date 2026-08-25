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

## Keep (maintenance) 2026-08-25T13:01Z — scheduled cron tick, zero escalations

- Trigger: scheduled (`cron-agent-father` tick, orphan+roster sweep). Pre-Check gate (`git diff
  --name-only HEAD~3..HEAD` at cycle start, commits `c3f3901b8`/`7cc234af9`/`7a0404657`) touched
  zero `.claude/agents/*.md`/`docs/agents/*/flow/*.md` → Steps 1-2 (orphan+roster scan) SKIPPED
  per CADRAT-3 routing (empty scan-orphans output by construction, not a probe failure — router's
  own `task_list_held(kind="orphan-signal")` also returned 0 at gate time). Steps 3-5
  (sweep-fixes) + 5b (team-tool-recheck) ran unconditionally.
- **Scanned:** 41 real agent init.md cards (47 `docs/agents/*/` dirs minus `shared`/`tools`
  non-agent dirs, minus `semble-search` — pointer doc, no `agent:` YAML root — minus 3
  structurally-INIT-MISSING dirs `cowork-team`/`dev-news-fetch`/`dev-team`, unchanged from the
  2026-08-23T14:23Z baseline count).
- **Checks #1 (fail-loud-protocol) / #2 (Error Boundary, one-hop+dispatch-table resolved, run
  live not assumed) / #3 (boundary_rules) / #4 (flow.default path resolves) / #6
  (debug-logger-protocol):** 41/41 PASS, all five.
- **Check #5 (version staleness, >90d):** 1 FAIL — `market-analyst` pinned `"2026-05-25"` (92d
  stale). Auto-fixed: bumped to `"2026-08-25"` (Step 4 table: mechanical, no manual authoring
  implied).
- **Step 5b (team-tool-recheck):** zero drift vs the 2026-08-23T14:23Z report (2-day gap in the
  daily cadence — first re-run since). Same 6 CRITICAL (Bash-present-by-construction) findings,
  same honestly-qualified descriptions, positive control (alert-commander) held. Mechanical
  enforcement still 0/0. Report: `docs/agent-memory/health/team-tool-recheck-2026-08-25-1259.md`.
- **Stale notebooks (Step 5, informational only):** 11/47 not committed in >30d (oldest 3 tied at
  115d: `idea-forge.md`/`market-analyst.md`/`semble-search.md`).
- **Escalations: 0. Orphans: N/A (Steps 1-2 gated off this cycle).**
- Self-pruned this notebook (176L, 6 sections after this write's own append → 3 retained, 3
  oldest split verbatim to `archive/agent-father-archive-20260825.md`) before landing, per AC-2's
  always-3 steady state.
- **Lesson:** none new — a clean, low-signal sweep confirms the fleet stayed guide-compliant
  across the 2-day cadence gap; the only drift found was ordinary version staleness on one agent,
  caught and fixed mechanically by the check that exists for exactly this.

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
