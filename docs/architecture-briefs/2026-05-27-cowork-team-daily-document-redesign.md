<!-- size-justification: 420L — full architecture brief covering 6 design-question resolutions, 3-phase migration plan, per-file agent-father instructions, and cross-agent impact table. Cannot be split without losing the holistic traceability that agent-father needs to implement this correctly in sequence. -->

# Architecture Brief — Cowork-Team Daily Document Redesign

**Date:** 2026-05-27
**Author:** agents-architect
**Status:** FINAL — ready for agent-father implementation
**Signal:** `docs/signals/cowork-team-daily-document-redesign-20260527T180129Z.json`

---

## Executive Summary (plain language)

Right now, every 15 minutes the system wakes up several agents, each agent reads a fresh snapshot of market data, does its analysis, and immediately sends its findings to Telegram. Those findings disappear — nothing builds up over the day.

The redesign gives the team a shared daily notebook. Each day, a file per agent is created at dawn. Agents read what their teammates wrote earlier in the day before adding their own section. CHEF reads everything and writes the Telegram message. Telegram delivery is moved out of the agents into a dedicated postal cron, so agents only focus on thinking. Weekly, monthly, and yearly summaries give the system long-term memory.

The three biggest user-visible improvements: agents have context on what happened earlier today before they write; CHEF produces richer messages because it can see the full day's picture; and delivery is reliable and deduplicated so there are no duplicate alerts.

---

## Problem Statement

The current architecture has three structural gaps:

**Gap 1 — Ephemeral context.** The tick snapshot (`docs/data/cycle-snapshot-<HH:MM>.json`) lives for ≤7 minutes and carries only live market numbers. It provides zero knowledge of what happened earlier in the same trading day. Each agent cycle is context-blind to its own team's prior work.

**Gap 2 — Scattered signal model.** Agent findings are written as discrete `docs/signals/*.json` files. CHEF's Step 0 GATHER reads signals from the last 24 hours, but signals are unstructured and carry no narrative context — they are machine-readable only. The result is that CHEF assembles ingredients without a meal plan.

**Gap 3 — Tight delivery coupling.** Every cowork agent calls `send_telegram` directly. Routing logic (which channel, which format, dedup) is duplicated or missing across 7+ flows. There is no deduplication, no retry, no idempotency. The alert-split principle (server=speed, commander=intelligence) is enforced only by convention.

---

## Affected Files and Agents

**Agents affected:** unified-agent (chef.md), digest-predict (weekly.md + monthly.md), cowork-team (dispatcher main.md), news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer, tran-ngoc-bau

**Skills affected:** cycle-bootstrap/SKILL.md, signal-dashboard/SKILL.md, cron-cowork-team/SKILL.md

**Data files affected:** docs/data/cowork-schedule.json

**New directories:** docs/daily/, docs/outbox/, docs/recaps/

**New cron slots:** daily-seed (07:00 VN), postman (every 5 min), weekly/monthly/yearly recaps (digest-predict)

---

## Design Question Resolutions

### A. Snapshot Removal — Token Optimization Preserved

**Decision:** The `cycle-snapshot-<HH:MM>.json` mechanism is KEPT but its role is narrowed. It continues to carry live market numbers (bootstrap + macro) exactly as it does today. Agents continue to use the Step -1 tick-snapshot check in cycle-bootstrap/SKILL.md — no change to that skill.

**New addition:** The daily `_header.md` file carries a "Live State" section that is overwritten each dispatcher tick (by the cowork-team dispatcher in Step 4.7, alongside the existing snapshot write). The header is NOT a replacement for the tick snapshot. The tick snapshot = machine-readable numbers for formula use; the `_header.md` Live State = human-readable one-paragraph situational context for narrative agents.

**Read pattern by agent:**

| Agent | Reads at cycle start |
|---|---|
| news-scout | Own section delta (last anchor) + `_header.md` Live State paragraph only |
| market-watcher | Own section delta + `_header.md` Live State paragraph only |
| financial-analyst | Own section delta + `_header.md` Live State paragraph only |
| alert-commander | Own section delta + `_header.md` Live State paragraph only + signals section of news-scout delta (for cross-agent urgency awareness) |
| report-analyzer | Own section delta + `_header.md` Live State paragraph only |
| CHEF (unified-agent) | Full day folder — all agent sections + `_header.md` (this is correct; CHEF is the synthesis role) |
| digest-predict | `_header.md` + all sections (weekly) or recap folder (monthly/yearly) |
| tran-ngoc-bau | Full day folder (audit role — reads everything) |

