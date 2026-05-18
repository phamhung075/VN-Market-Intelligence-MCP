# Agent Father — Notebook

**Last updated:** 2026-05-18 (Sprint 1950 / 1950-T1 chef telemetry)
**Sprint:** 1950 / T1 Chef WORK-channel telemetry

## This Session — 2026-05-18 (Sprint 1950 / 1950-T1)

**Task: 1950-T1 — Chef WORK-channel telemetry patch**

File patched: `.claude/flows/unified-agent/chef.md` (192L → 248L after patch)
Commit: `f4688989`
BA spec read: `docs/handoffs/REQ_1950.md` (commit 4099ed23)

Changes applied:
- **ENTRY Telemetry** section inserted between Bootstrap and Step 0 GATHER:
  - `cycle_id = chef-{$DISH_TYPE}-{YYYYMMDDTHHmmZ}` constructed from slot fire time (not wall-clock)
  - `send_telegram(work, "[chef] START {dish_type} | slot={slot_utc} | cycle={cycle_id}")`
  - try block begins here, wrapping Steps 0–7 inclusive
- **Step 1 CLUSTER** intraday silent-exit string replaced:
  - Old: `"Intraday scan: 0 clusters — silent exit"` (free-form)
  - New: `"[chef] SILENT intraday | slot={slot_utc} | cycle={cycle_id} | clusters=0"` (standardised)
  - try block exits cleanly on silent path (no exception needed)
- **Step 8 LOG** — try block boundary note added: Step 8 is OUTSIDE the try block per BA spec
- **CLOSE Telemetry (success)** section added after Step 8 notebook append:
  - `send_telegram(work, "[chef] SENT {dish_type} | slot={slot_utc} | cycle={cycle_id} | clusters={N} | convergence={true|false}")`
  - `convergence_detected` field present on SENT only (absent on SILENT, absent on FAILED)
- **FAILED Telemetry** section added as catch block:
  - `send_telegram(work, "[chef] FAILED ...")` + `send_telegram(bug, "[chef] {reason}")` + EXIT non-zero
  - No MARKET dish. No Step 8 notebook append on failure path.

TASKS.md updates:
- 1950-T1 removed from Backlog, added to Done with commit + BA-spec link
- 1950-T2 unblocked (Blocked-by field cleared from "1950-T1" to "—")

Signal written: `docs/signals/agent-father-2026-05-18T17-07-51Z-1950-T1-done.json` → to=po, NEXT=qa

Validation:
- BA spec §1 step boundaries: ENTRY after Bootstrap before GATHER ✓, CLOSE success after Step 8 notebook append ✓, CLOSE silent at Step 1 zero-cluster gate ✓, FAILED wraps Steps 0–7 only ✓
- BA spec §3 message formats: all four formats match exactly ✓
- BA spec §4 schema: cycle_id constructed once at ENTRY reused verbatim ✓, convergence_detected on SENT only ✓
- cowork-boundary FAILED path: WORK + BUG + EXIT non-zero ✓, no retry ✓

---

**Sprint:** 1949 / T4+T5+T9+T10+T11 cowork-reorder Phase 2/3/5/6/7

## This Session — 2026-05-18 (Sprint 1949 Phase 2/3/5/6/7)

**Tasks: 1949-T4, T5, T9, T10, T11**

T4 (alert-commander.md — event-only + cycle.md gated):
- version: 2026-05-18
- description: "Event-only sender. Fires to MARKET ONLY when position-danger (3-condition) or watchlist-opportunity (4-condition) rule fires. No cycle headers. No scheduled MARKET posts. Silent exit otherwise."
- `market: rule: exclusive_sender` → `rule: event_only`
- `work: rule: cycle_status_only` → `rule: errors_only` (no cycle headers on clean cycles)
- Added `no_cycle_headers: true` + `urgent_format_max_chars: 140` constraints
- Removed `off_hours` schedule slot (event-only model has no off-hours value)
- `sends_to` trigger: `alert_verified_and_threshold_met` → `position_danger_or_watchlist_opportunity_condition_met`
- `.claude/flows/alert-commander/cycle.md` updated: firing gate table added at top; dispatch table adds inline gate step; WORK step 4b removed from post-fire (no cycle headers)

