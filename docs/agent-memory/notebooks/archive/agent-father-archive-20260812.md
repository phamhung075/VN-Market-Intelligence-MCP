# Agent Father — Notebook Archive (split 2026-08-12)

Split out of `docs/agent-memory/notebooks/agent-father.md` on 2026-08-12 per task
`CLEAN-NB-AGENT-FATHER-MIXED-HEADING-OVERCAP-DISARM` (PO decision
`docs/agent-memory/decisions/triage-20260812T1310Z-po.md`, po-S3): the live notebook was
172L/15376B against the 200L/12000B cap (`docs/data/file-size-caps.json`, `agent-notebook`
class) — over on the byte axis only. Separately, its two undated
`## Keep (maintenance) HH:MM` headings sorted as SENTINEL (immune to drop-oldest) next to
the one fully-dated `## EDIT <ISO>` heading, which made
`scripts/agents-flow/notebook-auto-prune.sh` treat the dated (actually newest) section as
"oldest" and silently drop it on the next over-cap write — one real loss already recovered
this cycle via `git show HEAD:...`, fix committed `584c2ea65`. This split moves the oldest
entry (2026-08-07) here and adds an explicit `YYYY-MM-DD` date token to every `## ` heading
retained in the live file, per the containment task's AC-2, so the sentinel population in
the live file is now empty. Nothing dropped — verbatim pre-split content below.

---
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