**Token impact vs current:** Domain agents save the overhead of reading 24h of `docs/signals/*.json` files (currently 6–20 files per cycle). They read a single delta slice of their own section (typically 10–30 lines added since last tick). CHEF reads more but replaces scattered signal file reads with one coherent folder read. Net: estimated neutral to slight reduction for domain agents; CHEF cost roughly equal to current GATHER step.

**The tick snapshot is still written by the dispatcher; agents still use it for live numbers. The daily header is additive context, not a replacement.**

---

### B. Token Growth Guard — Domain Agent Read Pattern

**Problem:** A full day folder grows to ~500 lines by EOD if all 7 agents write 60–80 lines per cycle. Reading the full folder every 15 minutes would cost ~3k tokens per domain agent per cycle — unacceptable.

**Solution — Delta-Read Protocol:**

Domain agents (all except CHEF and tran-ngoc-bau) use the existing `handoff-delta-read` skill adapted to daily files:

1. At the start of each cycle the agent reads ONLY `docs/daily/<date>/_header.md` (specifically the "Live State" section — last 10 lines of that file only, using `offset` parameter).
2. The agent reads its OWN section file using the delta-read pattern: `last_read_anchor` stored in its notebook, returns only lines appended since last read.
3. alert-commander additionally reads the tail of `docs/daily/<date>/news-scout.md` (last 20 lines) — this covers the cross-agent urgency signal need (Design Point C).
4. CHEF reads the full folder but does so only at dish windows (4 times per day for morning/intraday/eod/evening), not on every 15-min tick. CHEF is not a gatherer.

**Section anchor convention for daily files:** Each agent append begins with a `## §<HH:MM>-<agent>` heading (e.g. `## §09:15-news-scout`). This is the delta-read anchor. The agent stores `last_read_anchor` in its notebook; next cycle reads from that line forward.

**Cap on agent section size:** Each agent section file has a 200-line soft cap enforced by the PostToolUse backstop hook (existing `docs/data/file-size-caps.json` governance). CHEF receives the full file but only the last 200 lines of each section are guaranteed available for cheap reads. Older entries are archived to `docs/daily/<date>/_archive/` by CHEF during EOD dish.

---

### C. Cross-Agent "Act Now" Signalling — Thin High-Priority Lane

**Decision:** The existing `docs/signals/DASHBOARD.md` signal bus is KEPT for urgent cross-agent signals. The daily document is for analysis context; the dashboard is for urgency pokes. These are separate concerns and must not be merged.

**Boundary rule:**

| Channel | Purpose | Example |
|---|---|---|
| `docs/daily/<date>/<agent>.md` | Analysis context — what I found, what it means | news-scout writes lawsuit details + sentiment score |
| `docs/signals/DASHBOARD.md` | Urgency signal — act this cycle, not tomorrow | news-scout writes `## alert-commander` row: `news-impact / VHM lawsuit / priority=danger` |

**Implementation for news-scout → alert-commander same-cycle reaction:**

When news-scout detects a qualifying event (legal_risk, crisis_velocity, verified_chain), it:
1. Appends full analysis to its daily section (existing write path).
2. Writes a DASHBOARD signal row to `## alert-commander` section per the existing `signal-dashboard` skill — this is unchanged.
3. On the SAME tick, alert-commander is spawned in the same parallel fan-out. The DASHBOARD signal row written by news-scout in step 4 of its flow is readable by alert-commander in its stage-bootstrap step.

**No new mechanism is needed.** The DASHBOARD already serves this role. The daily document augments it with context; it does not replace it.

**Fast/event lane for danger (Design Point B delivery lane):** alert-commander retains direct `send_telegram` for `priority=danger` signals (stop-loss hits, legal risk, crisis velocity). This preserves the alert-split principle (server=speed). Only this agent keeps direct delivery. All other agents move to the postman outbox.

---

### D. Weekend Mode — Slot Specification

**Current state:** The cowork-schedule.json already restricts sub-hourly slots to `1-5` (weekdays). The off-hours slots (`*/4h`) fire on all days including Saturday/Sunday.

**Weekend behavior change:**

The `_header.md` Live State section gains a `market_open: true|false` field written by the dispatcher. This is already present as a string in the tick snapshot; it is promoted to a typed boolean in the header.