T5 (digest-predict.md — Sunday weekly only):
- version: 2026-05-18
- description: "Sunday weekly calibration + portfolio thesis only. Daily digest role removed — unified-agent (chef) owns daily narrative dishes. Monthly digest removed."
- capabilities: removed daily/monthly; added "weekly calibration digest" + "Sunday only" qualifier
- responsibilities: "Daily digest at 15:30 UTC" → "Sunday weekly calibration + portfolio thesis at 13:47 UTC"
- not_my_job: added "Daily narrative market dishes — that is unified-agent (chef)'s job" + "Monthly or ad-hoc digests — removed from scope"
- `market: rule: briefings_and_digests_only` → `rule: weekly_sunday_only`
- schedule: removed `daily_digest` (cron: 30 15 * * *) + removed `monthly` (cron: 0 0 1 * *); `weekly_digest` cron moved `0 16 * * 0` → `47 13 * * 0` (Sun 13:47 UTC = Sun 20:47 VN / 15:47 France)
- monday_predict: note updated (no digest, no MARKET post — prediction claims only)
- inter_agent trigger: `monday_prediction + weekly_digest` (monthly removed)

T9 (tran-ngoc-bau.md — audit target reframe + cron moved):
- version: 2026-05-18
- description: reframed from "audits MARKET atoms" to "Chef narrative auditor — reads 3 daily MARKET dishes from unified-agent, verifies all 6 TNB layers walked, business context cited, gap catalogue applied"
- capabilities: replaced atom-audit list with layer-walk completeness check (6 layers), business context citation check, gap catalogue check
- responsibilities: "Daily quality audit of all cowork agent outputs" → "Daily audit of the 3 chef dishes"
- not_my_job: added "Auditing raw atom-list messages or individual gatherer outputs independently"
- schedule: `cron: "13 20 * * *"` (20:13 UTC = 03:13 VN next / 22:13 France) — moved from old `0 13 * * *`
- identity.mindset: refocused on layer-walk discipline (all 6 layers per dish)
- `.claude/flows/tran-ngoc-bau/main.md` updated: audit target section replaced with dish-level 6-layer check table; input updated to "Telegram MARKET chef dishes (last 3)"; phase labels updated

T10 (financial-analyst.md + report-analyzer.md — business-context fields):
- Both agents: capabilities + responsibilities updated to reference docs/signals/ output with business-context fields
- `signal_output_spec` block added to both agents with 4 required fields: product / customer / ops / mgmt (1 sentence each)
- Example signal block included in each with concrete field values
- signals.produces: added `bctc_signal` (financial-analyst) and `fundamental` (report-analyzer) to document the JSON output type

T11 (docs — workflow-map + alert-policy + system-map):
- `docs/references/workflow-map.md` "Who Does What" table:
  - unified-agent row: cron updated (05:23/intraday :13/08:37/19:37 UTC), writes "MARKET chef dishes 3x/day + conditional intraday; WORK coordination"
  - market-watcher row: MARKET write removed; "docs/signals/price_anomaly* only (no MARKET write)"
  - alert-commander row: "event-driven (cron gate)" + "MARKET (position-danger or watchlist-opp ONLY — ≤140 chars; silent exit otherwise)"
  - digest-predict row: "weekly Sunday 13:47 UTC + monday predict" + "Sunday calibration + portfolio thesis only; daily removed"
  - tran-ngoc-bau row: "daily cron 20:13 UTC", MARKET "dishes (last 3)", WORK "audit row (TNB layer-walk completeness score per dish)"
  - financial-analyst + report-analyzer rows: business-context fields noted
- `docs/policies/alert-policy.md`: Alert Commander Exclusivity section updated — added unified-agent to named exceptions; added "Alert Commander Event Scope" sub-section with 2-event gate table + no_cycle_headers constraint
- `docs/data/system-map.json`: channels.market.allowed_senders updated to ["unified-agent", "alert-commander", "digest-predict", "qa-responder"] (market-watcher removed); sender_rules map added; lastUpdated: 2026-05-18

