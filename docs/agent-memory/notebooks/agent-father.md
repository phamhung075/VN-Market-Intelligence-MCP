# Agent Father — Notebook

**Last updated:** 2026-05-18T00:00:00Z
**Sprint:** 1949 / T1+T2+T3 cowork-reorder chef+gatherers

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