**Weekday mode** (Mon–Fri): agents track price data, append market observations, write outbox dishes.

**Weekend mode** (Sat–Sun):
- market-watcher and alert-commander: skip price tracking entirely; write "next-week prep" sections covering macro developments, global market closes, calendar events.
- news-scout: continue news fetch but flag section as `[WEEKEND-PREP]` — findings go to "next-week context" section of the daily file, not the standard intraday section.
- financial-analyst: continues BCTC analysis (no market dependency) — no change.
- digest-predict (Sunday 13:47 UTC): reads the week's daily folder → `docs/daily/<YYYY-Www>/` aggregated view → writes weekly recap to `docs/recaps/weekly/<YYYY-Www>.md` + sends to MARKET channel.

**Weekend slot additions to cowork-schedule.json:**

| slot_id | cron | agent | purpose |
|---|---|---|---|
| `daily-seed` | `0 0 * * *` (00:00 UTC = 07:00 VN) | unified-agent | seed new-day template |
| `postman-drain` | `*/5 * * * *` | (new postman cron, not an agent) | drain outbox |
| `weekly-recap` | `47 13 * * 0` | digest-predict | already exists as digest-sunday |
| `monthly-recap` | `0 1 1 * *` | digest-predict | new — first of month |
| `yearly-recap` | `0 2 1 1 *` | digest-predict | new — Jan 1 |

The dispatcher's Step 4.7 header write occurs on ALL days (including weekends), so the daily folder is always seeded with a live-state header on off-hours ticks.

---

### E. Failure Modes — Fail-Safe Protocol

**Scenario 1 — Daily folder missing at agent cycle start:**
Agent reads `docs/daily/<date>/<agent>.md`. File missing (ENOENT):
1. Log: `[daily-doc] folder missing for <date> — auto-creating template`.
2. Call CHEF's daily-seed sub-flow inline (a single file create, not a full chef cycle).
3. Proceed. Never hard-stall. The auto-create produces a minimal template with only `# <date> — <agent>` and `## §template` stub heading.

This is the primary fail-safe. Any agent can auto-create its own section if missing.

**Scenario 2 — `_header.md` missing:**
Agent proceeds without the header. Log the miss. The tick snapshot (`docs/data/cycle-snapshot-*.json`) remains available as the fallback for live numbers — Step -1 of cycle-bootstrap/SKILL.md already handles this.

**Scenario 3 — Corrupt file (non-UTF8, truncated mid-line):**
The `handoff-delta-read` skill's fallback rule already handles this: anchor not found → full-read. If full-read fails → log miss + proceed without daily context. Agents do not hard-stall on daily document failures.

**Scenario 4 — Outbox not drained (postman cron down):**
Outbox files accumulate. The postman cron is idempotent: on recovery it drains all undelivered files in order. Maximum delay = postman recovery time. No message is lost. The DASHBOARD-based danger lane is unaffected (alert-commander sends directly regardless of postman state).

**Scenario 5 — CHEF daily-seed fails (00:00 UTC slot):**
Each domain agent auto-creates its own section on first write of the day (Scenario 1 fail-safe). The seed cron is an optimization, not a hard dependency. Agents self-bootstrap if seed is missing.

---

### F. Migration Path — Three Phases, No Big-Bang

**Phase 1 — Foundation (agent-father, no agent flow changes)**

Actions:
1. Create `docs/daily/` directory with `.gitkeep`.
2. Create `docs/outbox/` directory with `docs/outbox/README.md` specifying the file format.
3. Create `docs/recaps/weekly/`, `docs/recaps/monthly/`, `docs/recaps/yearly/` directories.
4. Add `docs/daily/` to `.gitignore` (ephemeral, no git commits needed — same as tick snapshots).
5. Add `docs/outbox/` to `.gitignore` (ephemeral delivery queue).
6. Add `docs/data/file-size-caps.json` entries for daily section files (200L soft cap per agent section).
7. Add `daily-seed`, `postman-drain`, `monthly-recap`, `yearly-recap` slot stubs to `docs/data/cowork-schedule.json` (enabled: false — not yet live).
8. Write `docs/standards/daily-document-spec.md` — the template specification (section layout, anchor convention, header format, outbox file format).

**Deliverable gate:** `docs/standards/daily-document-spec.md` exists and is readable. No agent flows changed yet.

---

