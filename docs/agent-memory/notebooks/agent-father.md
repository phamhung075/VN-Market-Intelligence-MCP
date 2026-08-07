# Agent Father — Notebook

## Keep (maintenance) 12:58 — router-spawned, no explicit intent → defaulted to keep.md
- Trigger: manual (router spawn gave no `trigger`/`intent`; per main.md dispatch-table default,
  routed to `keep.md`). Pre-Check gate: `git diff --name-only HEAD~3..HEAD` touched zero
  `.claude/agents/*.md` / `docs/agents/*/flow/*.md` files → Steps 1-2 (scan-orphans) SKIPPED per
  spec, went straight to Steps 3-5.
- Agents scanned: 42 (`.claude/agents/*.md`), Top-5 checks (`sweep-fixes.md` Step 3).
- **Root-cause finding, fixed:** Checks 1/3/5 as literally written ("Grep '<pattern>' <agent>.md")
  target the thin `.claude/agents/<id>.md` stub — but the real Employee Card YAML (`always_load`,
  `boundary_rules`, `version:`) lives in `docs/agents/<id>/init.md` since the `dc430566c`
  consolidation. Ran literally first: 42/42 "FAIL" on checks 1 and 3 — a 100% fail rate that was
  itself the tell (cf. `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` — wrong
  target, not wrong agents). Did NOT auto-fix 42 files on a false signal. Re-ran against the
  correct target (`init.md`): only `semble-search` genuinely lacks fail-loud-protocol/
  boundary_rules/version (it's a deliberate minimal tool-wrapper doc, no `agent:` YAML block at
  all — self-declares "Tool-style agent... no multi-step flow" in its own `flow/main.md`).
  Auto-fix applied (1): edited `docs/agents/agent-father/flow/sweep-fixes.md` Step 3 table to
  point checks 1/3/5 at `docs/agents/<agent-id>/init.md` explicitly, with a note — prevents this
  exact false-positive class recurring on every future keep cycle. Zero agent files touched.
- **Escalation 1 (real, corroborated):** Check 2 (Error Boundary) — re-ran case-insensitive
  (`grep -i "error boundary"`; literal-case grep also false-positived, live text uses "Error
  boundary" lowercase-b in ~half the files). 8 microservice dev-* agents (dev-alert-engine,
  dev-api-gateway, dev-kinh-dich, dev-macro-indicators, dev-pdf-extractor, dev-rag-service,
  dev-stock-price, dev-technical-analysis) all route through the shared
  `docs/agents/developer/flow/microservice-main.md` (165L) — grepped it directly, zero "error"/
  "boundary" hits anywhere in the file. No documented error-handling protocol for a shared TDD/
  branch/commit flow used by 8 live agents. One-file fix would remediate all 8. NOT auto-fixed
  (Check 2's own table: manual authoring only). Not my zone to author (developer/architect's
  flow) — surfaced to PO handoff below, not silently dropped.
- **Escalation 2 (low severity, guide-taxonomy gap):** semble-search's Employee-Card gap above —
  recommend PO/agent-father backlog decide whether `AGENT_CREATION_GUIDE.md` needs a lighter
  "Tool Agent" template class (haiku, 2-tool read-only wrapper, no channels/constraints/lifecycle)
  so future audits stop re-flagging a deliberate design choice as a violation.
- Step 5 stale notebooks (>30d, informational only): idea-forge (96d), market-analyst (96d),
  qa-responder (71d), semble-search (96d).
- Side-observation (NOT scored — Steps 1-2 gated off this cycle): 46 notebook files under
  `docs/agent-memory/notebooks/` vs 42 registered `.claude/agents/*.md` — a 4-file gap. Left for
  the next cycle where the Pre-Check gate actually opens (or an explicit PO-requested scan-
  orphans run) rather than hand-rolling Steps 1-2's methodology out of turn.
