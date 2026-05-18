# agents-architect — Notebook

## 2026-05-18T20:11:09Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-team-command.md`

RemoteTrigger-per-slot model hit two walls (API_MIN_INTERVAL blocks 4 sub-hourly slots; Claude Desktop cannot spawn subagents); designed a dev-team-pattern master cron — single `*/15 CronCreate` in Claude Code CLI running `.claude/commands/cowork-team.md`, which reads `docs/data/cowork-schedule.json`, matches `currentUTC ±2min`, and parallel-spawns all due agents — deleting 12 RemoteTriggers after 24h parallel-run with idempotency guard.

**Signal dropped:** `docs/signals/agents-architect-1951-cowork-team-brief.json` → agent-father

---

## 2026-05-18T17:15:20Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md` (v2 revision)

User constraint invalidated the cowork-scheduler dispatcher design: Claude Desktop cannot spawn subagents via Agent tool (Claude Code SDK only). Refactored architecture to 17 independent RemoteTriggers (one per slot) each running the target agent's flow directly, with `docs/data/cowork-schedule.json` (written) as the SSOT time-table; cowork-scheduler agent eliminated; 3 open questions (OQ-1/2/3) on RemoteTrigger cron syntax flagged for agent-father to resolve before Sprint 1951 T1.

**Signal dropped:** `docs/signals/agents-architect-2026-05-18T171520Z-cowork-schedule-remotetrigger.json` → po

---

## 2026-05-18T17:02:06Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md`

~17 cowork cron blocks scattered across 7 agent .md files evaporate on session end and make dependency ordering brittle; designed a master cowork-scheduler agent (haiku, bash-first gate, <1s NOOP exit) reading a single `docs/data/cowork-schedule.json` SSOT, with a 5-phase migration preserving Sprint 1949 timing gates exactly and a dev-team drain-signals watchdog for failure detection.

**Signal dropped:** `docs/signals/agents-architect-2026-05-18T170206Z-cowork-master-scheduler.json` → po

---

## 2026-05-18T15:54:51Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-reorder-and-cook-schedule.md`

4 cowork agents writing parallel dump streams to MARKET (evidenced by messages 527-531: garbage prices, 49 deduped alerts, identical cascade repeats, 6 banking ingredients never fused, RSI=13.2 buried mid-list); reordered 9 cowork agents to chef/gatherer architecture — unified-agent becomes CHEF walking TNB 6 layers on 3 scheduled dishes/day, alert-commander narrowed to event-only, market-watcher and news-scout to signal-only gatherers.

**Signal dropped:** `docs/signals/2026-05-18T155451Z-cowork-reorder-and-cook-schedule.json` → agent-father + dev-mcp-server + pm

---

## 2026-05-17T20:44:33Z

**Brief:** `docs/architecture-briefs/2026-05-17-outcome-feedback-loop.md`

No mechanism to verify whether cowork agent signals (BULLISH/BEARISH/NEUTRAL) actually matched price movement; designed a full outcome feedback loop — `signal_outcomes` table (T+24h/T+48h price verification), hourly resolution cron job using `market_prices_history` with stock-price service fallback, accuracy stats query per signal_type + stock_code, `get_accuracy_context` MCP tool for cowork self-calibration, and accuracy badge extension on the existing `/api/signals/stock/:code` endpoint + frontend `dashboard.analysis.tsx`.

**Signal dropped:** `docs/signals/2026-05-17T204433Z-outcome-feedback-loop.json` → agent-father

---

## 2026-05-17T20:38:03Z

**Brief:** `docs/architecture-briefs/2026-05-17-tnb-critic-gate.md`

Cowork agents write signals directly to agent_signals with no quality gate; designed a deterministic TNB critic gate (5-check rule-based scorer, 0.6 threshold, 1 retry, 20s timeout, fail-soft) inserted at the MCP tool layer via a new postSignalWithCriticGate() wrapper — no cowork flow changes required, 3 new DB columns (critic_score, critic_notes, retry_count), 8 numbered implementation steps for agent-father.

**Signal dropped:** `docs/signals/2026-05-17T203803Z-tnb-critic-gate.json` → agent-father

---

## 2026-05-14T16:59:39Z

**Brief:** `docs/architecture-briefs/2026-05-14-ssot-data-location-mapping.md`