**Phase 2 — Parallel Run (agent-father edits flows; existing system continues)**

**Order of changes:**

P2.1 — **cowork-team/flow/main.md Step 4.7:** Add header write alongside existing tick-snapshot write. Write `docs/daily/<date>/_header.md` Live State section (plain text, ~5 lines). Fail-silent if write fails (same policy as tick snapshot). Duration: one sprint.

P2.2 — **unified-agent/flow/chef.md:** Add `daily-seed` sub-flow at 00:00 UTC — creates the day's folder and per-agent stub files from template in `docs/standards/daily-document-spec.md`. CHEF continues to call `get_agent_signals` and read `docs/signals/*.json` AS BEFORE (parallel run — new path is additive only).

P2.3 — **Domain agent flows (news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer):** Add a write step at end of cycle: append current findings to `docs/daily/<date>/<agent>.md` using the section anchor convention. Agents do NOT yet read from the daily folder (avoids the token-growth problem until delta-read is wired). Telegram delivery unchanged (agents still call `send_telegram` directly during parallel run).

P2.4 — **QA gate for Phase 2:** Verify that for 5 consecutive trading days: (a) `docs/daily/<date>/` folder is created by 07:15 VN, (b) all 5 domain agent section files are populated by EOD, (c) no performance regression in cycle time (no new timeouts, drift_min stays ≤ 10).

**Rollback plan:** If any agent fails due to Phase 2 changes, the write step is the only new code path. Remove the write step and redeploy. Zero impact on Telegram delivery (unchanged). Daily folder files are gitignored, so rollback is clean.

---

**Phase 3 — Full Cutover (agent-father, after Phase 2 QA gate passes)**

**Order of changes:**

P3.1 — **Domain agents add delta-read at cycle start** (per read pattern table in Design Point A). Wire `last_read_anchor` storage into each agent's notebook write step. QA verifies read returns delta only on second cycle.

P3.2 — **Postman cron introduction:** New cron slot `postman-drain` (`*/5 * * * *`). New agent `postman` (thin, no memory) reads `docs/outbox/market/`, `docs/outbox/work/`, calls `send_telegram` per file, marks delivered. Route logic moved from agent flows to the postman. Danger lane exception: alert-commander keeps direct `send_telegram` (Design Point C — alert-split preserved).

P3.3 — **Agent flows remove direct `send_telegram` for non-danger outputs.** Agents write outbox files instead. CHEF writes to `docs/outbox/market/<ts>-chef.md`. news-scout writes to `docs/outbox/work/<ts>-news-scout.md`. alert-commander: danger signals still direct; non-danger (signal quality reports) → outbox.

P3.4 — **digest-predict weekly.md update:** Read `docs/daily/<YYYY-Www>/` aggregated view → write `docs/recaps/weekly/<YYYY-Www>.md` + outbox. Monthly and yearly flows added.

P3.5 — **Legacy signal cleanup:** `docs/signals/*.json` agent-written files (price_anomaly_*, news_impact_*, bctc_signal_*, fundamental_*) are deprecated. CHEF's GATHER step reads `docs/daily/<date>/` instead. Signal bus (`docs/signals/DASHBOARD.md`) is retained for urgent cross-agent poking — not deprecated.

P3.6 — **QA gate for Phase 3:** 10 consecutive trading days with: (a) CHEF reads full daily folder and produces richer dishes (TNB audit confirms), (b) postman drains outbox with ≤5 min latency, (c) no duplicate Telegram messages (dedup-key verified), (d) alert-commander danger lane fires directly with no postman dependency confirmed.

---

## New File: docs/standards/daily-document-spec.md (specification for agent-father to write)

This file must be created in Phase 1. It specifies:

**Folder structure:**
```
docs/daily/<YYYY-MM-DD>/
  _header.md           — Live State (overwritten each tick by dispatcher)
  _dish/               — CHEF output (one file per dish window)
  news-scout.md        — owned by news-scout, append-only
  market-watcher.md    — owned by market-watcher, append-only
  financial-analyst.md — owned by financial-analyst, append-only
  alert-commander.md   — owned by alert-commander, append-only
  report-analyzer.md   — owned by report-analyzer, append-only
  tran-ngoc-bau.md     — owned by tran-ngoc-bau, append-only
```

**Agent section append format:**
```markdown
## §HH:MM-<agent>
<agent findings — plain text, max 40 lines per append>
```