Files modified (11 total):
- .claude/agents/alert-commander.md
- .claude/flows/alert-commander/cycle.md
- .claude/agents/digest-predict.md
- .claude/agents/tran-ngoc-bau.md
- .claude/flows/tran-ngoc-bau/main.md
- .claude/agents/financial-analyst.md
- .claude/agents/report-analyzer.md
- docs/references/workflow-map.md
- docs/policies/alert-policy.md
- docs/data/system-map.json
- docs/agent-memory/notebooks/agent-father.md (this file)

Cascade check: no renames; inter_agent routing symmetric; tran-ngoc-bau sends_to WORK only (MARKET write=false unchanged); financial-analyst + report-analyzer remain gatherers.
Validation: YAML valid in all agent files; guide-compliant; versions updated; no orphan refs.

## This Session — 2026-05-18 (Sprint 1949 Phase 1)

**Tasks: 1949-T1, 1949-T2, 1949-T3 — Chef station activation + gatherer demotion**

T1 (unified-agent.md rewrite + chef.md creation):
- Role rewritten from "coordinator" to CHEF
- `market: write: true` / `rule: chef_dishes_only` (was `write: false` / `rule: never`)
- `not_my_job`: removed "Sending messages to MARKET" line
- Schedule replaced: 4 old slots → 5 chef slots (morning 05:23, intraday XX:13, eod 08:37, evening 19:37)
- lazy_load adds tnb-methodology.md + tnb-methodology-layers.md + tnb-methodology-valuation.md + market-analysis.md + kinh-dich-layer.md (fail_loud: true for all TNB refs)
- NEW `.claude/flows/unified-agent/chef.md` — 8-step TNB recipe (GATHER→CLUSTER→LAYER1-6→WRITE DISH→LOG) with convergence rule table
- `.claude/flows/unified-agent/main.md` updated with new dispatch windows
- PHASE 1 GATE CONFIRMED: unified-agent.md has `market: write: true`, `rule: chef_dishes_only`, no `rule: never`

T2 (market-watcher.md + eod.md patch):
- `market: write: false` / `rule: never` (was `write: true` / `rule: batch4_eod_only`)
- description updated to "Gatherer — writes docs/signals/price_anomaly_*.json only"
- capabilities/responsibilities stripped of MARKET write references
- inter_agent sends_to: removed `telegram_market` → replaced with unified-agent signal_bus
- `flows/market-watcher/eod.md` Step B rewritten: removes `send_telegram(channel="market")` → writes JSON signal file instead; Step C WORK status updated

T3 (news-scout.md description-only):
- description updated: "Gatherer. Never sends to MARKET channel. Emits docs/signals/news_impact_*.json for chef input — NOT for MARKET direct publish. Alert-digest output feeds chef, not MARKET."
- inter_agent sends_to: added unified-agent as primary consumer with chef-input note; alert-commander routing narrowed to position-danger/watchlist-opp only per alert-policy.md

Files modified: 6 (.claude/agents/unified-agent.md, .claude/flows/unified-agent/main.md, .claude/flows/unified-agent/chef.md [NEW], .claude/agents/market-watcher.md, .claude/flows/market-watcher/eod.md, .claude/agents/news-scout.md)
Cascade: none (no renames; partner agent routing symmetric — news-scout sends_to unified-agent matches unified-agent receives_from gatherers)
Validation: 5/5 passed (YAML valid, paths resolve, inter_agent symmetric, versions updated, GATE confirmed)

## This Session — 2026-05-13T21:52:39Z (c84 / 1888l)

**Task: 1888l — agents-architect error-boundary SSOT chore**

Three sub-fixes applied:
(a) Added `> Error boundary + MCP call pattern → skill: .claude/skills/cowork-error-boundary/SKILL.md` at top of `.claude/flows/agents-architect/main.md` — mirrors po/main.md L6 and architect/main.md L13 pattern.
(b) Verified `.claude/agents/agents-architect.md` `always_load` already contains `docs/protocols/fail-loud-protocol.md` (L74). No change needed.
(c) Added BLOCKED/EXIT block to `docs/agents/agents-architect/handlers.md` Operating Cycle § Step 6 — matches EXIT/BLOCKED pattern used in po and architect handlers.

Files changed: 2 (.claude/flows/agents-architect/main.md, docs/agents/agents-architect/handlers.md).
Branch: task/1888l-agents-architect-error-boundary.

