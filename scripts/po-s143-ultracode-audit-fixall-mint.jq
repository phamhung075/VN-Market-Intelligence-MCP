# =============================================================================
# scripts/po-s143-ultracode-audit-fixall-mint.jq
# =============================================================================
# Bulk-mint the user "fix all" directive on the 2026-07-12 ultracode workflow
# audit (docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md).
#
# Mints (into .task_board.backlog, status=BACKLOG, NEVER promoted to ready[]):
#   - 16 CONFIRMED proposals  (UC-<DOMAIN>-Pn)        [dev-team-loop-P3 is NOT
#     minted — it ships the already-filed FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP
#     row, which is annotated instead]
#   - 22 RESCOPE proposals scoped per each verifier Rescope note (read detail_ref)
#     [router-P3 is NOT minted — folds into FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD]
#   -  8 UNVERIFIED per-domain PLAN-ONLY batch umbrellas (58 proposals total)
#   -  3 completeness-critic PLAN-ONLY investigation rows (2 high-risk + 1 batch)
#
# Also ANNOTATES existing backlog rows (marker-guarded .audit_ref):
#   FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD, FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP,
#   TE-T05, TE-T11, TE-T33, FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE,
#   FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE, SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE.
#
# IDEMPOTENT: new rows id-guarded across ALL board lanes; annotations guarded on
#   (has("audit_ref")|not). Re-run mints 0 / annotates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s140-ultracode-audit-fixall-mint.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# =============================================================================

def brief: "docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md";
def ref($a): brief + "#" + $a;

# row(id; anchor; type; title; priority; size; zone; verdict; note; extra)
def row($id; $a; $type; $title; $pri; $size; $zone; $verdict; $note; $extra):
  ({ id: $id, type: $type, title: $title, status: "BACKLOG",
     priority: $pri, size: $size, zone: $zone,
     sprint: "ULTRACODE-AUDIT-FIXALL",
     source: "ultracode-audit-2026-07-12",
     verdict: $verdict,
     detail_ref: ref($a),
     note: $note, created_at: $now, created_by: "po" } + $extra);

# --- existing ids across ALL board lanes (dedup guard) ---
( [ .task_board
    | ( .backlog, .ready, .in_progress, .review, .qa, .done, .done_verified ) // []
    | .[]? | if type=="object" then .id else . end ]
  | map(select(. != null)) ) as $existing