**`_header.md` Live State format:**
```markdown
# Live State — <YYYY-MM-DD> <HH:MM> UTC
market_open: true|false
regime: TIGHTENING|EASING|NEUTRAL
vn_index: <value> (<+/- delta%>)
dxy: <value>
us10y: <value>
usd_vnd: <value>
summary: <1 sentence plain Vietnamese>
```

**Outbox file format (docs/outbox/<channel>/<ts>-<agent>.md):**
```markdown
---
channel: market|work|bug
priority: danger|normal
dedup_key: <agent>-<date>-<dish_type>
delivered: false
retries: 0
---
<message body>
```

**CHEF `_dish/` output format:**
```markdown
docs/daily/<date>/_dish/<slot>.md
```
One file per CHEF dish window (morning/intraday/eod/evening). CHEF writes dish content here AND writes the outbox file. tran-ngoc-bau reads `_dish/` for audit.

---

## New Agent: postman (Phase 3)

**Type:** cowork agent (thin dispatcher, no memory notebook)
**Job:** Drain `docs/outbox/market/` and `docs/outbox/work/` → call `send_telegram` per file → mark `delivered: true` in file frontmatter → log to WORK channel summary every drain.
**Dedup:** Before sending, check `dedup_key` against last-24h delivered keys stored in `docs/data/postman-delivered.json`. Skip if already delivered.
**Retry:** Up to 3 retries on send failure. After 3 failures: move file to `docs/outbox/dead/` + write DASHBOARD bug signal.
**Danger bypass:** Files with `priority: danger` are NOT routed through postman. The agent that generates danger output sends directly (alert-commander only).
**Identity:** registered in `docs/data/cowork-schedule.json` as `postman-drain` slot; `enabled: false` until Phase 3.

---

## Impact on Existing Architecture Invariants

| Invariant | Impact |
|---|---|
| Concurrent-commit-race | **ELIMINATED for daily files.** Each agent owns exactly one file. No shared file writes. Git-ignored = no commit race. DASHBOARD writes still need the existing serialization awareness. |
| Alert-split principle | **PRESERVED.** alert-commander keeps direct `send_telegram` for danger. Postman handles non-danger. |
| Tick snapshot optimization | **PRESERVED.** Snapshot still written by dispatcher; agents still use Step -1 check in cycle-bootstrap skill. |
| Task-lock system | **UNCHANGED.** Slot locks continue to operate on cowork-slot keys. Daily file writes are not locked (one owner per file = no contention). |
| Notebook overwrite model | **UNCHANGED.** Notebooks remain full-overwrite session logs. Daily files are separate. |
| DASHBOARD signal bus | **PRESERVED AND UNCHANGED.** Used for urgent cross-agent urgency pokes. Not deprecated. |
| Signal JSON files (price_anomaly_*, etc.) | **DEPRECATED in Phase 3 only.** Kept during Phases 1+2 parallel run. |
| digest-predict Sunday weekly | **EXTENDED.** Existing Sunday slot reads daily folders. New monthly/yearly slots added. |
| tran-ngoc-bau audit | **ENHANCED.** Reads full daily folder + `_dish/` for audit. No flow refactor — just a richer context source. |

---

## Implementation Checklist for Agent-Father

Listed in strict Phase order. Each item has a single responsible output.

### Phase 1 — Foundation (no agent flows changed)

| # | Action | File |
|---|---|---|
| F1 | Create dirs: docs/daily/, docs/outbox/market/, docs/outbox/work/, docs/outbox/dead/, docs/recaps/weekly/, docs/recaps/monthly/, docs/recaps/yearly/ | git mkdir + .gitkeep |
| F2 | Add docs/daily/, docs/outbox/, docs/data/postman-delivered.json to .gitignore | .gitignore |
| F3 | Add daily section file entries to docs/data/file-size-caps.json (200L per agent section) | docs/data/file-size-caps.json |
| F4 | Add slot stubs to cowork-schedule.json: daily-seed (enabled:false), postman-drain (enabled:false), monthly-recap (enabled:false), yearly-recap (enabled:false) | docs/data/cowork-schedule.json |
| F5 | Write docs/standards/daily-document-spec.md per spec above | docs/standards/daily-document-spec.md |

### Phase 2 — Parallel Run

