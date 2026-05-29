# agents-architect — Notebook

## 2026-05-29T04:37:46Z

**Brief:** `docs/architecture-briefs/2026-05-29-bctc-analyst-merge.md` (REVISED v2)

PO expanded scope with E1–E4: (E1) 6 trick-detection passes + consolidation in ordered `stage-pass-*.md` flow files with mandatory evidence-citation requirement and deterministic consolidation algorithm; (E2) off-market-hours guard (VN 02:00–08:00 UTC) as first step in cycle.md, cron revised to `0 15,18,21,0 * * *`; (E3) SHA-256 content-hash idempotency cache at `data/bctc-analysis-cache/{TICKER}/{QUARTER}/{hash}.json`; (E4) extractor binding audit against actual BCTC table schema — 3 missing fields flagged as separate dev-pdf-extractor sprint. Partial H-1..H-7 files from killed agent-father run verified consistent. DELETE list expanded (no archive — PO directive). Migration steps renumbered H-1..H-24.

**Signal dropped:** `docs/signals/bctc-analyst-merge-20260529T042613Z.json` → agent-father (updated to v2)

---

## 2026-05-29T04:26:13Z

**Brief:** `docs/architecture-briefs/2026-05-29-bctc-analyst-merge.md`

PO-approved MERGE of `financial-analyst` + `report-analyzer` into single `bctc-analyst`: canonical `bctc_signal` with `mode` discriminator replaces dual signal types, in-cycle calendar gate drives routine vs release mode, release-mode-only ledger writes preserved, single `0 0,12 * * *` cron with earnings detection in-cycle, chef dual-accept transition then single-accept post-archive, sonnet pinned, 17-step H-1→H-17 migration with 24h parallel-run rollback gate.

**Signal dropped:** `docs/signals/bctc-analyst-merge-20260529T042613Z.json` → agent-father

---

## 2026-05-28 — BCTC-EVAL-AGENTS (sprint BCTC-EVAL-SUBSTRATE)

6 agent flow files updated to consume the shared eval substrate (GET /api/bctc-eval/{report_id} and GET /api/bctc-eval). No commits — all files left unstaged per task constraint.