- Step 5b (`team-tool-recheck.md`) re-run unconditionally per spec: wrote
  `docs/agent-memory/health/team-tool-recheck-2026-08-07-1258.md`. Positive control held —
  alert-commander CRITICAL found (Bash + unqualified "no other writes" claim, origin `610110e16`
  2026-07-31), same as market-watcher/news-scout. All 3 unchanged from the 2026-08-06T13:18Z run
  (day+1, still unresolved) — RESOLVED THIS CYCLE = N/A. Mechanical-enforcement status unchanged:
  PROSE-ONLY (0 `write_boundary` keys in system-map.json; `.claude/settings.json`'s sole
  `PreToolUse` matcher is `Glob|Grep` for graphify, not `Write|Edit`).
- No `mcp__gateway__call_tool` MCP binding in this session either (recurring structural gap for
  this agent identity, same class already logged S23/S28/S30 in earlier entries this notebook
  cycled out) — used keep.md's documented gateway-less direct-pathspec-commit fallback for all
  writes this cycle, no task_claim/commit-mutex wrapper attempted.
- PO handoff (Step 7, findings only — no nested `Agent` spawn grant, same structural gap as
  `feedback_devteam_flow_needs_nested_agent_spawn_subagent_cannot`): Escalation 1 (shared
  microservice-main.md Error Boundary gap, 8 agents) is new-backlog-candidate severity MEDIUM;
  Escalation 2 (semble-search guide-taxonomy) severity LOW; the 3 CRITICAL tool-boundary findings
  are carried-forward (already PO-known from the prior two `team-tool-recheck` runs, not new).

