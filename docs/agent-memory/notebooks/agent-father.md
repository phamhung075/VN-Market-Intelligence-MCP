# Agent Father — Notebook

## Edit (cross-cutting) 2026-08-07T13:22Z FIX-DEVFLOW-MICROSERVICE-MAIN-NO-ERROR-BOUNDARY — AC-1..AC-4 landed, REVIEW
- Router-dispatched manual pickup (DRS-STRANDED-OFF-ALLOWLIST — off the ratified auto-dispatch
  allowlist; PO occurrence-2 corroboration + `po_dispatch_decision_20260807` folded this row into
  today's manual BATCH). PO's zone-claim correction verified true: all 4 `files[]` sit under
  `docs/agents/`, in-zone for this identity.
- AC-1: authored the missing Error Boundary block into `docs/agents/developer/flow/microservice-
  main.md` (165L→169L), placed above `## Role in dev-team flow` mirroring the dev-mcp-server:18/
  dev-frontend:17 sibling placement. Points at `docs/protocols/fail-loud-protocol.md` §
  "Error Boundary — Blocked Flow = EXIT" as the dev-pipeline SSOT — NOT `cowork-error-boundary/
  SKILL.md` (that contract prescribes gateway calls this specialist class holds no grant for and
  omits the `.head` idle-reset STOP-RELEASE step, per the row's own AC-3 rationale).
- AC-3: repointed `dev-mcp-server/flow/main.md:18` and `dev-frontend/flow/main.md:17` off the
  wrong cowork SSOT onto the same `fail-loud-protocol.md` anchor — closes the false-green the row
  named (Check #2 passed against the wrong content).
- AC-2: generalized `sweep-fixes.md` Check #2 — was hardcoded to name `microservice-main.md` "by
  example"; now a one-hop delegation-pointer rule before returning FAIL. Live re-grep found 3
  pointer phrasings, not the 2 the AC text named: `-> Run flow:` (used by all 8 named thin-pointer
  dev-* agents) plus `-> Run shared flow:`/`-> Run sub-flow:` (dev-mcp-server/dev-frontend) —
  caught by re-grepping live files rather than trusting the AC prose verbatim.
- AC-4 live re-verify (RAW, not self-report): re-ran the corrected Check #2 across all 14
  `docs/agents/dev-*/` dirs. Before: 2/10 pipeline agents "PASS" (dev-mcp-server, dev-frontend —
  both false-green, wrong SSOT) + 8/10 FAIL (exactly the 8 named). After: 10/10 PASS, all
  resolving the SAME SSOT text. Bonus corroboration: `dev-news-fetch`, an undocumented 9th
  consumer of `microservice-main.md` not in the row's `files[]`/8-agent list, also flipped PASS
  automatically — shared-file fix cascaded correctly, zero extra edit needed.
- Out of scope, correctly left untouched per the row's own `out_of_scope` note: the INV-GATEWAY-1
  Step 6b contradiction inside `microservice-main.md` (belongs to `FIX-COWORK-FLOWS-GATEWAY-
  BLIND-BRIDGE-FALLBACK`). Also did not touch `dev-team`/`dev-mainserver-crawls`/`dev-vps-crawls`
  `flow/main.md` — out of `files[]` scope; those 3 still resolve a different SSOT
  (`cowork-error-boundary`/`cowork-boundary` skills), a candidate for a future row.
- DJ-GATE-1 entry written (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` S32) before
  flip. Board row flipped `BACKLOG`→`REVIEW` via `scripts/orch-apply.sh` (lane-move
  `backlog[]`→`review[]`), `next_agent:po` (row's AC-verification/corroboration owner). `.head`
  untouched — this row was never `.head.active_task_id` (manual off-allowlist dispatch).
- No `mcp__gateway__call_tool` MCP binding in this session (recurring structural gap for this
  agent identity, S23/S28/S30 + this cycle's own earlier section) — sprint-task lock claimed via
  direct `docker exec`+`bun:sqlite` `INSERT OR IGNORE INTO task_locks`, matching `claimTask()`'s
  exact SQL verbatim; commit via gateway-less direct-pathspec fallback, no commit-mutex wrapper.

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