| # | Action | File |
|---|---|---|
| F6 | Edit cowork-team/flow/main.md Step 4.7: add _header.md write alongside tick-snapshot write | docs/agents/cowork-team/flow/main.md |
| F7 | Add daily-seed sub-flow to unified-agent/flow/: creates day folder + stub files at 00:00 UTC | docs/agents/unified-agent/flow/daily-seed.md (new) |
| F8 | Enable daily-seed slot in cowork-schedule.json | docs/data/cowork-schedule.json |
| F9 | Add end-of-cycle daily-append step to news-scout/flow/stage-log-notify.md | docs/agents/news-scout/flow/stage-log-notify.md |
| F10 | Add end-of-cycle daily-append step to market-watcher/flow/eod.md and cycle.md | docs/agents/market-watcher/flow/cycle.md + eod.md |
| F11 | Add end-of-cycle daily-append step to financial-analyst/flow/main.md | docs/agents/financial-analyst/flow/main.md |
| F12 | Add end-of-cycle daily-append step to alert-commander/flow/stage-dispatch-log.md | docs/agents/alert-commander/flow/stage-dispatch-log.md |
| F13 | Add end-of-cycle daily-append step to report-analyzer/flow (wherever session log is written) | docs/agents/report-analyzer/flow/main.md |
| F14 | Add end-of-cycle daily-append step to tran-ngoc-bau/flow/main.md | docs/agents/tran-ngoc-bau/flow/main.md |

**Phase 2 QA gate:** 5 consecutive trading days clean. PO signs off before Phase 3 starts.

### Phase 3 — Full Cutover

| # | Action | File |
|---|---|---|
| F15 | Add delta-read from daily folder to domain agent cycle-start steps (per read pattern table above); wire last_read_anchor into notebook write step for each agent | 5 agent flow files (stage-bootstrap.md per agent) |
| F16 | Write new postman agent: docs/agents/postman/init.md + docs/agents/postman/flow/main.md | 2 new files |
| F17 | Enable postman-drain slot in cowork-schedule.json | docs/data/cowork-schedule.json |
| F18 | Replace direct send_telegram (non-danger) with outbox write in: unified-agent/chef.md, news-scout/stage-log-notify.md, market-watcher/eod.md, financial-analyst/main.md, report-analyzer/main.md | 5 flow files |
| F19 | Update digest-predict/flow/weekly.md to read docs/daily/<YYYY-Www>/ folder; add monthly.md and yearly.md sub-flows | docs/agents/digest-predict/flow/weekly.md + 2 new sub-flows |
| F20 | Update unified-agent/flow/chef.md GATHER step: read docs/daily/<date>/ folder instead of docs/signals/*.json files | docs/agents/unified-agent/flow/chef.md |
| F21 | Deprecation notice in cycle-bootstrap/SKILL.md: signal file writes (price_anomaly_*, etc.) are sunset; domain agents write to daily folder instead | docs/.claude/skills/cycle-bootstrap/SKILL.md note |
| F22 | Update cowork-refactory-expert to be aware of daily-document architecture (lazy-load entry to docs/standards/daily-document-spec.md) | docs/agents/cowork-refactory-expert/init.md |

**Phase 3 QA gate:** 10 consecutive trading days clean per criteria above. User verbal confirmation.

---

## Dependencies and Sequencing Constraints

1. F5 (`daily-document-spec.md`) must exist before F7 (daily-seed sub-flow) — seed uses the template spec.
2. F7 + F8 (daily-seed slot enabled) must be live for at least one full day before F9–F14 (agent appends) — ensures folder exists before agents try to write.
3. F15 (delta-read wired) must be deployed and QA-verified before F18 (outbox cutover) — agents must be reading the daily folder before they stop writing to signals/.
4. F16 (postman agent) must be deployed and F17 (slot enabled) before F18 (non-danger delivery cutover).
5. F20 (CHEF reads daily folder) must come AFTER F9–F14 have been running long enough to produce meaningful content (minimum 3 trading days of parallel run).

---

## Open Questions (none — all resolved in this brief)

All 6 design points (A through F) are resolved above. No items are deferred to future briefs.

One watch item for agent-father: the `handoff-delta-read` skill uses `## §N-<slug>` anchors (numeric sequence). Daily section files use `## §HH:MM-<agent>` anchors (time-based). These are compatible patterns (both match `^## §`) but the skill's "locate anchor by line scan" logic works identically for both formats. No skill modification needed.

---

## Signal Dropped

`docs/signals/cowork-team-daily-document-redesign-20260527T180129Z.json` → agent-father