## Verify+flip (dev-team S2 dispatcher-wrap) 2026-08-07T02:03Z FIX-REFINE-SUBFLOW-OPTIONC-CONTRACT-DRIFT — AC-1..AC-6 confirmed complete, REVIEW
- Dispatch scoped to the row's BROADER AC-1..AC-5 deliverable (AC-6 already done, AC-7/
  `po_action_item_1` explicitly out of scope — both handled by prior dispatches). Read all 6
  in-scope files fully (`main.md`, `table-page.md`, `prose-page.md`, `continuation-stitch.md`,
  `disagreement-verify.md`, `.claude/agents/refine_bctc_md.md`) and grepped repo-wide for every
  literal defect string named in the task: `execute_sub_flow_logic` (only negated/historical
  mentions remain — main.md's own size-justification comment + a decisions-file postmortem),
  `PARTIAL_EXIT` (same), `Task return value`/`orchestrator collects`/`Returns result JSON inline
  to main.md` (zero hits in all 4 sub-flow docs), `<=7 windows` in `.claude/agents/
  refine_bctc_md.md` (zero hits — already `<=12 windows, REFINE_CHUNK_SIZE=12`).
- Conclusion: AC-1 through AC-6 are ALREADY fully implemented — landed in commit `da489f36f`
  (2026-08-06T17:17:45+02:00), which predates this dispatch entirely. Made ZERO code edits this
  cycle — the files already match every AC's literal wording; re-writing correct text would be
  pure churn with a false "I fixed this" signal.
- DJ-GATE-1 entry written (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` S31) before
  flip. Board row flipped `IN_PROGRESS`→`REVIEW` via `scripts/orch-apply.sh` (never raw write):
  lane-move `task_board.in_progress[]`→`task_board.review[]` in the same write per
  CANONICAL:SSOT-STATUSFLIP-LANEMOVE; `.head` synced to `{status:idle, active_task_id:null,
  next_agent:router}` since this row WAS `.head.active_task_id` and carries `branch:null`.
  `review_note` explicitly states AC-6 (slot pause) and AC-7/`po_action_item_1` (cadence
  slot-1 re-enable) were handled by EARLIER dispatches, not this one — so QA does not re-demand
  work already done, and does not misread this cycle's zero-diff as a skipped AC.
- No `mcp__gateway__call_tool` MCP binding in this session (recurring structural gap for this
  agent identity, already logged S23/S28/S30) — task-lock heartbeat (`task:FIX-REFINE-SUBFLOW-
  OPTIONC-CONTRACT-DRIFT`) and `commit-mutex:main` claim/release both done via direct
  `docker exec`+`bun:sqlite` matching `heartbeatTask()`/`claimTask()`/`releaseTask()`'s exact SQL
  verbatim (not a business-logic bypass — same statements the MCP tools run).

## Direct-implement 2026-08-07T00:52Z FIX-CRON-REARM-CROSS-SESSION-DEDUP — Lane 1 (guard fix + marker mechanism)
- Read `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1-2/§4 in full.
  Sequencing gate (dev-team's `coordinationStore.ts`/`tasksMdJanitorJob.ts` `cron-registration:*`
  exclusion) confirmed already deployed — RAW-verified live source (`951ddfdba`/`86b31eccd`), not
  re-derived, per AC-4.
- 3 skills (`.claude/skills/cron-{cowork-team,detect-loop,standalone-team}/SKILL.md`): restructured
  Step 1 from single identity+value binary → explicit Phase-1-IDENTITY-then-Phase-2-VALUE classify
  (§2). Standalone Job1/Job2 identity anchor switched `db-integrity-probe.sh` (shared,
  ambiguous) → `description`'s `"CADRAT-2 Job A"`/`"CADRAT-2 Job B"` (already-live tokens,
  confirmed in `register-job-db-integrity-{weekday,offhours}.md`). detect-loop Job1 anchor left
  as prompt-substring `dev-team/flow/main.md` (not `description`, which bakes in cadence text) per
  brief's explicit naming-trap warning. cowork-team master's Phase-2 VALUE check now includes the
  `"TOMBSTONED"` prompt fragment, closing the self-flagged FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
  gap (marked SUPERSEDED in that section, history kept).
- Added the §1.2 cross-session marker guard (fast-path `task_heartbeat` probe →
  `task_list_held(kind="sprint-task")` client-filtered → session-presence liveness cross-check →
  `task_force_release_orphan` on confirmed-dead → `task_claim` register) ahead of each skill's
  local classify. One marker per skill (`cron-registration:cowork-team`/`detect-loop`/
  `standalone-team`), `task_kind:"sprint-task"` reused, `ttl_seconds:691200`,
  `orphan_threshold_seconds` 7200 (cowork-team/detect-loop) / 120 (standalone-team, tool minimum —
  no natural tick hook for this family, session-presence is the sole practical staleness signal).
- Renewal heartbeats (§1.4) added to exactly the 3 named per-tick flow files:
  `cowork-team/flow/main.md` Step 0b.1, `dev-team/flow/preflight-fallback.md`,
  `system-auditor/flow/main.md` Step 0d. Did NOT touch `dispatch-claim/CARD.md` Step 0a (explicit
  out-of-scope, universal hot path). Verified live: for cowork-team/dev-team, the named
  presence-block only runs on the ERROR-fallback/manual-run path (WU-1/WU-2 preflight scripts
  bypass it on the common SILENT/WORK/RUN/SKIP path) — added there anyway per exact task
  instruction; not a correctness gap since session-presence (not this marker's own heartbeat_at)
  is the documented PRIMARY staleness oracle (§1.3) for dead-session detection. Flagged
  transparently in RETURN, did not expand scope into the out-of-zone `.sh` scripts to "fix" it.
- lane1_addendum doc-sync (2 files, explicitly my zone per the parent row, dev-team confirmed both
  untouched): `system-auditor/handlers.md` Step R-1b item 1 + `audit-dimensions.md` D4-R1b table —
  both now list `cron-registration:*` in the known-legit exclusion whitelist, matching the live
  `KNOWN_LEGIT_PREFIXES` code exactly.
- Did NOT call any `Cron*`/`task_claim`/`task_heartbeat` tool (plan/spec authoring only, per brief's
  own constraint). Did NOT touch `apps/mcp-server/src/**` (out of zone, already fixed by dev-team).
  Did NOT perform §3's one-time remediation (explicitly the user's own action, zero agent
  involvement by design).
- Files changed: `.claude/skills/cron-cowork-team/SKILL.md`, `.claude/skills/cron-detect-loop/
  SKILL.md`, `.claude/skills/cron-standalone-team/SKILL.md`, `docs/agents/cowork-team/flow/main.md`,
  `docs/agents/dev-team/flow/preflight-fallback.md`, `docs/agents/system-auditor/flow/main.md`,
  `docs/agents/system-auditor/handlers.md`, `docs/agents/system-auditor/audit-dimensions.md`. No
  `register.md`/`register-job-*.md` edits needed — none of the `CronCreate` call bodies changed,
  only the guard match logic that decides when to run them.
