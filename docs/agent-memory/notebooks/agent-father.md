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

## GUARD-PRICE-ANOMALY-BYPATH-DISH-CONTRACT 2026-08-09T03:15Z (cont'd) — AC(2)-(5) DONE → review/qa
- Resumed from S33's corrected citation. AC2: dual-plane contract table added
  `docs/standards/mcp-tools.md` § "price_anomaly — DUAL-PLANE CONTRACT" (DB plane cycle.md
  ~L183 vs FILE plane eod.md:29→chef.md:130/:153, by path, never drained). AC3: DO-NOT-ENVELOPE
  marker `eod.md:31-45`. AC4: named allowlist `BY_PATH_CONSUMER_FAMILIES` (prefix
  `price_anomaly_`) in `drain-signals.js`, checked BEFORE parse/`isDrainableShape()` — survives
  future shape changes. AC5: new `drain-signals.test.js` scenario (real orch-ref drain harness)
  proves `price_anomaly_*.json` survives top-level while an unrelated genuine signal in the same
  tick IS drained. Suite 51/51 PASS. Self-caught citation drift: my own AC3 marker pushed eod.md
  schema field `:33`→`:49` — fixed the one downstream cite (mcp-tools.md) with a
  re-verify-AT-SOURCE caveat. Zone: `mcp-tools.md`/`drain-signals.js` outside declared
  commit_zone — edited as narrow PO-directed exception (task names exact files, `supervised:true`,
  same precedent as A-30 `6ff38d27e`), additive/guard-only, test-covered. Row `backlog`→`review`,
  `status=REVIEW`, `next_agent=qa` via `jq | orch-apply.sh` (PASS); `orch-state.json` left
  UNCOMMITTED (FU-AGENT-FATHER-ORCH-SCOPE). Decision journal: `sprint-COWORK-GUARANTEED-SLOT-
  CATCHUP-agent-father-2.md` STEP agent-father-S34.
- **Notebook-prune incident (self-caught):** this Edit's first attempt appended a longer
  dateless-suffix `2026-08-09` heading — `notebook-auto-prune.sh`'s PostToolUse hook fired
  (file went over the 200L/12000B cap), dropped the oldest real-ISO section
  (`FIX-AUDITOR-TIER1-A30-MEM...` 2026-08-08T15:12Z, 41L — already fully preserved in its own
  commit `6ff38d27e`, not re-restored here to control size) AND then, on a same-day tie between
  two `2026-08-09`-dated headings, dropped MY entire new section as "oldest" under a
  `newest_first` direction vote that misjudges THIS file's true oldest-first/append convention
  (matches the known class in commit `f5baf3acf`'s message — same-day-tie direction voting, not
  the earlier ISO-vs-sentinel bug that commit fixed). Workaround (same as `f5baf3acf`): this
  entry's heading now carries a real HH:MM timestamp so it no longer ties with the STOPPED
  section's date-only heading. Not investigating/fixing `notebook-auto-prune.sh` itself — outside
  this task's scope; flagged here for whoever next touches that script's tie-break voting.

## Keep (maintenance) 2026-08-11 12:14 UTC — router-spawned, no explicit intent → defaulted to keep.md
- Trigger: manual (router spawn gave no `trigger`/`intent` → main.md default → keep.md). Pre-Check:
  `git diff --name-only HEAD~3..HEAD` touched zero `.claude/agents/*.md` /
  `docs/agents/*/flow/*.md` → Steps 1-2 (scan-orphans) SKIPPED, straight to Steps 3-5.
- Checks 1/3 (fail-loud-protocol / boundary_rules in `init.md`, correct target per 08-07 fix): all
  41 registered agents PASS; `semble-search` FAIL (known deliberate minimal tool-agent, no
  `agent:` YAML — carried-forward Escalation 2, unchanged).
- **Check 5 (version staleness, >90d) — auto-fix applied (1):** `agents-architect/init.md`
  `version: "2026-05-11"` → 92 days stale → bumped to `"2026-08-11"`. Next-closest cluster sits at
  exactly 90d (ops-vps-fetch, ops-mainserver-fetch, dev-vps-crawls, dev-mainserver-crawls,
  dev-alert-engine @89d) — not >90, left untouched; will trip next cycle if untouched.
- **Check 2 (Error Boundary) — Escalation 1 from 08-07 cycle CONFIRMED RESOLVED:** shared
  `docs/agents/developer/flow/microservice-main.md` (169L, was 165L) now carries an Error Boundary
  block at `:16` pointing to `fail-loud-protocol.md` (task `FIX-DEVFLOW-MICROSERVICE-MAIN-NO-
  ERROR-BOUNDARY`, landed 2026-08-07). Re-ran one-hop resolution for all 9 dev-* zone agents
  pointing there — all PASS now. No new Check-2 gaps found elsewhere.
- **Check 4 (flow path resolves):** all 41 registered agents' `flow.default` path exists on disk —
  0 broken. `semble-search` has no `flow.default` key (deliberate, same Escalation 2).
- Step 5 stale notebooks (>30d, informational): idea-forge/market-analyst/semble-search (101d),
  qa-responder (76d), dev-kinh-dich (33d), dev-news-fetch (32d), cowork-refactory-expert (31d),
  ops-mainserver-fetch (31d) — 8 total, verified via `git log -1 --date=short`, not raw mtime.
- Side-observation (NOT scored — Steps 1-2 gated off again this cycle, 2nd cycle running): 46
  notebook files vs 42 registered agents — same 4-file gap flagged 08-07, still unresolved. Two
  consecutive keep cycles have now landed on a diff with zero `.claude/agents/*.md`/flow changes;
  if a 3rd cycle also gates off, recommend an explicit PO-requested scan-orphans run instead of
  waiting on the Pre-Check gate to open incidentally.
- Bash-tool anomaly this cycle (environmental, not a repo finding): `awk`/`sed`/`basename`/`wc`
  intermittently returned "command not found" mid-for-loop despite `command -v` confirming they
  exist in PATH — worked around with pure-bash string ops (`${var#pattern}`, `read -r x <<< "$s"`)
  and `grep`-only loops. Not investigated further (tool/sandbox layer, outside this agent's scope).
- Step 7 PO handoff: none needed this cycle — Escalation 1 (prior HIGH/MEDIUM) is now RESOLVED;
  Escalation 2 (semble-search guide-taxonomy, LOW) carries forward unchanged, already PO-visible
  from 08-07.