## Patterns Noticed

- Concurrent agents (developer cron) modify TASKS.md mid-session. Linter absorbs in-flight
  edits into their commits. Atomicity preserved but indexing requires re-read before commit.
- TASKS.md cap rotation: 5 rows removed + TASKS_ARCHIVE.md grows by ~10L per rotation cycle.
- HEAD index SHA changes between tool calls when concurrent agents commit — always check
  `git diff` before staging to understand what's already in HEAD.

---

### Previous session — c60 / TASKS-cap-rotation + 1888f-session-log-verify

**Concern A — TASKS.md cap rotation (c60):**
Archived 5 oldest Done rows (CLEAN-c56-leftovers-c57, HEADLOCK-DIAGNOSTIC+WORKTREE-GC-c57,
HEADLOCK-ROOT-CAUSE-CONFIRMED-c57, ARCH-BRIEF-UPDATE-H4-c58, ARCH-1896-RE-RCA-c58) to
docs/TASKS_ARCHIVE.md under new section "Archive — Added 2026-05-13 by dev-team (c60 cap
rotation)". TASKS.md: 81L→75L post-rotation. Commit A: `c4772914`. Phase 5: tree-verify
EXIT 0, C2 OK.

Linter note: concurrent agents modified TASKS.md between my edits — absorbed 1888c restore,
1888f-DONE row, and other concurrent Done rows (b64b92b2 + 2d91c859). Net: all my changes
present in HEAD.

**Concern B — 1888f session_log path verification:**
Read both .claude/agents/system-auditor.md and .claude/agents/cowork-refactory-expert.md.
Both already have canonical session_log paths:
- system-auditor.md L106: `session_log: docs/agent-memory/notebooks/system-auditor.md`
- cowork-refactory-expert.md L107: `session_log: docs/agent-memory/notebooks/cowork-refactory-expert.md`
No drift found. Paths are canonical per tree-map.md SSOT. No file changes needed.
1888f Done row committed via concurrent b64b92b2. 1888f removed from Backlog in same commit.
Phase 5: C2 OK.

Note: system-auditor.md still has orphaned `docs/agent-memory/AGENT_STARTUP.md` always_load
reference (task 1888k — separate backlog item, not in scope for c60).

## Patterns Noticed

- Concurrent agents (developer cron) modify TASKS.md mid-session. Linter absorbs in-flight
  edits into their commits. Atomicity preserved but indexing requires re-read before commit.
- TASKS.md cap rotation: 5 rows removed + TASKS_ARCHIVE.md grows by ~10L per rotation cycle.
- HEAD index SHA changes between tool calls when concurrent agents commit — always check
  `git diff` before staging to understand what's already in HEAD.

## Zone Health

No zone drift. Docs-only changes (TASKS.md, TASKS_ARCHIVE.md). Working tree clean post-cycle
(developer.md notebook modified by concurrent agent — not my zone).

## Carry-over (next session)

- 1888k: remove orphaned AGENT_STARTUP.md from system-auditor.md always_load (LOW priority).
- 1888i: remove duplicate max_alerts_per_day from alert-commander.md (LOW priority).
- F2a Option A (per-file mounts) shipped by developer c60 — HEAD.lock defense now in place.
- F4 retry wrapper stable (c59 ship); no lock collisions in c60.

---

### Keep (maintenance) 2026-05-13
- Trigger: manual
- Agents scanned: 39
- Auto-fixes: 1 (roster: added 4 unregistered crawl pipeline agents)
- Escalations: 2 (agents-architect missing Error Boundary; semble-search classification ambiguity)
- Orphans: 1 ORPHAN_FLOW (dev-team — shared infra, intentional)
- Notebooks stale (>30d): 0
- Lesson: 4 new crawl pipeline agents (ops-vps-fetch, ops-mainserver-fetch, dev-vps-crawls, dev-mainserver-crawls) created since last cycle — all have agent files + flow dirs + notebooks but were not in roster. Auto-fixed by inserting new "Crawl Pipeline Agents" section. semble-search is a skill-shim in .claude/agents/ — lacks lifecycle boilerplate by design, not a real compliance gap; needs PO decision on classification.