docs/ bind-mount gap: cowork agents on Claude Desktop cannot read policies, protocols, architecture briefs, or specs because mcp-server only bind-mounts `docs/agent-memory/` and 3 individual JSON files; 4 changes close the gap (C1 full docs/ ro mount, C2 MCP read_knowledge_doc tool, C3 daily DB backup cron, C4 rebuild policy doc), with C1 as a 1-hour highest-ROI first sprint.

**Signal dropped:** `docs/signals/2026-05-14T165939Z-ssot-data-location-mapping.json` → po

---

## 2026-05-14T12:05:39Z

**Brief:** `docs/architecture-briefs/2026-05-14-1912d-cutover-audit.md`

Comprehensive pre-cutover audit for 1912d: identified ~18 files requiring edit across apps/ (delete TS gateway, mv Go gateway), docker-compose.yml (delete `api-gateway-go:` block, fix host port 4001→4000), 6 microservice architecture docs (TS stack refs → Go paths), ARCHITECTURE.md + restart-policy.md + README.md (language tags), dev-api-gateway.md agent (tech_stack + test_command + skills + lazy-load trigger), and 3 architecture brief close-outs; Go module rename flagged as optional cosmetic; execution order and risk register included.

**Signal dropped:** `docs/signals/2026-05-14T120539Z-1912d-cutover-audit.json` → agent-father

---

## 2026-05-12T21:52:40Z

**Brief:** `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`

Unified RCA for HEAD.lock 5-cycle recurrence (c52–c56): c56 single-process evidence invalidates worktree-only hypothesis; 4 prioritized hypotheses (H1 rapid sequential git commit racing on HEAD.lock most likely, H2 hook crash after lock acquisition secondary); diagnostic plan requires GIT_TRACE probe + `--no-verify` test before code fix; worktree orphan (Issue B) is a separate SDK at-exit gap with independent fix path; 7 c57+ tasks proposed (T1–T2 investigation gates T3–T4 fix, T5–T6 worktree gc independent).

**Signal dropped:** `docs/signals/2026-05-12T215240Z-brief-complete-headlock-rca.json` → po

---

## 2026-05-12T18:38:54Z

**Brief:** `docs/architecture-briefs/2026-05-12-dev-zone-enforcement-and-split-policy.md`

Zone enforcement gap identified: 9 dev-* specialists are correctly wired but remain idle because FIX path bypasses zone assignment and Tier 3 fires silently with no feedback loop to PO; Wave 1 closes the loop (5 flow edits, new `zone_missing_tier3` signal type), Wave 2 splits 67 oversize files across 4 classes with agent-father owning 43 and claude-manager-helper owning 24.

**Signal dropped:** `docs/signals/agents-architect-2026-05-12T18-38-54Z-zone-enforcement-split-policy.json` → agent-father

---

## 2026-05-12T07:54:26Z

**Brief:** `docs/architecture-briefs/2026-05-12-flow-split-waterfall.md`

16 flow files audited (1,987 total lines); 4 flows identified as split candidates (dev-team 340L, po 215L, pm 107L, market-analyst 105L); Phase 1 targets dev-team/po/market-analyst for ~40-50% flow-context token reduction; implementation gated on 3 user open questions (task-type detection mechanism, shared preamble placement, sub-flow path convention).

**Signal dropped:** `docs/signals/flow-split-waterfall.json` → agent-father

---

## 2026-05-11T20:39:59Z

**Brief:** `docs/architecture-briefs/2026-05-11-signal-dedup-sqlite.md`

Signal dedup moves from O(N) full-dir scan of `processed/*.json` to O(log N) SQLite `SELECT` against a dedicated `signals.db`; five tasks (T1 schema → T2 backfill → T3 drain rewrite, then T4+T5 in parallel) handed to agent-father for implementation.

**Signal dropped:** `docs/signals/agents-architect-2026-05-11T20-39-59Z-signal-dedup-sqlite.json` → agent-father

---

## 2026-05-11T16:32:08Z

**Brief:** `docs/architecture-briefs/2026-05-17-commit-convention-audit.md`

Designed Day-7 commit-convention audit with four concrete pass thresholds (C1 ≥90% header format, C2 ≥85% Task trailer, C3 ≥80% AC trailer, C4 ≥95% scope vocab), specifying a shell script at `scripts/audits/commit-convention-audit.sh` that emits a JSON verdict and auto-drops greenlight signal to agent-father for C1+C2 collapse on PASS.

**Signal dropped:** `docs/signals/agents-architect-2026-05-11T16-32-08Z-phase-b-c1-c2-audit-design.json` → agent-father