|
# ============================ NEW ROWS =======================================
( [
  # ---------- CONFIRMED (16) ----------
  row("UC-RDL-P1";"router-dispatch-locking-P1";"FIX";
      "Align router outer-wrap lock namespace to the live 'task:' prefix";
      "P0";"S";"cross-service/";"CONFIRMED";
      "CRITICAL/S — SEQUENCE LEAD. CLAUDE.md/dispatch outer-wrap claims a lock prefix that diverges from the live 'task:' namespace the store actually uses, so the mutex does not mutex. Align the wrap prefix to 'task:'.";
      {}),
  row("UC-RDL-P5";"router-dispatch-locking-P5";"CLEAN";
      "Shrink CLAUDE.md step 2.5 to a pointer + 3-outcome table incl the missing re-entrant branch";
      "P1";"S";"cross-service/";"CONFIRMED";
      "Step 2.5 PRE-CLAIM prose is bloated and omits the re-entrant (same-session) outcome branch. Replace with a pointer to dispatch-claim SKILL + a 3-outcome table (claimed / peer-collision / re-entrant).";
      {}),
  row("UC-RDL-P4";"router-dispatch-locking-P4";"SPRINT-M";
      "Composite dispatch_preflight MCP tool: presence + orphan probe + roster + intent claim in ONE gateway call";
      "P1";"L";"apps/mcp-server/";"CONFIRMED";
      "Collapse the multi-call router preflight (Phase A/A.5/B) into one server-side dispatch_preflight tool to cut round-trips and race windows. Coordinate with UC-RDL-P1 (lock-prefix) landing first.";
      {next_agent:"ba"}),
  row("UC-DTL-P2";"dev-team-loop-P2";"FIX";
      "Move terminal-bloat eviction into the deterministic tick-preflight script (runs every tick, any exit path)";
      "P1";"M";"cross-service/";"CONFIRMED";
      "Eviction currently rides an exit path that is skipped on some ticks. Port it into the deterministic tick-preflight script so it runs regardless of how the tick exits.";
      {}),
  row("UC-CDC-P2";"cowork-dispatcher-cron-P2";"FIX";
      "Port the stderr-separation fix into cowork-guaranteed-slot-firer.sh";
      "P1";"S";"cross-service/";"CONFIRMED";
      "The guaranteed-slot firer mixes stderr into the JSON stdout the caller parses (same class already fixed elsewhere). Apply the stderr-separation redirect.";
      {}),
  row("UC-CDC-P3";"cowork-dispatcher-cron-P3";"FIX";
      "Add last_fired boundary dedup to the matcher legacy mode (one SSOT dedup for dispatcher, preflight, firer)";
      "P1";"S";"cross-service/";"CONFIRMED";
      "Legacy matcher mode lacks the last_fired boundary dedup the adaptive path has, so slots can double-fire. Add the same dedup; single SSOT across dispatcher/preflight/firer.";
      {}),
  row("UC-CCA-P3";"cowork-cycle-agents-P3";"SPRINT-S";
      "One published-marker-gate skill with mandatory release-on-no-publish; wire into the 6 copy-pasted marker gates";
      "P1";"M";"cross-service/";"CONFIRMED";
      "6 agents copy-paste a publish-marker task_claim gate; several leak the marker/lock when nothing is published. Build one skill with a mandatory release-on-no-publish clause and wire all 6 in.";
      {next_agent:"ba"}),
  row("UC-CCA-P5";"cowork-cycle-agents-P5";"FIX";
      "Fix news-scout exec-proof ordering: notebook settled-write BEFORE the gate, gate BEFORE log_agent_work(completed)+WORK ping";
      "P1";"S";"cross-service/";"CONFIRMED";
      "news-scout logs completion + pings WORK before its truth-gate and settled notebook write, so a failed gate still reports done. Reorder: notebook settled-write -> gate -> log_agent_work(completed)+WORK.";
      {}),
  row("UC-ASL-P2";"auditor-signal-loop-P2";"SPRINT-S";
      "One blessed emit script replaces the 6 copy-pasted EMIT SEQUENCE blocks + durable BUG-dedup ledger";
      "P1";"M";"cross-service/";"CONFIRMED";
      "Auditor has 6 divergent EMIT SEQUENCE copies and in-memory BUG dedup that resets per run. Extract one emit script (scripts/emit-audit-signal.sh) with a durable dedup ledger.";
      {next_agent:"ba"}),
  row("UC-ASL-P1";"auditor-signal-loop-P1";"FIX";
      "Fix the self-defeating T2/T3 auditor gate: gate on the PREVIOUS subagent heartbeat; move tier-2/3 heartbeat authorship into the subagent end-of-cycle";
      "P1";"S";"cross-service/";"CONFIRMED";
      "The tier-2/3 gate reads a heartbeat the same run just wrote, so it never blocks. Gate on the prior-cycle subagent heartbeat and author the heartbeat in the subagent end-of-cycle.";
      {}),
  row("UC-ASL-P6";"auditor-signal-loop-P6";"CLEAN";
      "Purge the DASHBOARD.md phantom protocol from the auditor flow; align SKILL.md hot-path write text with the orch-apply contract";
      "P1";"M";"cross-service/";"CONFIRMED";
      "auditor main.md/init.md/tier1-probe.md mandate a phantom docs/handoffs/DASHBOARD.md with no live consumer, and signal-dashboard SKILL teaches bare temp-then-rename contradicting orch-apply.sh. Purge phantom refs; align write text to orch-apply CAS.";
      {}),
  row("UC-SDF-P4";"state-data-files-P4";"FIX";
      "Close the legacy-file prune hole in drain-signals.js + one-time scripted purge of ~1,400 unstamped processed files";
      "P1";"M";"cross-service/";"CONFIRMED";
      "drain-signals.js prunes only stamped processed files, leaking ~1,400 unstamped ones. Extend the prune predicate and run a one-time scripted purge (script in scripts/, not /tmp).";
      {}),
  row("UC-SDF-P3";"state-data-files-P3";"CLEAN";
      "Delete NOTE_SIGNALS_DB_DRAIN.md (or rewrite as a 3-line pointer to the live drain)";
      "P2";"S";"cross-service/";"CONFIRMED";
      "Stale drain note contradicts the live drain. Delete it or reduce to a 3-line pointer.";
      {}),
  row("UC-SDF-P1";"state-data-files-P1";"FIX";
      "Add self-pruning to the tick-snapshot step + one-time sweep of the 80 stale tick-snapshot files";
      "P2";"S";"cross-service/";"CONFIRMED";
      "Cowork tick snapshots accrete unbounded (80 stale). Add self-prune to the snapshot step and one-time sweep.";
      {}),
  row("UC-GCP-P2";"git-ci-publish-P2";"FIX";
      "Untrack machine-written state (signals.db, runtime logs, test debris) + gitignore policy for the machine-state plane";
      "P1";"S";"cross-service/";"CONFIRMED";
      "signals.db + runtime logs + test debris are tracked and churn the tree every tick. git rm --cached (*.db already in .gitignore) + add the log/debris patterns, AND edit drain-signals.md MANDATORY-PERSIST-GUARD so the next drain does not try to `git add` the now-ignored signals.db (git refuses ignored paths -> exit1). COORDINATE with SYSREMAKE-P2 RC-GITSTATE (owns tool-usage-stats.json/coverage-state.json) so the two gitignore migrations do not collide; supersedes REJECTED state-data-files-P5.";
      {related:["SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE"]}),
  row("UC-GCP-P4";"git-ci-publish-P4";"FIX";
      "Path-filter the pre-push tsc hook: skip full tsc for pushes touching no code";
      "P1";"S";"cross-service/";"CONFIRMED";
      "Every push (even doc/notebook-only) pays a full tsc, stranding the fleet on unrelated red. Path-filter the pre-push hook: run tsc only when the push touches code paths.";
      {}),

  # ---------- RESCOPE (22 new rows; router-P3 folds into FIX-ORPHAN, annotated) ----------
  row("UC-RDL-P7";"router-dispatch-locking-P7";"SPRINT-M";
      "Reconcile branch policy across the FULL branch lifecycle with the main-only invariant (po-gated)";
      "P2";"M";"multi";"RESCOPE";
      "SCOPE=verifier Rescope note. STEP1 po ruling: keep or drop the worktree-branch exception. STEP2 single sprint edits developer+qa+microservice+fixer+pm+dev-team flows so the Developer->QA handoff never straddles two policies; put reconciled commit-policy text in ONE place. Do NOT edit only the branch-creation half (wedges QA merge).";
      {next_agent:"po", supervised:true, supervised_note:"STEP1 = po branch-exception ruling before any flow edits"}),
  row("UC-DTL-P9";"dev-team-loop-P9";"FIX";
      "Give pm an atomic closeout script (sprint-terminal-flip + guarded head-idle in ONE orch-apply transform)";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. New scripts/pm-closeout-head-idle.jq (--arg sprint_id/--arg now): set sprint status DONE in place (do NOT move to closed_sprints — cold-evict owns that), CONDITIONALLY idle .head only if head belongs to this sprint or is null (mirror ops-closegate-handoff.jq). Wire into pm flow Step 5 + self-verify.";
      {}),
  row("UC-CDC-P7";"cowork-dispatcher-cron-P7";"SPRINT-L";
      "Collapse the 12-file cowork flow to ~7 files; push per-tick logic into the deterministic script layer";
      "P2";"L";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note (corrected sequencing + I16 fix). Run Phase2 (script moves: match-slots 4.5/4.5c, tick-postflight last_fired batch) BEFORE the pressure-file merge (200L cap). I16: add an SSOT cowork_signal_recipient field to system-map.json, never derive from type==cowork (drops po+tran-ngoc-bau). COORDINATE with TE-T03 (main.md rewrite) + TE-T13 (line-1 purge) — sequence after or merge to avoid 3-way collision.";
      {depends:["TE-T03"], related:["TE-T13"]}),
  row("UC-CDC-P1";"cowork-dispatcher-cron-P1";"SPRINT-M";
      "Compute calendar_status server-side in emit_pressure_state (break the circular 'unknown') + unblock adaptive path";
      "P2";"M";"multi";"RESCOPE";
      "SCOPE=verifier Rescope note. Compute calendar_status via vnTradingCalendar isVnTradingDay().session_status (no getSessionStatus export); enum-gate caller override; stop preflight recycling the file value; DELETE the telemetry Step6.0 arg line. REQUIRED: decouple stale_warning from cycle-snapshot promotion refusal or both engines stay in legacy off-hours. Follow-up: resolve flow-vs-matcher weekend divergence in ONE SSOT.";
      {next_agent:"ba"}),
  row("UC-CDC-P5";"cowork-dispatcher-cron-P5";"FIX";
      "Make cowork/detect-loop re-arm self-healing without regressing TE-T01 or duplicating cron hosts";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. PREPEND (do not replace) a self-arm line to cron-cowork-team SKILL Step2; split SKILL into slim SKILL.md + lazy register.md (mirror cron-detect-loop). Add a SessionStart hook that is PRESENCE-GATED (check session-presence roster; arm only if no live peer host — pick ONE owner).";
      {related:["TE-T01"]}),
  row("UC-CDC-P4";"cowork-dispatcher-cron-P4";"FIX";
      "Headroom-gated fan-out cap in spawn-fanout.md Step 5 (bounded batcher, thresholds in cadence-policy.json)";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Replace unbounded fan-out with a bounded batcher: thresholds in cadence-policy.json _fanout (no hardcode); gate on host_headroom_mb + load/core; batch semantics (fire batch as one block, wait for completions or re-probe, hard cap batch_wait_max_seconds); guaranteed slots fill batch1. Add carve-out to agent-chaining-protocol Background Spawn Mandate.";
      {}),
  row("UC-CCA-P1-GWBLIND-DEDUP";"cowork-cycle-agents-P1";"CLEAN";
      "Dedup the duplicated GATEWAY-BLIND block: step-0-cowork points at cycle-bootstrap SSOT (rider on TE-T11)";
      "P2";"S";".claude/skills/";"RESCOPE";
      "SCOPE=verifier Rescope note. Drop original part (b) flow-rewiring (owned by queued TE-T11, broader 11-flow list). Keep part (a): delete step-0-cowork SKILL lines 53-88 duplicated GATEWAY-BLIND guard, replace with <=4-line stub pointing at cycle-bootstrap Error handling SSOT; amend TE-T11 DoD text (composite POINTERS to SSOT, not embeds). Do NOT create a parallel rewiring task.";
      {depends:["TE-T11"], related:["FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK"]}),
  row("UC-CCA-P2";"cowork-cycle-agents-P2";"SPRINT-S";
      "Absorb the DMS-2 sibling-corroboration probe into gateway-availability-gate; de-dup market-watcher double probe; extend to 5 flows";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Upgrade gateway-availability-gate SKILL with the DMS-2 escalation ladder (CONFIRMED-BLIND skip-backoff, sibling-recent suppression) keeping its correct confirmed-down actions (Write signal+BLOCKED notebook, NEVER send_telegram). Dedup market-watcher inline block; extend the gate to alert-commander/unified-agent/digest-predict/bctc-analyst/fb-market-poster. Coordinate with sibling P1 on cycle.md.";
      {next_agent:"ba"}),
  row("UC-CCA-P6-NBWRITE";"cowork-cycle-agents-P6";"FIX";
      "Single notebook-write path: remove the 4 inline AC-3 copies + resolve the fb OVERWRITE/APPEND contradiction (Piece 1)";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note PIECE 1 (not covered by any queued row). Replace 4 inline AC-3 compose blocks (news-scout, chef, bctc, daily-predict) with the notebook-write skill pointer + a <=10L per-agent template; fix fb-market-poster main.md OVERWRITE->APPEND-class (stops wiping its permanent Lessons section). PIECE 2 (no-op rule, skip-parenthetical deletion, fb cowork-end-cycle) folds into queued TE-T05 (see TE-T05 audit_ref).";
      {related:["TE-T05"]}),
  row("UC-CCA-P4";"cowork-cycle-agents-P4";"FIX";
      "Close the claim-truth-gate coverage gaps on all ungated MARKET/public publishers (claim-truth only)";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Add claim-truth-gate (CCATO) pointer steps to fb weekly-recap + weekly-prediction and digest-predict weekly/daily/monthly before their market sends. Do NOT touch data-integrity gates (already present). All agents already in claim-tool-map.json.";
      {}),
  row("UC-ASL-P3";"auditor-signal-loop-P3";"SPRINT-S";
      "Freeze Tier-2/3 auditor predicates into scripts/auditor-db-checks.sh (extend db-integrity-counts.sh discipline)";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. New scripts/auditor-db-checks.sh mirroring db-integrity-counts.sh DISCIPLINE ONLY (NOT its WAL-blind immutable open — use docker exec bun {readonly:true}). Embed C-01..C-16 / B-05 gate / B-09 / B-13 SQL; fold in (do not copy) the two queued predicate corrections and REPOINT FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE + FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE at the script as SSOT. Must be standalone (P2 emit-script is a dependency only if it lands).";
      {next_agent:"ba", related:["FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE","FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE"]}),
  row("UC-ASL-P5";"auditor-signal-loop-P5";"FIX";
      "Canonicalize signal types and statuses (Tier-1 type fix, register live type set, replace 'mark DONE', tighten status enum)";
      "P2";"S";"multi";"RESCOPE";
      "SCOPE=verifier Rescope note. (1) tier1-probe row type signal_feedback->microservice_degraded (row type only; leave post_agent_signal signal_type frozen). (2) signal-dashboard SKILL add live types. (3) triage-signals 'mark DONE'->RESOLVED with no-row guard, SHOULD->MUST stamp. (5) CORRECTED enum = NEW/READ/TRIAGED/RESOLVED/SUPERSEDED/ACUTE-RESOLVED-ROOT-TRACKED (omitting TRIAGED/ACUTE would wedge orch writes); precondition = hot-file assertion, not cold-evict pass. Schema change needs mcp-server rebuild -> delegate swap to ops.";
      {supervised_note:"schema edit -> ops-gated container rebuild"}),
  row("UC-MDH-P1";"memory-docs-hygiene-P1";"FIX";
      "Sandbox the 1300b memory-tools test (registration-time env injection) + purge its accumulated pollution";
      "P1";"S";"apps/mcp-server/";"RESCOPE";
      "SCOPE=verifier Rescope note. Inject AGENT_MEMORY_ROOT at registration-time (agentMemoryUpdateTools.ts:189) NOT module-level (module-level const binds at import -> false-green no-op). beforeEach mkdtemp + set env BEFORE register; afterEach rm + delete env; add a regression assert (no new sessions/ file). Purge pollution BY MD5 CLASS (93 byte-identical stubs today, re-enumerate) + 3 test-artifact files. bun test twice + pnpm check. Test-only behavior; prod unchanged but ships in mcp-server -> ops-gated swap.";
      {}),
  row("UC-MDH-P2";"memory-docs-hygiene-P2";"SPRINT-S";
      "Remove the dead append-session-record skill AND its MCP tool, with full consumer sweep + TE-T05 de-confliction";
      "P2";"M";"multi";"RESCOPE";
      "SCOPE=verifier Rescope note. FALSE-PREMISE corrected: 9+ live doc consumers still instruct agents to CALL the tool (digest-predict is cron-armed) — sweep AGENT_STARTUP/INDEX/README/digest-predict/market-analyst/tools-list/briefings before deregistering. De-conflict TE-T05 (drop its append-session-record deletion clause via orch-apply, see TE-T05 audit_ref). Regenerate tool-registry.json (3-way count sync). Fix 1300b test root cause too. Bulk stub cleanup via scripts/.";
      {next_agent:"ba", related:["TE-T05"]}),
  row("UC-MDH-P3";"memory-docs-hygiene-P3";"FIX";
      "Add scripts/agents-flow/memory-prune-sweep.sh wired into code-janitor (sessions >14d, dead health rechecks, legacy session-logs, root debris)";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. File-ops ONLY (no orch-state access): archive sessions/*.md >14d (only *.md, keep archive/ + *.log writers), delete team-tool-recheck >30d + write ONE idempotent payload routed to PO for the RemoteTrigger-dead recheck decision, fold session-logs/ into archive, move scheduled-task-execution files. FLOW step (not script) appends the signal_queue row via signal-dashboard SKILL. Commit explicit old+new paths.";
      {}),
  row("UC-MDH-P4";"memory-docs-hygiene-P4";"FIX";
      "Implement the promised sprint-journal archival in pm task-archive (scripts/agents-flow/decision-journal-archive.sh)";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. New decision-journal-archive.sh: derive sprint id by LONGEST match against closed+active union (never bare prefix glob — closed prefixes match active journals); move only closed-and-not-active journals to docs/archive/decisions via git mv; ~89 no-record journals left + reported for PO disposition. pm task-archive.md ONE pointer step after Step5; extend Step6 git add pathspec old+new. COORDINATE TE-T33 (its decisions/ leg is superseded — mtime>30d must NOT touch decisions/, see TE-T33 audit_ref).";
      {related:["TE-T33"]}),
  row("UC-SDF-P6";"state-data-files-P6";"FIX";
      "Collapse the scheduler-count triplication: generate cron-registry.json (tool-registry precedent) + repoint consumers";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. New scripts/gen-cron-registry.ts enumerating jobs from schedulerJobTable.ts + summaryJobs.ts cross-checked vs CRONS keys (NOT cronConfig scheduleCron sites — none exist); writes cron-registry.json#jobs+schedulerFileCount atomically + surgical-patches system-map crons (never full-doc overwrite). Re-baseline the 66-entry lists to code-derived count. Update pipeline-watchdog test to structural assert; keep schedulerFileCount for dailyDashboardJob; fix gen-project-stats stale probe; auditor verifies generated-vs-code.";
      {next_agent:"ba"}),
  row("UC-SDF-P2";"state-data-files-P2";"SPIKE";
      "Diagnose: cycle-snapshot-latest.json promotion silently dead since 2026-07-07 while ticks ran; add market-hours staleness tripwire";
      "P2";"M";"multi";"RESCOPE";
      "SCOPE=verifier Rescope note — PLAN-ONLY (anomaly->BACKLOG invariant). INVESTIGATE (mcp-server): why emit_pressure_state returns success + stale_warning:false while latest.json is 6d old (fresh HH:MM snapshots exist). HARDEN telemetry.md Step6.0 (~10L): compare mtimes, gate on calendar_status!=closed, write cowork-error-boundary signal when latest.json did not advance. EXCLUDE the already-answered 'Step 4.7 stopped 07-07' leg (gateway-blind zero-slot ticks; queued under FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK).";
      {plan_only:true, mode:"spike", timebox:120, next_agent:"ba", related:["FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK"]}),
  row("UC-GCP-P1";"git-ci-publish-P1";"CLEAN";
      "Consolidate the 4 commit-convention docs into ONE SSOT documenting the format actually in use + reconcile audit script + tree-map";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Rewrite docs/policies/commit-convention.md as single SSOT (slug task IDs, decide type vocab incl incident/role types), CARRY FORWARD the live heredoc `git commit -m`-only/never-`-a` rule (c47 root cause, merge-gate Control4). Delete the 3 sibling docs. Grep BOTH 'commit-convention.md §' AND path-only refs (two cite a nonexistent .claude/knowledge path). Update commit-convention-audit.sh predicates+VOCAB (or deprecate) and tree-map.md 4-file subtree (DAG invariant).";
      {}),
  row("UC-GCP-P8";"git-ci-publish-P8";"FIX";
      "Stranded machine-state sweep: bounded converging-owner step on the dev-team tick (stranded-state-sweep.sh)";
      "P2";"M";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Add post-cycle Step 4.3 (<=20L) running stranded-state-sweep.sh --plan: 3 buckets — AUTO-COMMIT (notebooks/decisions/sessions/scripts, mtime>24h, D-entries eligible), OWNED-ELSEWHERE skip (docs/signals owned by drain, orch-state, modules/*.json owned by SYSREMAKE RC-GITSTATE, cowork/auditor churn), UNKNOWN -> ONE aggregated deduped PO signal/tick. Cap 20 paths, commit-mutex:main, explicit paths only. COORDINATE with UC-GCP-P2 + SYSREMAKE RC-GITSTATE.";
      {related:["SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE","UC-GCP-P2"]}),
  row("UC-GCP-P3";"git-ci-publish-P3";"FIX";
      "Fix the drain commit deletion drop: tracked-only pathspec sweep (git add -u) scoped to the drain zone + post-commit clean check";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. drain-signals.md:9 -> `git add -u -- docs/signals/ && git add -- docs/signals/processed/` (-u stages tracked mods+deletions only, never sweeps peers' untracked inbox arrivals). Post-commit invariant: porcelain minus '??' minus signals.db must be 0 else bug-telegram. Add a cross-ref note to commit-boundary SKILL RULE1. DROP the backfill (already done df0b58bd9).";
      {}),
  row("UC-GCP-P7";"git-ci-publish-P7";"FIX";
      "Rescope /commit skill: per-commit mutex-bound, main-only, convention-aligned";
      "P2";"S";"cross-service/";"RESCOPE";
      "SCOPE=verifier Rescope note. Delete Step4 merge-and-clean-branch (no-branches invariant); wrap EACH per-category add->commit->push in its own commit-mutex critical section (TTL sized for seconds); add a stranded-peer-file age guard (skip peer-zone files mtime<2h); replace hardcoded Co-Authored-By model name with a pointer to commit-convention; reduce .claude/commands/commit.md to a one-line pointer so /commit has ONE definition.";
      {}),

  # ---------- UNVERIFIED (58) -> 8 per-domain PLAN-ONLY batch umbrellas ----------
  row("UC-RDL-UNVERIFIED-BATCH";"router-dispatch-locking";"SPIKE";
      "Router/dispatch UNVERIFIED batch (9): investigate P6,P8,P9,P10,P11,P12,P13,P14,P15 then decompose";
      "P2";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 9 below-verify-cap proposals: P6 (<=200L split dispatch-claim/task-lock, single-source presence), P8 (persist fallback session-ID across bash), P9 (gateway tool-name drift in INV-GATEWAY-1), P10 (adoption-spawn mapping row; stop naming non-existent dev-team agent), P11 (release intent lock on bg-completion not spawn-return), P12 (required owner_client_session in init.md releases), P13 (route multi-zone to pm), P14 (per-session dispatch-table cache), P15 (Phase A: intent claims not adoptable). PICK-TIME PRE-VERIFY MANDATORY (stale-backlog hygiene). Read brief Proposals for evidence.";
      {plan_only:true, mode:"spike", timebox:180, next_agent:"ba"}),
  row("UC-DTL-UNVERIFIED-BATCH";"dev-team-loop";"SPIKE";
      "dev-team-loop UNVERIFIED batch (12): investigate P5,P7,P8,P10,P11,P12,P13,P14,P15,P16,P17,P18 then decompose";
      "P2";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 12 below-cap proposals: P5 (0a-D-PRUNE drift->HSC-7 pointer), P7 (WF-1 BLOCKED + adoption scan ALL lanes), P8 (harmonize lock calls to P1-FINAL contract), P10 (canonicalize sprint-signoff tokens), P11 (weld pick-time pre-verify into BOUNDED-1 — 5x recurrence), P12 (replace dead Session Gate with actionable-input gate), P13 (prune size-justification changelogs), P14 (de-dup signal routing table), P15 (route ci_red same-tick), P16 (stop orphan adoption dropping co-drained signals), P17 (wire Close Gate Step-4/4b into ops bootstrap), P18 (resolve dead qa[] lane). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:180, next_agent:"ba"}),
  row("UC-CDC-UNVERIFIED-BATCH";"cowork-dispatcher-cron";"SPIKE";
      "cowork-dispatcher-cron UNVERIFIED batch (6): investigate P6,P8,P9,P10,P11,P12 then decompose";
      "P2";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 6 below-cap proposals: P6 (fixed-name tick snapshot kills HH:MM litter + cache-miss race), P8 (weekly-key contradiction in spawn-fanout), P9 (purge retired-RemoteTrigger prose + dead backstop branch), P10 (reorder fallback main.md: election before shared-state mutation), P11 (pick one weekend engine), P12 (firer hardening: dedup logging, live-dispatcher skip, last_fired writeback, timeout telemetry). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:150, next_agent:"ba"}),
  row("UC-CCA-UNVERIFIED-BATCH";"cowork-cycle-agents";"SPIKE";
      "cowork-cycle-agents UNVERIFIED batch (8): investigate P7,P8,P9,P10,P11,P12,P13,P14 then decompose";
      "P2";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 8 below-cap proposals: P7 (one write-allowlist SSOT: per-agent allowed_writes in init.md), P8 (split the two mega-flows to restore <=200L waterfall), P9 (delete orphaned digest-predict daily/monthly flows), P10 (mutex coverage-state.json update), P11 (remove fb treat-missing-script-as-PASS branch), P12 (fix stale wrapper name in TNB bootstrap), P13 (preserve carry-over in gateway-gate BLOCKED template), P14 (sync chef AF-1 tool inventory). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:150, next_agent:"ba"}),
  row("UC-ASL-UNVERIFIED-BATCH";"auditor-signal-loop";"SPIKE";
      "auditor-signal-loop UNVERIFIED batch (2): investigate P7,P8 then decompose";
      "P3";"S";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 2 below-cap proposals: P7 (finish signals.db migration: untrack binary DB + processed/ mirror, correct stale drain note, route cowork tick telemetry out of the signal inbox), P8 (widen Tier-1 shell gate: all system-map health endpoints + docker health-state not just Up + A-20 in-container multi-probe). PICK-TIME PRE-VERIFY MANDATORY; P7 overlaps UC-GCP-P2 (signals.db untrack).";
      {plan_only:true, mode:"spike", timebox:90, next_agent:"ba", related:["UC-GCP-P2"]}),
  row("UC-MDH-UNVERIFIED-BATCH";"memory-docs-hygiene";"SPIKE";
      "memory-docs-hygiene UNVERIFIED batch (7): investigate P7,P8,P9,P10,P11,P12,P13 then decompose";
      "P3";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 7 below-cap proposals: P7 (govern po-decisions.md: cap + rolling archive), P8 (delete stray .test-notebook-prune-debug/ + pin test output), P9 (align notebook retention spec: 200L cap binding), P10 (merge stray per-task notebook + forbid dated variants), P11 (move launchd firer logs out of docs tree), P12 (single SSOT for compression tiers), P13 (token-economy deterministic backstop: cap governed handoff files + archival sweep). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:150, next_agent:"ba"}),
  row("UC-SDF-UNVERIFIED-BATCH";"state-data-files";"SPIKE";
      "state-data-files UNVERIFIED batch (8): investigate P7,P8,P9,P10,P11,P12,P13,P14 then decompose";
      "P3";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 8 below-cap proposals: P7 (decision_journal eviction pass + drop legacy _closed_signals key), P8 (stub-out terminal tasks inside ACTIVE sprints), P9 (sweep spent one-shot .jq payloads + policy bucket), P10 (archive 12 closed pilot-status files + rename bare pilot-status.json), P11 (reverse-orphan GC for backlog-detail.json + relocate out of archive/), P12 (strip RemoteTrigger residue from cowork-schedule.json), P13 (delete verified-orphan data files + root debug dir), P14 (move HANDOFF-QUE-REFERENCE out of orch data dir). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:150, next_agent:"ba"}),
  row("UC-GCP-UNVERIFIED-BATCH";"git-ci-publish";"SPIKE";
      "git-ci-publish UNVERIFIED batch (6): investigate P5,P6,P9,P10,P11,P12 then decompose";
      "P3";"M";"cross-service/";"UNVERIFIED";
      "PLAN-ONLY umbrella for 6 below-cap proposals: P5 (extract bounded rebase-retry push guard into scripts/git-push-guarded.sh; 3 skills call it), P6 (blocking commit-msg hook validating the consolidated convention — depends UC-GCP-P1), P9 (trim commit-mutex <=200L), P10 (bound the commit-boundary R-HANDOFF wait), P11 (update qa-checklist artifact naming to slug IDs), P12 (unify publish-gate boilerplate into one gate-runner — defer until CCATO-T3 stabilizes). PICK-TIME PRE-VERIFY MANDATORY.";
      {plan_only:true, mode:"spike", timebox:150, next_agent:"ba", related:["UC-GCP-P1"]}),

  # ---------- Completeness critic (8 un-audited lanes) -> PLAN-ONLY (2 priority + 1 batch) ----------
  row("UC-CRITIC-HOOKS-ENFORCEMENT";"completeness-critic";"SPIKE";
      "HIGH-RISK: enforcement hooks all end in '2>/dev/null || true' — a crashed validator is indistinguishable from a pass (gates are vigilance-shaped, not structural)";
      "P1";"M";"cross-service/";"CRITIC";
      "PLAN-ONLY investigation. 6/6 hook invocations (orch-state prewrite Zod gate, context-bloat backstop, notebook auto-prune, branch hygiene) swallow failure with 2>/dev/null||true, and Bash(*) allow-all leaves zero secondary backstop -> a crashed validator passes silently. Untracked .test-notebook-prune-debug/ shows hook test artifacts already leaking. Design fail-loud/fail-closed enforcement (exit-code propagation, secondary backstop) for the guards the audited lanes ASSUME structural.";
      {plan_only:true, mode:"spike", timebox:180, next_agent:"ba", supervised:true}),
  row("UC-CRITIC-GATEWAY-CONTRACT-DRIFT";"completeness-critic";"FIX";
      "HIGH-RISK: SSOT drift on the most-called primitive — CLAUDE.md mandates mcp__gateway__call_tool while gateway-call-contract.md mandates mcp__claude_ai_gateway__call_tool";
      "P1";"S";"cross-service/";"CRITIC";
      "The doc that exists to close 6 gateway call-error classes itself contains error-class #7: two different tool-binding prefixes for the same gateway (CLAUDE.md:50 vs gateway-call-contract.md:13,30-32). Reconcile to the ONE binding the live MCP client actually registers (determine empirically in a session where the gateway is UP), fix the loser doc, and audit §6 degraded-mode gateway-blind de-escalation rules. FIRST-HAND: this PO session hit gateway-blind — BOTH prefixes returned 'no such tool available' (server unreachable), so live-binding determination requires a healthy-gateway session.";
      {plan_only:false, next_agent:"ba"}),
  row("UC-CRITIC-UNAUDITED-LANES-BATCH";"completeness-critic";"SPIKE";
      "Completeness-critic un-audited lanes batch (6): agent .md dual-copy, ops/incident flows, refine_bctc_md, VPS crawler, dev-* zone dispatch, tree-map DAG";
      "P2";"L";"cross-service/";"CRITIC";
      "PLAN-ONLY investigation umbrella for 6 lanes no domain analyst covered: (1) agent .md dual-copy (docs/agents vs .claude/agents — 4 docs-side agents unspawnable; ~42 stub/flow pointer-drift unaudited); (2) ops/incident flows (11 sub-flows, near-dup cloudflare/data-validation variants; FIX-OPS-AUDITTRAIL-TIMESTAMP guard is prose-only; exercised by 3 Docker incidents 07-11); (3) refine_bctc_md leaf pipeline (cron dead 8d; owner_agent=refine-orchestrator vs agent id refine_bctc_md mismatch — orphan-lock class); (4) VPS crawler chain (file-signal handoff outside task-board locking, no PRE-CLAIM/orphan protection; Money Radar Phase-1 depends on it); (5) dev-* zone specialist dispatch (zone-detect 55L feeds 12 specialists; mapping drift + Tier-3 fallback untested); (6) tree-map DAG integrity (451L vs recorded 294L — 53% past justification; unregistered children likely). PICK-TIME PRE-VERIFY MANDATORY; split per-lane at decomposition.";
      {plan_only:true, mode:"spike", timebox:240, next_agent:"ba"})
] ) as $rows
|
# ------------------------- filter (id-guard) + append ------------------------
( $rows | map(select(.id as $id | ($existing | index($id)) | not)) ) as $toadd
|
.task_board.backlog += $toadd
|
# ------------------------- annotations (marker-guarded) ----------------------
.task_board.backlog |= map(
  if (.id == "FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"router-dispatch-locking-P3 RESCOPE folds here (do NOT dup, do NOT close); also absorbs REJECTED router-P2 impl-notes",
         note:"P3 implements fix_spec(a)+(c)/AC1+AC3 (heartbeat payload_patch+null-session ladder in coordinationTools/coordinationStore; board-state guard in dispatch-claim SKILL AND dev-team Step0a). fix_spec(b)/AC2 (sprint-task TTL/heartbeat >90min, execute-tier.md:42-64) remains OPEN residual. Route via supervised chain, next_agent=ba.",
         ref:ref("router-dispatch-locking-P3")}}
  elif (.id == "FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"dev-team-loop-P3 CONFIRMED — this row IS the ship vehicle; not double-minted",
         ref:ref("dev-team-loop-P3")}}
  elif (.id == "TE-T05") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"amend DoD from cowork-cycle-agents-P6 (Piece2) + memory-docs-hygiene-P2",
         note:"P6 Piece2: append NO-OP rule (notebook write+session summary are ONE write; skip when flow already landed its settled write), delete the 3 skip-parentheticals once composite ships, add fb cowork-end-cycle parity. P2: this row must DROP its 'DEPRECATED append-session-record' deletion clause (UC-MDH-P2 absorbs it) — amend via orch-apply, never raw-edit.",
         refs:[ref("cowork-cycle-agents-P6"),ref("memory-docs-hygiene-P2")]}}
  elif (.id == "TE-T11") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"cowork-cycle-agents-P1 rider (UC-CCA-P1-GWBLIND-DEDUP)",
         note:"Amend DoD text: composite POINTERS to cycle-bootstrap Error handling SSOT (not 'embeds the same GATEWAY-BLIND boundaries'). UC-CCA-P1-GWBLIND-DEDUP is dep-gated on this row.",
         ref:ref("cowork-cycle-agents-P1")}}
  elif (.id == "TE-T33") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"memory-docs-hygiene-P4 coordination",
         note:"TE-T33 decisions/ leg is SUPERSEDED by UC-MDH-P4 (decision-journal-archive.sh, longest-match closed-only). mtime>30d rotation must NOT be applied to decisions/ (would move open-sprint journals).",
         ref:ref("memory-docs-hygiene-P4")}}
  elif (.id == "FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"auditor-signal-loop-P3 repoints this at scripts/auditor-db-checks.sh as predicate SSOT (fold in, do not copy verbatim)",
         ref:ref("auditor-signal-loop-P3")}}
  elif (.id == "FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"auditor-signal-loop-P3 repoints this at scripts/auditor-db-checks.sh as predicate SSOT (market-hours window)",
         ref:ref("auditor-signal-loop-P3")}}
  elif (.id == "SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE") and (has("audit_ref")|not) then
    . + {audit_ref: {audit:"ultracode-2026-07-12",
         verdict:"coordinate RC-GITSTATE with UC-GCP-P2 + UC-GCP-P8",
         note:"RC-GITSTATE owns tool-usage-stats.json/coverage-state.json gitignore. UC-GCP-P2 untracks signals.db+logs+debris; UC-GCP-P8 stranded-state-sweep skips modules/*.json (RC-GITSTATE-owned). When RC-GITSTATE untracks a path it drops out of porcelain and the sweep needs no change.",
         refs:[ref("git-ci-publish-P2"),ref("git-ci-publish-P8")]}}
  else . end
)
|
# ------------------------- metadata bump -------------------------------------
.task_board._updated_at = $now
| .task_board._updated_by = "po-s140-ultracode-audit-fixall-mint"
| ._updated_at = $now
| ._updated_by = "po-s140-ultracode-audit-fixall-mint"