- `docs/agents/qa/flow/main.md` — BCTC Eval Gate added before pipeline verdict: red blocks DONE with gate_failures summary, yellow logs CAUTION but does not block. 198L (≤200L preserved).
- `docs/agents/system-auditor/flow/main.md` — D-BCTC-EVAL nightly sweep step added in Tier-2: compares statuses against notebook snapshot, posts deltas to WORK Telegram, updates DASHBOARD.md for red/yellow changes.
- `docs/agents/financial-analyst/flow/main.md` — BCTC Citation Trust Protocol added: red → Vietnamese `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ stage N]` (NOT brief's Portuguese), yellow → `[độ tin cậy thấp]`, green → cite normally. Brief §9 Portuguese correction flagged for follow-up.
- `docs/agents/report-analyzer/flow/cycle.md` — eval pill mandatory on every WORK notebook entry referencing a BCTC report: 🟢/🟡/🔴/⬜ with detector_version and computed_at.
- `docs/agents/dev-pdf-extractor/flow/main.md` — Extraction Failure Debug Subroutine added as first step: fetches GET /api/bctc-eval/{report_id}, maps each gate_id in gate_failures_json to a regression-set AC before writing any code.
- `docs/agents/ops/flow/main.md` — Fleet OCR Regression Alert added: 3+ reports with 3_OCR.vn_diacritic_ratio below threshold → treat as PaddleOCR regression; diagnostic: pip freeze | grep paddleocr, diff vs requirements-pek.txt, check base image SHA.

Vietnamese correction: brief §9 used Portuguese (`BAIXA CONFIANÇA / EXTRAÇÃO VERMELHA`). All user-facing warnings in financial-analyst flow use Vietnamese per `feedback_market_report_plain_vietnamese`. Brief needs follow-up edit — flagged in flow comment and this notebook.

---

## 2026-05-27T20:41:55Z

**Brief:** `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`

Three-lane gated self-improvement loop formalized: lane-a (PO approves `.md` changes via agent-father), lane-b (auto-implement ONLY behind proven gate via dev-team+QA, Sprint 1948 substrate reconciled), lane-c (comprehensibility + irreversible + gate-self-edits → human WORK Telegram, never auto-close). Five concrete flow-edit targets named (EDIT-1 through EDIT-5 in system-auditor/agents-architect/po/agent-father/dev-team flows). No new agents, no new cron beyond the already-budgeted 1948 selfImproveOrchestratorJob.

**Signal dropped:** `docs/signals/gated-self-improvement-loop-20260527.json` → agent-father (BLOCKED on SIG-PO-GATE)

---

## 2026-05-27T19:32:51Z

**Brief:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md` (v2.2)

Internal-consistency gap closed: F25 only replaced file-based signal reads but never stated CHEF stops consuming `get_cycle_bootstrap`'s SQLite-fed sections (buildAlertsSection/buildAnalysisSection/agent_signals). Design Point K added with three explicit rules: (K1) CHEF drops those three DB-backed sections from GATHER at Phase-3 cutover; (K2) CHEF keeps the price/macro snapshot role of get_cycle_bootstrap unchanged; (K3) the pre-redesign CHEF-ATTN diversity cap is NOT removed at F25 — it benefits non-CHEF consumers and the migration window. F25 checklist item, backlog note, invariants table, and Open Questions section all updated to reference Design Point K. Backlog claim and F25 now agree exactly.

**Signal dropped:** `docs/signals/cowork-team-daily-document-redesign-v2-20260527.json` → agent-father (updated to v2.2)

---

## 2026-05-27T18:14:09Z

**Brief:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md` (v2.1)

Two PO additions integrated into the daily-document redesign: (6) a language register boundary making all daily-doc analysis prose comprehensible Vietnamese — overriding caveman only for that surface, reconciled with token-economy skill, extending the plain-Vietnamese MARKET rule upstream to source; (7) a context-loading discipline binding audit where cowork-refactory-expert executes a post-migration flow audit pass (F36) verifying bootstrap-only reads for domain agents and language compliance, inheriting the project's waterfall-lazy-load standards. Checklist gains F36, sub-steps on F9/F12–F18/F25/F29, two new QA-gate criteria per phase, and two new sequencing constraints. All v1+v2 decisions intact.

**Signal dropped:** `docs/signals/cowork-team-daily-document-redesign-v2-20260527.json` → agent-father (updated to v2.1)

---

## 2026-05-27T18:12:13Z

**Brief:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md` (v2)

Five PO additions integrated into the cowork-team daily document redesign: delivery channel exclusivity (cron is sole MARKET sender; danger items via 30s-drain priority lane; agents keep direct work/bug send), full-at-milestone / delta-intraday push with SHA-256 fingerprint dedup via market-push-state.json, a new Watch/Attention Register (docs/attention/watch.md) for forward-looking catalysts with 8-field item schema and CHEF-managed lifecycle, a retention & compaction lifecycle (roll-up-before-prune invariant, tunable windows encoded in cowork-schedule.json, digest-predict as sole prune runner), and a one-time migration recap-then-clean (F-MIG1–F-MIG4 gated steps before legacy signal deprecation). Checklist expanded to F1–F29 + F-MIG1–F-MIG4. v1 OVERRIDE: alert-commander danger items no longer call send_telegram to market directly.

**Signal dropped:** `docs/signals/cowork-team-daily-document-redesign-v2-20260527.json` → agent-father

---

## 2026-05-27T18:01:29Z

**Brief:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md`

The cowork-team ephemeral snapshot + scattered signal-JSON model lacks day-long context and has tight delivery coupling across 7+ agents. Designed a shared daily document architecture (one file per agent per day in docs/daily/<date>/, dispatcher-written _header.md for live state, CHEF reads full folder at dish windows, domain agents use delta-read for own section only), a two-lane delivery model (postman cron drains docs/outbox/ for all non-danger output; alert-commander keeps direct send_telegram for danger — preserving alert-split), and a long-horizon recap system (digest-predict owns weekly/monthly/yearly rollups into docs/recaps/). Three-phase migration (Foundation → Parallel Run → Full Cutover) with explicit QA gates and rollback plan. 22 agent-father actions F1–F22.

**Signal dropped:** `docs/signals/cowork-team-daily-document-redesign-20260527T180129Z.json` → agent-father

---

## 2026-05-27T08:19:28Z

**Brief:** `docs/architecture-briefs/2026-05-27-plain-vietnamese-market-report.md`

chef.md Step 7 fuses TNB-analyst output (citations, layer numbers, `[gap:]` markers, Hán-Việt hexagram codes) with the user-facing MARKET message, making dishes unreadable for the non-technical sole reader. Designed a dual-output Step 7: Block A (plain 3–6 sentence Vietnamese prose → MARKET, zero citations/jargon) + Block B (`[CHEF-DETAIL]`-prefixed analyst detail → WORK, TNB-auditable). Flow-only change across 4 files — no new agents, no new cron slots, no memory overhead. tran-ngoc-bau audit path updated to read `[CHEF-DETAIL]` WORK messages for layer-walk completeness; MARKET plainness becomes a new positive audit gate.

**Signal dropped:** `docs/signals/plain-vietnamese-market-report-20260527T081928Z.json` → agent-father, cowork-refactory-expert

---

## 2026-05-24T07:33:08Z

**Brief:** `docs/architecture-briefs/2026-05-24-microservice-build-standard-promotion.md` (REVISED)

User decision: standard must be SIZE-GATED. Revised brief adds Profile Selection gate (FULL for new
apps/<svc>/, LEAN for feature on existing service), updates all three trigger points (F4 architect
Step 5, F5 dev-team Step 2, F6 microservice-main Step 0c) to emit `BUILD-STANDARD: full/lean`
instead of `required`, and trims the LEAN profile to drop the multi-role relay and per-feature
dashboard/charter — keeping only fence + sandbox/replay + honest red/green DoD driven by one
dev-<svc> agent. Lazy-load wiring (F3a/F3b) stays as single entry; standard's § 1 drives
conditional FULL charter+phases load without frontmatter bloat.

**Signal dropped:** `docs/signals/agents-architect-microservice-build-standard-promotion-20260524T073308Z.json` → agent-father (supersedes 072538Z signal)

---

## 2026-05-24T07:25:38Z

**Brief:** `docs/architecture-briefs/2026-05-24-microservice-build-standard-promotion.md`

The three-tier methodology (primitives→modules→composition root, G1–G12 DoD, sandbox security,
dashboard) existed only inside sprint-specific artefacts and was invisible to the dev-* agent
fleet and dev-team flow. Designed a permanent SSOT at docs/standards/microservice-build-standard.md,
lazy-load entries for all 12 dev-* agents (trigger: BUILD-STANDARD flag in handoff), a standard-
detection clause in architect/main.md Step 5, NEW-SERVICE/NEW-FEATURE routing rows in dev-team
Step 2, and a standard-check gate in developer/microservice-main.md Step 0c — so any future
"build X" task automatically applies the three-tier path without user prompting. Retro-audit scope
for DONE pilots routed to PO for decision.

**Signal dropped:** `docs/signals/agents-architect-microservice-build-standard-promotion-20260524T072538Z.json` → agent-father
**PO signal dropped:** `docs/signals/agents-architect-microservice-build-standard-po-retro-audit-20260524T072538Z.json` → po

---

## 2026-05-24T06:35:59Z

**Brief:** `docs/architecture-briefs/2026-05-24-fleet-size-cap-remediation.md`

Triage of 22 agent-system files over the 120 L soft cap: 5 SPLIT (genuine multi-responsibility bloat — chef.md telemetry extraction, dev-mainserver/vps-crawls research sub-flows, dev-stock-price/kinh-dich pilot-gate extractions), 14+1 JUSTIFY (coherent single-responsibility files needing only a size-justification comment), 0 LEAVE. Staged rollout: Pilot 1 = chef.md + dev-mainserver-crawls, Pilot 2 = dev-vps-crawls + pilot-gates trio.

**Signal dropped:** `docs/signals/agents-architect-fleet-size-cap-remediation-20260524T063559Z.json` → agent-father

---

## 2026-05-24T06:23:02Z

**Brief:** `docs/architecture-briefs/2026-05-24-context-bloat-backstop-hook.md`

Agents running on haiku skip advisory prune steps in skills/flows, causing governed context files (notebooks, TASKS.md) to blow past their line caps and load ~50k extra tokens per cycle. Designed a deterministic PostToolUse backstop hook (Write|Edit|NotebookEdit, non-blocking || true) that classifies written files against a dedicated SSOT (`docs/data/file-size-caps.json`), measures line count only for governed paths, and drops a `context_bloat_breach` signal to claude-manager-helper for async pruning. 5 implementation files for agent-father (F1 settings.local.json, F2 new script, F3 new SSOT, F4 janitor Pass 5b, F5 janitor agent.md).

**Signal dropped:** `docs/signals/agents-architect-context-bloat-backstop-20260524T062302Z.json` → agent-father

---

## 2026-05-20T08:54:19Z

**Brief:** `docs/architecture-briefs/2026-05-20-task-lock-system.md`

Multi-session collision risk: two Claude Code sessions can fire the same cowork-slot, drain the same dashboard row, or claim the same sprint task concurrently. Designed a new `coordination.db` (7th SQLite DB, isolated from market data) with a single `task_locks` table covering three discriminated lock kinds (cowork-slot / sprint-task / dashboard-row). Race-free atomic claim via INSERT OR IGNORE + stale-steal UPDATE with WHERE expires_at < now. Four MCP tools (task_claim, task_heartbeat, task_release, task_list_held). 3-phase rollout: Phase 1 (DB + tools only) routes to agent-father for immediate implementation; Phases 2+3 (flow integration) via pm sprint tasks.

**Signal dropped:** `docs/signals/task-lock-system-20260520.json` → agent-father

---

## 2026-05-19T17:16:00Z

**Brief:** `docs/architecture-briefs/2026-05-19-system-auditor-scope-expansion.md`

Current system-auditor is blind to the 9-service Docker stack, 27 data sources, and DB write distributions — six silent failure classes from the 1953 BCTC fire exposed the gap. Designed 3 new audit dimensions (A: microservice runtime, B: data fetch integrity, C: DB write integrity), 60 concrete checks with check_ids, 3-tier cadence (30min/4h/daily 02:00 UTC), 4 typed signal shapes, and a 7-file implementation checklist for agent-father (sequence: 7d→7c→7a→7b→7e→7f).

**Signal dropped:** `docs/signals/agents-architect-system-auditor-scope-expansion.json` → agent-father

---

## 2026-05-19T15:11:38Z

**Brief:** `docs/architecture-briefs/2026-05-19-data-fusion-gap.md`

Chef dishes are ingredient-lists, not cooked narratives. Root cause: (1) only price_anomaly signals are file-materialized — news/BCTC signals travel via MCP DB only, so chef CLUSTER step is effectively single-source; (2) no canonical cross-source event model exists; (3) Step 7 WRITE DISH lacks a causal-chain synthesis requirement. Fix A (insert SYNTHESIZE step) + Fix D (per-claim citation requirement) are low-effort agent-father actions in chef.md. Fix B (file materialization) + Fix C (signal-fusion-rules.md standard) are sprint tasks for po.

**Signal dropped:** `docs/signals/agents-architect-1951e-data-fusion-brief.json` → agent-father

---

## 2026-05-19T04:50:00Z

**Brief append:** `docs/architecture-briefs/2026-05-19-cowork-tool-packages.md` §12 — Notebook Write Capability

8 of 9 cowork agents missing `Write`+`Edit` in frontmatter `tools:` field. `notebook-write` skill confirmed: agents write their own notebooks directly via `Write` (full overwrite) — no router intermediary. Additional sub-finding: `market-watcher/cycle.md` Step 5 says "APPEND ONLY" but canonical skill mandates overwrite — flow-level drift. Signal updated with 8 new agent-father actions.

**Signal updated:** `docs/signals/agents-architect-1951b-tool-packages-brief.json` → agent-father (§12 actions appended)

---

## 2026-05-19T04:25:29Z

**Brief:** `docs/architecture-briefs/2026-05-19-cowork-tool-packages.md`

Cowork tool package audit (Sprint 1951b): 10/11 agents have valid `.claude/tools/package/<agent>.md` files with correct `server="vn-market"` gateway grammar; market-analyst package is severely incomplete (7 tools used in its flow are missing from its package); anti-discovery enforcement clause is absent from the anti-hallucination skill and the tran-ngoc-bau package. Agent-father to fix 4 files; qa to validate 100% tool coverage in Phase 3.

**Signal dropped:** `docs/signals/agents-architect-1951b-tool-packages-brief.json` → agent-father

---

## 2026-05-18T21:22:22Z

**Brief:** `docs/architecture-briefs/2026-05-18-spike-1951f-fire-drift-fix.md`

Root cause of cowork-team master cron fire-drift: matcher window anchored on actual fire minute rather than nominal tick, so 7+ min CronCreate jitter slides the ±2 window past all slot targets. Option B chosen — 2-line nominal-tick rounding fix (`M = Math.floor(actualM/15)*15`) tolerates up to 14 min drift with zero adjacent-tick collision risk; unblocks 1951g (implementation) and 1951d (cutover).

**Signal dropped:** `docs/signals/agents-architect-spike-1951f-fix.json` → agent-father

---

## 2026-05-18T20:25:54Z

**Brief:** `docs/architecture-briefs/2026-05-18-cowork-team-command.md` §11 (BLOCK-1 resolution)

QA-caught dead-zone bug: chef-morning (:23), chef-eod (:37), chef-evening (:37) fall outside ±2min of any :00/:15/:30/:45 boundary; approved Decision A — realign to `15 5`, `45 8`, `45 19` — minimal touch, no window change, QA-verified dependency margins both widen (24 min → 32 min on eod/evening).

**Signal dropped:** `docs/signals/agents-architect-1951-block1-decision.json` → fixer

---

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

## 2026-05-21T17:19:22Z

**Brief:** `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md`

Three divergence seams identified between TASKS.md (plan layer), signals/DASHBOARD.md (chain-of-custody), and coordination.db task_locks (runtime atomic guard): status lag (lock state never back-propagates to TASKS.md), owner field disagreement (task_locks.owner_agent vs TASKS.md Owner column unenfored), and non-atomic edits (concurrent agents commit to same file on main with no serialization). Option B (edit-guard) ruled out — coupling coordination.db health to TASKS.md writability inverts failure priorities. Recommend Option A (janitor cron via system-auditor, zero code changes) now, Option C (task_status_echo table + echo cron, auto-fixes all 3 seams) deferred post-1959-watchdog-4 soak.

**Signal dropped:** `docs/signals/agents-architect-tasks-md-hardening-done.json` → agent-father

---

## 2026-05-21T19:09:09Z

**Brief:** `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md`

9 optimization levers across 3 phases targeting per-cycle token waste and excess MCP calls. Key findings: 3 concurrent market-hours agents (news-scout/market-watcher/alert-commander) each independently call get_cycle_bootstrap + get_macro_snapshot per 15-min tick (~168 redundant calls/trading-day); 4 agents use `trigger: startup` lazy-loads that violate the waterfall-lazy-load ban; qa notebook is 1149L (5.7× over cap); news-scout calls get_agent_signals 3× per cycle with overlapping windows. Phase 1 (agent-father only): startup-trigger fixes, notebook trim, signal payload pointers, ULTRA caveman on status pings — est. 25–35% context reduction. Phase 3 (dev-team): tick-snapshot dedup for bootstrap triplicate.

**Signal dropped:** `docs/signals/token-toolcall-economy-20260521T190909Z.json` → po

---

## 2026-05-21T19:08:39Z

**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

Sprint 1967a read-only orchestration audit: 13 findings across 6 surfaces. 5 HIGH (alertSource enum missing `legal_risk` in write_alert_verdict, verified_decision not in post_agent_signal schema, DASHBOARD stale-race on sprint close, market-watcher identity recurrence post-fix, weekly cron jobs have no retry on crash), 7 MED (cowork lock release timing, DASHBOARD unbounded growth, coverage claim drift, fire-drift guard missing, dead API_MIN_INTERVAL slots, alert-commander mcp-tools.md lazy, recurring-bug freeze no timeout). Gate: post-1965c-soak dispatch except ITEM-01/09/04 priority batch.

**Signal dropped:** `docs/signals/agents-architect-1967a-brief-done.json` → po (1967c sign-off) → pm (1967b TASK conversion)

---

## 2026-05-21T19:29:19Z

**Brief:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

Sprint 1967b canonical re-run: 22 findings across 7 surfaces (13 ratified from v1, 9 new). 6 HIGH: alertSource enum gap, verified_decision schema absent, DASHBOARD stale-race, market-watcher identity recurrence, cowork lock release timing, weekly cron no retry. 13 MED cover signal naming, DASHBOARD prune, execute-tier try/finally gaps, isRunning in finally, TASKS.md LWW, identity stanzas missing (8 agents), fire-drift guard, API_MIN_INTERVAL dead slots. 1 BCTC-gated (ITEM-13 freeze policy). 2 deferred to Sprint 1968 L-1/L-2. PM to slate 1967c.

**Signal dropped:** `docs/signals/architect-1967b-brief-done.json` → pm (1967c slate decomposition)

---

## Carry-over

- market-watcher/cycle.md Step 5 append/overwrite drift: confirm agent-father applies fix in same pass as frontmatter edit (§12c market-watcher row).
- OQ-1 through OQ-4 from §10 of 1951b brief remain open for agent-father to resolve before Phase 3 QA.
- L-1 alert-commander: verify whether 1963-MW-IDENTITY fix (agent-father 2026-05-21) already promoted mcp-tools.md to always_load — if yes, L-1 for alert-commander is a no-op.
