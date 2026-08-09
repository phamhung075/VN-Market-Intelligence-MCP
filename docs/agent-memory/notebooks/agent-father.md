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

## Fix (supervised router-direct dispatch) 2026-08-08T15:12Z FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE — REVIEW, next_agent→qa
- Router-direct dispatch, PO-authorized: `po_redispatch_ruling_20260808T1445Z` (row's own field,
  read in full first) — `next_agent=agent-father` is UNREACHABLE by BOUNDED-1/DRS(explicitly
  excludes agent-father)/QA-Drain/RLC; explicit dispatch IS the designed escape hatch. Did NOT
  ask to widen the DRS allowlist (out of scope, rejected by the ruling).
- **Root fix (PLANE B port):** `probe.sh`'s A-30 `≥85%` deep-probe gate sampled ONLY mcp-server
  and let its % decide, fleet-wide, whether the multi-probe ran — rag-service was never
  independently sampled. Router/PO evidence: c51 (mcp-server 89.69%→gate engaged→rag named
  DEGRADED) vs c53 29min later (mcp-server 84.75%→gate skipped→rag ABSENT despite 92.81-98.78%,
  ALL_GREEN) — one variable. Fixed: new `_a30_run_investigate_gate()` + 3 helpers in `probe.sh`
  (outside the standalone-exec guard, testable), evaluating the gate PER capped RUNNING
  container, live-resolved (never hardcoded). `tier1-probe.md` A-30 clauses 1-6 rewritten to
  parse N SKIP-lines/JSON-blocks per cycle (was: assumed exactly one); clause 6 `dedup_key` now
  mandates the container name.
- **Amendment A** (mandatory, PO-verified dead code): deleted `VMRSS_KB`/its UNAVAILABLE
  default/`"vmrss_kb"` from `verify-a30-mcp-memory-reclamation.sh` — zero consumers repo-wide
  once the vmhwm-vs-vmrss tautology veto was removed by a sibling task. Kept VmHWM (before/after)
  — feeds a live ESCALATE branch.
- **Amendment B** (mandatory, safety-critical): the 2 surviving VmHWM `docker exec` calls now
  gated behind `_a30_headroom_ok()` — HOST-SIDE ONLY (`docker stats`+`docker inspect -f
  {{.HostConfig.Memory}}`, zero exec to decide), reusing (`source`, not reimplementing) PLANE
  A's already-shipped `_mem_headroom_mib()`/`MEM_FLOOR_MIB=40`
  (`scripts/agents-flow/auditor-tier1-probe.sh`) — **zero edits to that file**, its own 181/181
  suite re-run clean post-change (qa's 2026-07-28 "do NOT re-open or re-fix PLANE A" honored).
- New tests: `verify-a30...test.sh` T13 (AC8, headroom<floor→both VmHWM fields UNAVAILABLE, no
  exec) + T14 (AC9, VmHWM UNAVAILABLE→MINP fallback still ESCALATEs); `probe.test.sh` T8-T13
  (AC7, replays the exact c51/c53 matched pair — gate engages for rag-service independent of
  mcp-server's own %). All 3 suites green: verify-a30 15/15, probe.test.sh 16/16, PLANE A 181/181.
- Commit `6ff38d27e` (pathspec-scoped, 5 files: `tier1-probe.md` + `probe.sh`/`.test.sh` +
  `verify-a30-mcp-memory-reclamation.sh`/`.test.sh`), RULE 1-3 (2.5) applied, pushed clean first
  attempt.
- **`scripts/audits/` is outside my declared `commit_zone`** (allowed: `docs/agents/`,
  `docs/agent-memory/`, `.claude/skills/`, `.claude/agents/`) — committed anyway as an explicit,
  narrow, router/PO-directed exception for this one P0 row (task text named the exact files/
  lines); not adopted as a standing precedent for future unsupervised work.
- Row updated via `jq | scripts/orch-apply.sh` (Stage0+1 PASS, conservation OK): appended AC(7)/
  (8)/(9) verbatim (ruling-mandated, with evidence citations) to `acceptance`, `next_agent→qa`,
  added `agent_father_closeout_20260808T1509Z` narrative field. Left `orch-state.json`
  **UNCOMMITTED** — same `FU-AGENT-FATHER-ORCH-SCOPE` precedent as this notebook's own
  2026-08-08T13:55Z entry; router/PO owns the board-write commit.

## GUARD-PRICE-ANOMALY-BYPATH-DISH-CONTRACT 2026-08-09 — STOPPED at AC-1 gate, citation drift confirmed
- Dispatched via dev-team S4-UNBLOCK (PO manual-dispatch-sweep, triage-20260809T0135Z-po.md §po-S6).
  AC-1 mandates re-confirming writer/consumer file:line citations AT SOURCE before writing the
  dual-plane contract, with an explicit "if either has moved, record the new location and STOP for
  re-triage before changing anything" gate — restated verbatim in the dispatch prompt.
- **Writer** `docs/agents/market-watcher/flow/eod.md` — `:13`/`:29`/`:33` all exact match, unchanged
  since PO's 2026-07-21 verify.
- **Consumer** `docs/agents/unified-agent/flow/chef.md:116` — DRIFTED. `git show
  47c703fca:docs/agents/unified-agent/flow/chef.md` (the exact commit live at the 07-21 PO-verify
  timestamp) confirms `:116` was `- \`price_anomaly_*\` — from market-watcher` at that time — the
  citation was correct when minted. Current HEAD: same line now at `:153`. `git diff 47c703fca HEAD
  -- chef.md` shows the entire `Read all docs/signals/*.json...` / `Collect file groups:` block
  BYTE-IDENTICAL — the 37-line shift is entirely unrelated growth (TE-T16 split 2026-08-06 +7L
  header, plus Step 0.5's FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE/FIX-CHEF-INTRADAY-MARKER-
  CADENCE comment blocks added 07-29→08-06, both physically ABOVE Step 0 in the file). The by-path
  consumer mechanism itself (unenveloped top-level glob, `price_anomaly_*` named explicitly) is
  confirmed unchanged and still resident in `chef.md` (TE-T16's own header states it relocated ONLY
  Steps 1.5-8 to `chef-dish.md`, explicitly keeping Step 0.5/Step 0/Step 1 in this file).
- **Judgment: honored the literal STOP gate rather than self-correct-and-proceed.** The drift IS
  real (citation moved, condition literally met) even though the underlying fact-pattern verified
  true. Chose not to exercise judgment to override an explicit, twice-stated instruction on a
  `supervised:true` row whose whole premise is "four prior mis-diagnoses came from someone not
  checking this" — deciding "this particular drift is benign" is exactly that same interpretive
  leap, just made by me instead of a predecessor. Zero edits made to `eod.md`, `mcp-tools.md`, or
  `drain-signals.js` — AC(2)-(5) untouched.
- Row flipped `BACKLOG`→`BLOCKED` (lane-coherent per `LANE_ALLOWED_STATUSES.backlog`) via `jq |
  scripts/orch-apply.sh` (Stage0+1 PASS, conservation OK, `updated_at` stamped) — `status_note`
  carries the full corrected citation (consumer = chef.md Step 0 GATHER, glob-read `:130`,
  `price_anomaly_*` family bullet `:153`) so a re-dispatch can skip re-deriving this verification.
  Left `orch-state.json` **UNCOMMITTED** — same `FU-AGENT-FATHER-ORCH-SCOPE` precedent as prior
  entries; router/PO owns the board-write commit. Decision journal: `sprint-COWORK-GUARANTEED-
  SLOT-CATCHUP-agent-father-2.md` STEP agent-father-S33.
