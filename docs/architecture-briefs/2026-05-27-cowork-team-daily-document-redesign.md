<!-- size-justification: 850L — full architecture brief v2.1 covering 10 design-question resolutions (8 original + Additions 6 and 7), 7 PO additions, 3-phase migration plan, per-agent-father instructions F1–F36 + F-MIG1–F-MIG4, cross-agent impact table, Context-Loading Discipline section, and language register boundary table. Cannot be split without losing the holistic traceability that agent-father needs to implement this correctly in sequence. -->

# Architecture Brief — Cowork-Team Daily Document Redesign

**Date:** 2026-05-27
**Author:** agents-architect
**Status:** v2.1 — ready for agent-father
**Signal:** `docs/signals/cowork-team-daily-document-redesign-v2-20260527.json`

---

## v2.1 Revision Log

**What changed from v2 and why:**

| # | Area | Change | Reason |
|---|---|---|---|
| 6 | **NEW** — Language Register Boundary | Daily-document analysis prose is written in comprehensible Vietnamese. Caveman/ULTRA stays on RETURN blocks, signals, and DASHBOARD pokes only. Register boundary table added. `daily-document-spec.md` gains explicit Language rule per section. Token trade-off bounded by existing delta-read + 200L cap. | PO Addition 6: source quality governs CHEF dish quality — caveman source → lossy dish |
| 7 | **NEW** — Context-Loading Discipline (binding audit) | Every cowork agent flow review/refactor must verify minimal bootstrap (own-section delta + header only; no full-folder load except CHEF + tran-ngoc-bau). Adds: a cross-cutting § section, a sub-step on each flow-edit checklist item (F9–F17, F18, F25, F29), and Phase-2 + Phase-3 QA-gate criteria. Executor split: cowork-refactory-expert for `.md` flow rewrites; agent-father for structural/new-file edits. | PO Addition 7: lazy-load discipline must be enforced as a binding audit, not guidance |
| — | Implementation checklist | F29 gains sub-step. F9–F17, F18, F25 gain "verify minimal bootstrap" sub-step. F36 (new) = post-migration cowork-refactory-expert flow audit pass. | Reflects Additions 6 and 7 |
| — | Dependencies/Sequencing | 2 new constraints added: A6 language rule encoded in spec before flow edits; A7 flow audit runs after F18 (delta-read wired), before Phase-3 QA gate. | Reflects additions above |
| — | Impact-on-Invariants table | 2 new rows: language register boundary; context-loading discipline. | Reflects additions above |
| — | Phase-2 and Phase-3 QA gates | 2 new criteria per phase (language compliance, bootstrap verification). | Reflects Addition 7 |

---

## v2 Revision Log

**What changed from v1 and why:**

| # | Area | Change | Reason |
|---|---|---|---|
| 1 | **OVERRIDE** — Design Point C danger-lane + postman section | Cron is now the SOLE sender to the MARKET group. `alert-commander` danger items flow through a **fast-drain priority lane of the delivery cron** (30-second danger drain), NOT direct `send_telegram`. WORK and BUG channels: agents KEEP direct send for those. New postman renamed to "delivery cron" with two drain modes. | PO Addition 1: no cowork agent ever calls send_telegram to market group |
| 2 | **OVERRIDE** — Delivery cron behavior | Delivery cron pushes FULL document at scheduled dish milestones; pushes DELTA-only intraday based on fingerprint diff of last-pushed state stored in `docs/data/market-push-state.json`. Outbox frontmatter carries `push_mode: full\|delta` hint (cron respects hint but falls back to time-of-day derivation). | PO Addition 2: no re-push of whole document intraday |
| 3 | **NEW** — Watch / Attention Register | Per-agent daily `## WATCH` subsection + persistent `docs/attention/watch.md` register with 8-field item schema. CHEF consolidates OPEN items on daily-seed roll-up; agents read OPEN items relevant to their domain at cycle start. Lifecycle: open → triggered/resolved → expired. | PO Addition 3: forward-looking catalyst board |
| 4 | **NEW** — Retention & Compaction Lifecycle | Roll-up-before-prune invariant. Default windows encoded in cowork-schedule.json: daily=14d, weekly=8w, monthly=24m, yearly=indefinite. Attention register never pruned. digest-predict runs prune after writing the next compaction tier. Fail-safe: verify recap exists before deleting source files. | PO Addition 4: never prune raw data without roll-up first |
| 5 | **NEW** — One-time Migration Recap-then-Clean | Explicit gated step before v1 P3.5: generate historical month/week/day recaps FROM existing signals/*.json, notebooks, cycle-snapshot files. Verify-before-delete guard. Then clean old files. Added as F-MIG checklist items between F21 and F22. | PO Addition 5: preserve historical context as recaps before cleanup |
| — | Implementation checklist | F1–F22 (v1) expanded to F1–F35 + F-MIG1–F-MIG4 to cover all new deliverables. | Reflects additions above |
| — | Dependencies/Sequencing | 5 new constraints added for watch register, retention lifecycle, and migration recap. | Reflects additions above |
| — | Impact-on-Invariants table | 5 new rows: delivery-channel exclusivity, dedup/delta fingerprint, watch register durability, retention lifecycle, migration-recap guard. | Reflects additions above |

---

## Executive Summary (plain language)

Right now, every 15 minutes the system wakes up several agents, each agent reads a fresh snapshot of market data, does its analysis, and immediately sends its findings to Telegram. Those findings disappear — nothing builds up over the day.

The redesign gives the team a shared daily notebook. Each day, a file per agent is created at dawn. Agents read what their teammates wrote earlier in the day before adding their own section. CHEF reads everything and writes the Telegram message. Telegram delivery is moved out of the agents into a dedicated delivery cron, so agents only focus on thinking. Weekly, monthly, and yearly summaries give the system long-term memory.

**v2 adds four further improvements:** (1) Only the delivery cron ever pushes to the user MARKET group — no cowork agent reaches that channel directly, including danger alerts (which go through a fast-drain priority lane). (2) The delivery cron sends full documents only at scheduled dish windows; intraday it pushes only what changed since the last push. (3) A new Watch / Attention Register lets agents flag future catalysts (earnings dates, pending rulings, price levels to watch) so they carry forward across days and drive focus in future cycles. (4) The retention lifecycle is fully specified with roll-up-before-prune invariants and tunable windows, so the system never loses data that has not yet been summarised.

**v2.1 adds two further improvements:** (5) All analysis prose that agents write into the daily document is written in plain, comprehensible Vietnamese — not caveman shorthand, not analyst jargon. This makes CHEF's source material already readable, so dishes are selections from clear text rather than reconstructions from compressed shorthand. (6) Every cowork agent's context-loading pattern is formally audited and must follow the project's existing lazy-load discipline — bootstrap only what is needed (own section delta + header); no agent loads the full daily folder except CHEF and tran-ngoc-bau.

The five biggest user-visible improvements: agents have context on what happened earlier today before they write; CHEF produces richer messages because it can see the full day's picture; delivery is reliable and deduplicated; intraday pushes are change-only (no noise); and future catalysts are tracked and surfaced automatically.

---

## Problem Statement

The current architecture has three structural gaps:

**Gap 1 — Ephemeral context.** The tick snapshot (`docs/data/cycle-snapshot-<HH:MM>.json`) lives for ≤7 minutes and carries only live market numbers. It provides zero knowledge of what happened earlier in the same trading day. Each agent cycle is context-blind to its own team's prior work.

**Gap 2 — Scattered signal model.** Agent findings are written as discrete `docs/signals/*.json` files. CHEF's Step 0 GATHER reads signals from the last 24 hours, but signals are unstructured and carry no narrative context — they are machine-readable only. The result is that CHEF assembles ingredients without a meal plan.

**Gap 3 — Tight delivery coupling.** Every cowork agent calls `send_telegram` directly. Routing logic (which channel, which format, dedup) is duplicated or missing across 7+ flows. There is no deduplication, no retry, no idempotency. The alert-split principle (server=speed, commander=intelligence) is enforced only by convention.

**Gap 4 (v2) — No forward-looking catalyst tracking.** Agents identify time-sensitive future events (earnings calls, pending rulings, price-level watches) but have no persistent structure to carry those forward. Each cycle is also backward-blind to the previous cycle's forward flags.

**Gap 5 (v2) — No retention lifecycle.** Raw daily/signal files accumulate without a defined roll-up-then-prune policy. Historical data is either never cleaned (storage bloat) or cleaned before being summarised (data loss risk).

**Gap 6 (v2.1) — Compressed source language degrades dish quality.** If agents write analysis prose in caveman / ULTRA shorthand (the default agent-to-agent register), CHEF must reconstruct meaning from compressed notation. This introduces a lossy translation step where none should exist. The daily document is the direct source for CHEF synthesis; it must be written in the same plain Vietnamese the user will ultimately read.

**Gap 7 (v2.1) — Context-loading not audited after redesign.** The read-pattern table in Design Points A and B specifies minimal bootstrap per agent, but nothing enforces it. Without a binding audit pass, flow rewrites may inadvertently load the full daily folder for domain agents, bloating per-cycle token cost.

---

## Affected Files and Agents

**Agents affected:** unified-agent (chef.md), digest-predict (weekly.md + monthly.md), cowork-team (dispatcher main.md), news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer, tran-ngoc-bau, **cowork-refactory-expert** (flow audit executor for Additions 7)

**Skills affected:** cycle-bootstrap/SKILL.md, signal-dashboard/SKILL.md, cron-cowork-team/SKILL.md

**Data files affected:** docs/data/cowork-schedule.json, docs/data/file-size-caps.json

**New directories:** docs/daily/, docs/outbox/, docs/recaps/, docs/attention/

**New data files:** docs/data/market-push-state.json, docs/data/delivery-cron-delivered.json

**New cron slots:** daily-seed (07:00 VN), delivery-cron-danger (30-second poll, danger priority lane), delivery-cron-normal (every 5 min), weekly/monthly/yearly recaps (digest-predict)

---

## Design Question Resolutions

### A. Snapshot Removal — Token Optimization Preserved

**Decision:** The `cycle-snapshot-<HH:MM>.json` mechanism is KEPT but its role is narrowed. It continues to carry live market numbers (bootstrap + macro) exactly as it does today. Agents continue to use the Step -1 tick-snapshot check in cycle-bootstrap/SKILL.md — no change to that skill.

**New addition:** The daily `_header.md` file carries a "Live State" section that is overwritten each dispatcher tick (by the cowork-team dispatcher in Step 4.7, alongside the existing snapshot write). The header is NOT a replacement for the tick snapshot. The tick snapshot = machine-readable numbers for formula use; the `_header.md` Live State = human-readable one-paragraph situational context for narrative agents.

**Read pattern by agent:**

| Agent | Reads at cycle start |
|---|---|
| news-scout | Own section delta (last anchor) + `_header.md` Live State paragraph only + OPEN watch items relevant to news domain |
| market-watcher | Own section delta + `_header.md` Live State paragraph only + OPEN watch items relevant to price/technical domain |
| financial-analyst | Own section delta + `_header.md` Live State paragraph only + OPEN watch items relevant to BCTC/fundamentals domain |
| alert-commander | Own section delta + `_header.md` Live State paragraph only + signals section of news-scout delta (for cross-agent urgency awareness) + OPEN danger-priority watch items |
| report-analyzer | Own section delta + `_header.md` Live State paragraph only |
| CHEF (unified-agent) | Full day folder — all agent sections + `_header.md` + ALL OPEN watch items (this is correct; CHEF is the synthesis role) |
| digest-predict | `_header.md` + all sections (weekly) or recap folder (monthly/yearly) + OPEN watch items (weekly only) |
| tran-ngoc-bau | Full day folder (audit role — reads everything including `## WATCH` subsections) |

**Token impact vs current:** Domain agents save the overhead of reading 24h of `docs/signals/*.json` files (currently 6–20 files per cycle). They read a single delta slice of their own section (typically 10–30 lines added since last tick) plus a filtered tail of the watch register (≤20 lines of OPEN items for their domain). CHEF reads more but replaces scattered signal file reads with one coherent folder read. Net: estimated neutral to slight reduction for domain agents; CHEF cost roughly equal to current GATHER step.

**The tick snapshot is still written by the dispatcher; agents still use it for live numbers. The daily header is additive context, not a replacement.**

---

### B. Token Growth Guard — Domain Agent Read Pattern

**Problem:** A full day folder grows to ~500 lines by EOD if all 7 agents write 60–80 lines per cycle. Reading the full folder every 15 minutes would cost ~3k tokens per domain agent per cycle — unacceptable.

**Solution — Delta-Read Protocol:**

Domain agents (all except CHEF and tran-ngoc-bau) use the existing `handoff-delta-read` skill adapted to daily files:

1. At the start of each cycle the agent reads ONLY `docs/daily/<date>/_header.md` (specifically the "Live State" section — last 10 lines of that file only, using `offset` parameter).
2. The agent reads its OWN section file using the delta-read pattern: `last_read_anchor` stored in its notebook, returns only lines appended since last read.
3. alert-commander additionally reads the tail of `docs/daily/<date>/news-scout.md` (last 20 lines) — this covers the cross-agent urgency signal need (Design Point C).
4. Domain agents read a filtered tail of `docs/attention/watch.md` — OPEN items matching their domain tag only (last 20 lines of that domain's section, or a grep on domain tag). This is a one-time read at cycle start, not per-append.
5. CHEF reads the full folder but does so only at dish windows (4 times per day for morning/intraday/eod/evening), not on every 15-min tick. CHEF is not a gatherer.

**Section anchor convention for daily files:** Each agent append begins with a `## §<HH:MM>-<agent>` heading (e.g. `## §09:15-news-scout`). This is the delta-read anchor. The agent stores `last_read_anchor` in its notebook; next cycle reads from that line forward.

**Cap on agent section size:** Each agent section file has a 200-line soft cap enforced by the PostToolUse backstop hook (existing `docs/data/file-size-caps.json` governance). CHEF receives the full file but only the last 200 lines of each section are guaranteed available for cheap reads. Older entries are archived to `docs/daily/<date>/_archive/` by CHEF during EOD dish.

---

### C. Delivery Channel Exclusivity — Cron-Only MARKET Push (OVERRIDES v1 Design Point C)

**v1 decision overridden:** v1 allowed alert-commander to call `send_telegram(channel="market")` directly for `priority=danger` signals. This is revoked. The MARKET group is cron-exclusive.

**Rule:** No cowork agent ever calls `send_telegram(channel="market")` under any circumstance. The delivery cron is the SOLE sender to the user MARKET group.

**Alert-split tension resolution:**

| Signal type | Who sends | How |
|---|---|---|
| Stop-loss / price trigger | **alert-engine microservice (Go server)** | Direct `send_telegram` — this is the server-side speed path; it is NOT a cowork agent and is unaffected by this rule |
| Danger item from alert-commander (legal_risk, crisis_velocity, verified_chain) | **danger-drain lane of delivery cron** | alert-commander writes to `docs/outbox/market/danger/<ts>-alert-commander.md`; danger drain runs every **30 seconds** (not 5 min); latency ≤30s |
| Normal dish (CHEF morning/eod/evening/intraday) | **normal-drain lane of delivery cron** | Delivery cron drains `docs/outbox/market/normal/` every **5 minutes** |

**WORK and BUG channels:** Agents KEEP direct `send_telegram` for work and bug channels. Only the user-facing MARKET group is cron-exclusive. Rationale: work/bug are operational channels not seen by the non-technical user; latency sensitivity and simplicity favour keeping direct send for those.

**Implementation detail — two-lane delivery cron:**

The delivery cron is a single cron process (not an agent) with two internal loops:
- Danger loop: `*/30s` poll of `docs/outbox/market/danger/`; sends immediately on file present; marks `delivered: true`.
- Normal loop: `*/5 * * * *` poll of `docs/outbox/market/normal/`; applies the dedup/delta logic described in Design Point D before sending.

**Failure mode (cron down):** Outbox files accumulate. On cron recovery: danger lane drains first in FIFO order, then normal lane. Maximum danger delay = cron recovery time. The alert-engine server-side stop-loss path is independent and unaffected.

---

### D. Delivery Content Rule — Full at Milestones, Delta Intraday (NEW — v2 Addition 2)

**Rule:** At scheduled daily dish windows (CHEF morning / intraday / eod / evening), the delivery cron pushes the COMPLETE synthesized document/dish. During market hours, when state changes, the cron pushes ONLY the delta since the last MARKET-group push.

**Fingerprint / state mechanism:**

The delivery cron maintains `docs/data/market-push-state.json`:

```json
{
  "last_pushed_at": "<ISO timestamp>",
  "last_pushed_fingerprint": "<sha256 of last sent body>",
  "last_pushed_dedup_key": "<agent>-<date>-<dish_type>",
  "last_pushed_slot": "morning|intraday|eod|evening|danger",
  "push_count_today": 0
}
```

**Dedup / delta logic (normal lane):**

1. Cron reads next outbox file from `docs/outbox/market/normal/`.
2. Checks outbox frontmatter `push_mode` field:
   - `push_mode: full` → send the full body, update state file, skip fingerprint check.
   - `push_mode: delta` → compute SHA-256 of body; compare to `last_pushed_fingerprint`. If identical: delete outbox file, push NOTHING (no change). If different: compute textual diff between previous body and new body (or if previous body unavailable, send full). Send delta only.
3. Update `docs/data/market-push-state.json` after every successful send.

**push_mode hint in outbox frontmatter:** Agents and CHEF set the `push_mode` field when writing to outbox:
- CHEF at dish windows (morning/intraday/eod/evening): `push_mode: full`
- CHEF or market-watcher writing an intraday state change: `push_mode: delta`
- alert-commander writing a danger item: always in danger lane (no push_mode needed — danger lane always sends full content of the alert)

If `push_mode` is absent from frontmatter, the cron derives it from slot type + time-of-day: dish-window files (dedup_key contains `morning|intraday-dish|eod|evening`) → `full`; all other intraday files → `delta`.

**Unchanged intraday tick with no new data:** Domain agents that find nothing new should NOT write an outbox file. CHEF only writes to outbox at dish windows. This avoids generating zero-delta outbox files in the first place.

---

### E. Watch / Attention Register (NEW — v2 Addition 3)

**Purpose:** Track forward-looking catalysts so future agent cycles focus attention on known upcoming events. Distinct from: (a) the 30-ticker user watchlist (holdings), (b) daily section files (what happened today), (c) recaps (what happened in the past).

**Per-agent daily write path (no write-race):**

Each agent's daily section file gains a dedicated `## WATCH` subsection, written by the owning agent as part of its normal cycle-end append. Example:

```markdown
## §09:15-news-scout
[... normal analysis ...]

## WATCH §09:15-news-scout
- id: W-20260527-NS-001 | flagged_by: news-scout | flagged_date: 2026-05-27 | what: VHM lawsuit ruling pending | why: outcome affects 45b VND land parcel valuation | trigger: ruling date or VHM price ±5% | priority: high | status: open | domain: legal/VHM
```

Each WATCH item must include all 8 schema fields: `id · flagged_by · flagged_date · what_to_watch · why · trigger · priority · status`.

**Persistent register path:** `docs/attention/watch.md`

This file is NOT gitignored (unlike daily/ and outbox/). It persists across days and is committed normally. It is never pruned by retention rules — only by item-status resolution.

**CHEF consolidation at daily-seed:**

During the daily-seed roll-up (00:00 UTC), CHEF:
1. Reads all `## WATCH` subsections from the PREVIOUS day's agent section files.
2. Merges new OPEN items into `docs/attention/watch.md`.
3. Deduplicates by `id`. Updates `status` of items that were marked triggered/resolved/expired by any agent during the prior day.
4. Writes a `## Today's Catalysts` section into the new day's `_header.md` — a plain-text list of OPEN watch items with trigger dates ≤7 days out, sorted by priority.
5. Auto-expires items where `trigger` date has passed by >3 days without being marked triggered/resolved — moves status to `expired`.

**Read pattern at cycle start (watch register):**

| Agent | What it reads from watch.md |
|---|---|
| news-scout | OPEN items with domain tag `news`, `legal`, `macro` |
| market-watcher | OPEN items with domain tag `price`, `technical`, `macro` |
| financial-analyst | OPEN items with domain tag `bctc`, `fundamental` |
| alert-commander | ALL OPEN items with priority `high` or `danger` |
| CHEF | ALL OPEN items (full register scan at dish windows) |
| digest-predict | ALL OPEN items (weekly dish — summarise what triggered/resolved this week) |

**Lifecycle:**

- `open` → normal state; carried forward each day by CHEF seed step.
- `triggered` → owning agent (or CHEF) marks triggered when the trigger condition fires. That item feeds into the day's analysis section AND is highlighted in CHEF's next dish. After appearing in a dish, status → `resolved`.
- `resolved` → item no longer appears in OPEN filter. Stays in register as historical record indefinitely (not pruned).
- `expired` → auto-set by CHEF seed step when trigger date is >3 days past without trigger. Logged to WORK channel.

**Watch register format (`docs/attention/watch.md`):**

```markdown
# Attention Register

_Last consolidated: <YYYY-MM-DD> by CHEF daily-seed_

## OPEN

| id | flagged_by | flagged_date | what_to_watch | why | trigger | priority | status | domain |
|---|---|---|---|---|---|---|---|---|
| W-20260527-NS-001 | news-scout | 2026-05-27 | VHM lawsuit ruling | 45b VND land parcel | ruling date or ±5% price | high | open | legal/VHM |

## TRIGGERED / RESOLVED

(items moved here after resolution)

## EXPIRED

(items auto-expired by CHEF seed step)
```

---

### F. Retention & Compaction Lifecycle (NEW — v2 Addition 4)

**Invariant:** NEVER prune a raw data file until its content has been rolled up into the next compaction tier. Roll-up direction: day → week → month → year.

**Default retention windows** (encoded in `docs/data/cowork-schedule.json` under a `retention` key — tunable without code changes):

| Tier | Default retention | Who prunes | When |
|---|---|---|---|
| Daily files (`docs/daily/<date>/`) | 14 days | digest-predict | After writing the WEEKLY recap, prune day files older than 14d |
| Weekly recaps (`docs/recaps/weekly/`) | 8 weeks | digest-predict | After writing the MONTHLY recap, prune weekly files older than 8w |
| Monthly recaps (`docs/recaps/monthly/`) | 24 months | digest-predict | After writing the YEARLY recap, prune monthly files older than 24m |
| Yearly recaps (`docs/recaps/yearly/`) | Indefinitely | Never pruned | — |
| `docs/attention/watch.md` | Never pruned | Only by item-status (resolved/expired keeps record) | — |
| `docs/signals/DASHBOARD.md` | Unchanged (existing prune policy) | system-auditor (existing) | — |

**Fail-safe order (mandatory for all prune steps):**

1. Write the next-tier recap file to its final path.
2. Verify the file exists and is non-empty (`stat` check — if zero bytes: ABORT prune, log to WORK, retry next cycle).
3. Only after step 2 passes: delete the lower-tier source files.

**WHO runs the prune:** digest-predict is the sole prune runner. It runs prune as the last step of each recap slot:
- Weekly recap slot (Sunday): after writing `docs/recaps/weekly/<YYYY-Www>.md` → prune day files older than 14d.
- Monthly recap slot (1st of month): after writing `docs/recaps/monthly/<YYYY-MM>.md` → prune weekly files older than 8w.
- Yearly recap slot (Jan 1): after writing `docs/recaps/yearly/<YYYY>.md` → prune monthly files older than 24m.

**Retention config location:** `docs/data/cowork-schedule.json` gains a top-level `"retention"` object:

```json
"retention": {
  "daily_days": 14,
  "weekly_weeks": 8,
  "monthly_months": 24,
  "yearly": "indefinite",
  "attention_register": "never_prune",
  "prune_runner": "digest-predict",
  "fail_safe": "verify_recap_before_delete"
}
```

---

### G. Failure Modes — Fail-Safe Protocol

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

**Scenario 4 — Outbox not drained (delivery cron down):**
Outbox files accumulate. The delivery cron is idempotent: on recovery it drains danger lane first (FIFO), then normal lane. Maximum delay = cron recovery time. No message is lost. The alert-engine server-side stop-loss path is independent and unaffected.

**Scenario 5 — CHEF daily-seed fails (00:00 UTC slot):**
Each domain agent auto-creates its own section on first write of the day (Scenario 1 fail-safe). The seed cron is an optimization, not a hard dependency. Agents self-bootstrap if seed is missing. Watch register consolidation is deferred to the next successful seed run.

**Scenario 6 — watch.md unavailable at cycle start:**
Agent proceeds without watch items. Log the miss. Never hard-stall. Watch items are forward-context enhancement only, not a hard dependency for analysis.

**Scenario 7 — Prune step fails (recap not verified before delete):**
Fail-safe: abort delete. Log to WORK. digest-predict retries on the next recap slot. Source files are never deleted in an uncertain state.

---

### H. Migration Path — Three Phases, No Big-Bang

**Phase 1 — Foundation (agent-father, no agent flow changes)**

Actions:
1. Create `docs/daily/`, `docs/outbox/market/danger/`, `docs/outbox/market/normal/`, `docs/outbox/work/`, `docs/outbox/dead/`, `docs/recaps/weekly/`, `docs/recaps/monthly/`, `docs/recaps/yearly/`, `docs/attention/` directories with `.gitkeep`.
2. Add `docs/daily/` and `docs/outbox/` to `.gitignore` (ephemeral, no git commits needed). `docs/attention/` is NOT gitignored.
3. Add `docs/data/file-size-caps.json` entries for daily section files (200L per agent section).
4. Add slot stubs to `docs/data/cowork-schedule.json`: `daily-seed` (enabled:false), `delivery-cron-danger` (enabled:false), `delivery-cron-normal` (enabled:false), `monthly-recap` (enabled:false), `yearly-recap` (enabled:false). Add `retention` config object (see Design Point F).
5. Write `docs/standards/daily-document-spec.md` per spec below. **The spec must include explicit Language rules per section (see Design Point I — Language Register Boundary).**
6. Create `docs/attention/watch.md` with empty template (OPEN / TRIGGERED-RESOLVED / EXPIRED sections).
7. Create `docs/data/market-push-state.json` with zeroed initial state.
8. Create `docs/data/delivery-cron-delivered.json` as empty `{}`.

**Deliverable gate:** `docs/standards/daily-document-spec.md` and `docs/attention/watch.md` exist and are readable. No agent flows changed yet.

---

**Phase 2 — Parallel Run (agent-father edits flows; existing system continues)**

**Order of changes:**

P2.1 — **cowork-team/flow/main.md Step 4.7:** Add header write alongside existing tick-snapshot write. Write `docs/daily/<date>/_header.md` Live State section (plain text, ~5 lines). Fail-silent if write fails (same policy as tick snapshot). Duration: one sprint.

P2.2 — **unified-agent/flow/chef.md:** Add `daily-seed` sub-flow at 00:00 UTC — creates the day's folder and per-agent stub files from template in `docs/standards/daily-document-spec.md`. Seed also initialises the `## Today's Catalysts` header section by reading OPEN items from `docs/attention/watch.md`. CHEF continues to call `get_agent_signals` and read `docs/signals/*.json` AS BEFORE (parallel run — new path is additive only).

P2.3 — **Domain agent flows (news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer):** Add a write step at end of cycle: append current findings to `docs/daily/<date>/<agent>.md` using the section anchor convention, INCLUDING a `## WATCH` subsection if the agent identified any forward-looking items. **All analysis prose in this write step is written in comprehensible Vietnamese (see Design Point I).** Agents do NOT yet read from the daily folder (avoids the token-growth problem until delta-read is wired). Telegram delivery unchanged (agents still call `send_telegram` directly during parallel run).

P2.4 — **QA gate for Phase 2:** Verify that for 5 consecutive trading days: (a) `docs/daily/<date>/` folder is created by 07:15 VN, (b) all 5 domain agent section files are populated by EOD, (c) `## WATCH` subsections appear where agents found forward items, (d) no performance regression in cycle time (no new timeouts, drift_min stays ≤ 10), **(e) at least 3 sampled agent sections read as plain Vietnamese with no caveman notation or jargon symbols**, **(f) no domain agent flow loads the full daily folder (verify by inspection of flow read steps — own-section delta + header only).**

**Rollback plan:** If any agent fails due to Phase 2 changes, the write step is the only new code path. Remove the write step and redeploy. Zero impact on Telegram delivery (unchanged). Daily folder files are gitignored, so rollback is clean.

---

**Phase 3 — Full Cutover (agent-father, after Phase 2 QA gate passes)**

**Order of changes:**

P3.1 — **Domain agents add delta-read at cycle start** (per read pattern table in Design Point A). Wire `last_read_anchor` storage into each agent's notebook write step. Add filtered watch-register read (OPEN items for domain). QA verifies read returns delta only on second cycle.

P3.2 — **Delivery cron introduction:** Two internal loops (danger: 30s, normal: 5 min). Reads `docs/outbox/market/danger/` and `docs/outbox/market/normal/`. Applies dedup/delta logic from Design Point D. Updates `docs/data/market-push-state.json` after each send. Dedup check against `docs/data/delivery-cron-delivered.json` (last-24h delivered keys). Retry up to 3×; after 3 failures: move to `docs/outbox/dead/` + write DASHBOARD bug signal. Enable `delivery-cron-danger` and `delivery-cron-normal` slots in cowork-schedule.json.

P3.3 — **Agent flows remove ALL direct `send_telegram` for market-channel output.** Agents write outbox files instead. CHEF writes to `docs/outbox/market/normal/<ts>-chef.md` with `push_mode: full` at dish windows. alert-commander writes danger items to `docs/outbox/market/danger/<ts>-alert-commander.md` (no push_mode needed). Agents keep direct `send_telegram` for work and bug channels.

P3.4 — **digest-predict weekly.md update:** Read `docs/daily/<YYYY-Www>/` aggregated view → write `docs/recaps/weekly/<YYYY-Www>.md` + outbox (normal lane). After writing and verifying recap: run prune (daily files >14d). Add monthly.md and yearly.md sub-flows with same pattern. Enable monthly-recap and yearly-recap slots.

P3.5 — **CHEF daily-seed: watch consolidation.** Add consolidation step: merge prior day's `## WATCH` subsections into `docs/attention/watch.md`. Auto-expire stale items. Write `## Today's Catalysts` section to new day's `_header.md`.

P3.6 — **One-time Migration Recap (see F-MIG steps below).** This step PRECEDES P3.7.

P3.7 — **Legacy signal cleanup:** `docs/signals/*.json` agent-written files (price_anomaly_*, news_impact_*, bctc_signal_*, fundamental_*) are deprecated. CHEF's GATHER step reads `docs/daily/<date>/` folder instead. Signal bus (`docs/signals/DASHBOARD.md`) is retained for urgent cross-agent poking — not deprecated.

P3.8 — **QA gate for Phase 3:** 10 consecutive trading days with: (a) CHEF reads full daily folder and produces richer dishes (TNB audit confirms), (b) delivery cron drains outbox — danger lane ≤30s latency, normal lane ≤5 min latency, (c) no duplicate Telegram MARKET messages (dedup-key verified), (d) alert-engine server-side stop-loss fires independently with no delivery-cron dependency confirmed, (e) watch register accumulates items and CHEF surfaces them in dishes, (f) retention prune runs at least one weekly cycle with verify-before-delete confirmed, **(g) spot-check 5 daily document sections across 3 agents: all prose in plain Vietnamese, zero caveman notation**, **(h) no domain agent flow loads the full daily folder — delta-read returns delta-only on second cycle verified by inspection.**

---

### I. Language Register Boundary (NEW — v2.1 Addition 6)

**Problem:** The cowork system's default agent-to-agent communication register is caveman/ULTRA (token-economy skill). If agents write their daily-document analysis prose in caveman, CHEF synthesises dishes from compressed shorthand rather than readable text — a lossy reconstruction step. This brief corrects that by drawing an explicit register boundary.

**Register boundary table:**

| Surface | Register |
|---|---|
| Daily document analysis prose — agent section content (paragraphs under `## §HH:MM-<agent>`), WATCH item `what_to_watch`/`why` fields, CHEF `_dish/` output prose | **Comprehensible Vietnamese — plain sentences, no caveman shorthand, no σ/bp/Layer#/hexagram-term jargon** |
| RETURN blocks, DASHBOARD urgency pokes, signal rows, and other agent-to-agent machine comms | **Caveman/ULTRA stays** — PO never reads these surfaces |
| Structural/machine fields — section anchors (`## §HH:MM-agent`), `_header.md` key:value live-state lines, watch-item schema fields (id/flagged_by/flagged_date/trigger/priority/status/domain), outbox frontmatter | **Unchanged** — these are machine fields, not prose |

**Rationale for the token trade-off:** The cost of writing prose rather than caveman is bounded by the existing delta-read pattern (domain agents write ≤40 lines per append, Section B cap) and the 200-line section cap enforced by the PostToolUse backstop hook. Full-folder reads are restricted to CHEF and tran-ngoc-bau. Therefore fidelity wins without blowing up token cost.

**Reconciliation with token-economy skill:** The `token-economy` skill (`docs/skills/token-economy/SKILL.md`) governs agent-to-agent RETURN signals, DASHBOARD pokes, and notebook entries. This brief creates a single documented exception: the daily-document analysis prose surface. That exception must be stated explicitly in `docs/standards/daily-document-spec.md` so any agent reading the spec understands the register override without needing to hold both the spec and the token-economy skill in context simultaneously.

**Cross-reference:** The plain-Vietnamese MARKET rule in `feedback_market_report_plain_vietnamese` (memory, 2026-05-27) governs CHEF's final dish output to the user. This addition extends that principle **upstream** to the source document that CHEF reads — so the chain from analysis prose → dish synthesis is already plain Vietnamese end-to-end, with no jargon-to-plain translation required at the synthesis step.

**Where to encode this:**

1. `docs/standards/daily-document-spec.md` — the "Section-write format" block gains a `Language:` field: `Language: comprehensible Vietnamese — plain sentences, no caveman, no σ/bp/Layer#/hexagram terms`.
2. Each domain agent flow's daily-append write step (F12–F17) gets a note: `Prose in comprehensible Vietnamese (see daily-document-spec.md § Language)`.
3. This register boundary table appears in this brief as the authoritative cross-reference for agent-father and cowork-refactory-expert.

---

### J. Context-Loading Discipline (NEW — v2.1 Addition 7 — Cross-Cutting Constraint)

**Rule:** Every cowork agent flow that is created or modified as part of this redesign MUST follow the project's existing lazy-load discipline. No new standard is introduced — this section binds the existing standards to the daily-document flow audit.

**Inherited standards (cite these, do not re-invent):**

- **Waterfall lazy-load rules** (`feedback_waterfall_lazy_load` memory, encoded in `docs/agents/*/init.md` and flow files): no `trigger: startup`; notebooks ≤200 lines; `always_load` items must have explicit justification; every flow read step is guarded (fail-silent or fail-loud per the file's criticality).
- **CLAUDE.md lazy-load pattern** (`CLAUDE.md § Defaults — lazy-load`): bootstrap only what is needed for the current task; defer everything else to the step that actually needs it.
- **Architect read-pattern table** (Design Point A of this brief): domain agents load own-section delta + `_header.md` Live State only; full-folder load is reserved exclusively for CHEF (at dish windows) and tran-ngoc-bau (audit role).

**Bootstrap-only rule (binding):**

Domain agents (news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer) MUST NOT load the full daily folder at any cycle step. Their maximum bootstrap is:
1. `_header.md` Live State section (last 10 lines, `offset` parameter).
2. Own section delta (lines since `last_read_anchor`).
3. Filtered watch.md OPEN items (domain-tagged, ≤20 lines).
4. alert-commander only: tail of news-scout.md (last 20 lines).

Loading the full folder by a domain agent is a context-bloat violation equivalent to a `trigger: startup` load — it must be caught in the flow audit (F36) and blocked before merge.

**Executor ownership:**

| Task type | Executor |
|---|---|
| Cowork agent `.md` flow rewrites and bootstrap-compliance audit | **cowork-refactory-expert** |
| New file creation, structural edits to agent init files, new skill entries | **agent-father** |

**Where this applies in the checklist:** Every checklist item that touches a cowork agent flow (F9, F10, F12, F13, F14, F15, F16, F17, F18, F25, F29, F36) carries a sub-step: "verify minimal bootstrap (own-section delta + header only; no full-folder load) before marking done." See checklist below.

---

## New File: docs/standards/daily-document-spec.md (specification for agent-father to write)

This file must be created in Phase 1. It specifies:

**Folder structure:**
```
docs/daily/<YYYY-MM-DD>/
  _header.md           — Live State + Today's Catalysts (overwritten each tick by dispatcher; seed step writes Catalysts section)
  _dish/               — CHEF output (one file per dish window)
  _archive/            — older section entries moved by CHEF at EOD (per 200L cap)
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
<agent findings — comprehensible Vietnamese prose, max 40 lines per append>

## WATCH §HH:MM-<agent>
- id: W-<YYYYMMDD>-<AGENT-ABBR>-<NNN> | flagged_by: <agent> | flagged_date: <date> | what_to_watch: <plain Vietnamese description> | why: <plain Vietnamese rationale> | trigger: <date or condition> | priority: high|normal|danger | status: open | domain: <tag>
```

**Language rule (mandatory — encodes Addition 6):**

```
Language: comprehensible Vietnamese
- Analysis prose under ## §HH:MM-<agent>: plain sentences, no caveman shorthand, no σ/bp/Layer#/hexagram-term jargon.
- what_to_watch and why fields of WATCH items: plain Vietnamese.
- CHEF _dish/ output: plain Vietnamese (per feedback_market_report_plain_vietnamese rule).
- Exception: RETURN blocks, DASHBOARD signal rows, outbox frontmatter, structural anchors — caveman/ULTRA unchanged.
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

## Today's Catalysts
<OPEN watch items with trigger ≤7 days, sorted by priority — written by CHEF daily-seed, not overwritten by dispatcher Live State tick>
```

**Outbox file format (docs/outbox/market/{danger|normal}/<ts>-<agent>.md):**
```markdown
---
channel: market
lane: danger|normal
priority: danger|normal
push_mode: full|delta
dedup_key: <agent>-<date>-<dish_type>
delivered: false
retries: 0
---
<message body — plain Vietnamese for market dishes>
```

**Work/bug outbox continues using direct send_telegram (no outbox file for those channels).**

**CHEF `_dish/` output format:**
```markdown
docs/daily/<date>/_dish/<slot>.md
```
One file per CHEF dish window (morning/intraday/eod/evening). CHEF writes dish content here AND writes the outbox file (normal lane). tran-ngoc-bau reads `_dish/` for audit.

---

## New Component: Delivery Cron (Phase 3)

**Type:** Cron process (NOT a cowork agent — no memory, no notebook)
**Job:** Two internal drain loops:
- **Danger loop (30s):** Drain `docs/outbox/market/danger/` → call `send_telegram(channel="market")` per file → mark `delivered: true` → log to WORK channel on each send.
- **Normal loop (5 min):** Drain `docs/outbox/market/normal/` → apply dedup/delta logic (Design Point D) → send or skip → update `docs/data/market-push-state.json`.
**Dedup:** Before sending normal-lane file, check `dedup_key` against last-24h delivered keys in `docs/data/delivery-cron-delivered.json`. Skip if already delivered.
**Retry:** Up to 3 retries on send failure. After 3 failures: move file to `docs/outbox/dead/` + write DASHBOARD bug signal.
**No market-channel send from any cowork agent:** This is an absolute rule. The delivery cron is the sole market sender.
**Identity:** registered in `docs/data/cowork-schedule.json` as `delivery-cron-danger` and `delivery-cron-normal` slots; `enabled: false` until Phase 3.

---

## Impact on Existing Architecture Invariants

| Invariant | Impact |
|---|---|
| Concurrent-commit-race | **ELIMINATED for daily files.** Each agent owns exactly one file. No shared file writes. Git-ignored = no commit race. DASHBOARD writes still need the existing serialization awareness. |
| Alert-split principle | **PRESERVED AND STRENGTHENED.** Alert-engine microservice (Go) keeps direct stop-loss push (server=speed, not a cowork agent). alert-commander danger items now go through a 30s-drain priority lane of delivery cron (commander=intelligence, ≤30s latency, still fast). No cowork agent reaches market channel directly. |
| Tick snapshot optimization | **PRESERVED.** Snapshot still written by dispatcher; agents still use Step -1 check in cycle-bootstrap skill. |
| Task-lock system | **UNCHANGED.** Slot locks continue to operate on cowork-slot keys. Daily file writes are not locked (one owner per file = no contention). |
| Notebook overwrite model | **UNCHANGED.** Notebooks remain full-overwrite session logs. Daily files are separate. |
| DASHBOARD signal bus | **PRESERVED AND UNCHANGED.** Used for urgent cross-agent urgency pokes. Not deprecated. |
| Signal JSON files (price_anomaly_*, etc.) | **DEPRECATED in Phase 3 only (after migration recap).** Kept during Phases 1+2 parallel run. |
| digest-predict Sunday weekly | **EXTENDED.** Existing Sunday slot reads daily folders. New monthly/yearly slots added. Prune step added after each recap write. |
| tran-ngoc-bau audit | **ENHANCED.** Reads full daily folder + `_dish/` + `## WATCH` subsections for audit. No flow refactor — just a richer context source. |
| Delivery channel exclusivity (NEW) | **NEW INVARIANT.** No cowork agent ever calls `send_telegram(channel="market")`. Agents keep direct send for work/bug only. Enforced architecturally by removing the capability from agent flows in P3.3. |
| Dedup / delta fingerprint (NEW) | **NEW INVARIANT.** delivery cron checks SHA-256 fingerprint before every intraday push. Unchanged content → no push. Full document only at dish-window slots. |
| Watch register durability (NEW) | **NEW INVARIANT.** `docs/attention/watch.md` is never gitignored, never pruned by retention. Items survive daily prune. Only item-status resolution (triggered/resolved/expired) removes items from the OPEN filter. |
| Retention lifecycle (NEW) | **NEW INVARIANT.** No raw data file is deleted until the next compaction tier recap is written AND verified non-empty. digest-predict is the sole prune runner. Prune is the last step of each recap slot, never a standalone job. |
| Migration-recap guard (NEW) | **ONE-SHOT INVARIANT.** Historical signals/*.json and cycle-snapshot data must be rolled up into recap files BEFORE the legacy cleanup step (P3.7) runs. Verify-before-delete guard applies here identically to the recurring retention lifecycle. |
| Language register boundary (NEW — v2.1) | **NEW INVARIANT.** All analysis prose written into daily document sections is in comprehensible Vietnamese. Caveman/ULTRA restricted to RETURN blocks, signals, DASHBOARD pokes, and structural machine fields. Boundary table in Design Point I is the authoritative definition. |
| Context-loading discipline (NEW — v2.1) | **NEW INVARIANT (binding audit).** Domain agents load only own-section delta + `_header.md` Live State per cycle. Full-folder load permitted only for CHEF (dish windows) and tran-ngoc-bau (audit). Enforced by cowork-refactory-expert audit pass (F36) before Phase-3 QA gate. |

---

## Implementation Checklist for Agent-Father

Listed in strict Phase order. Each item has a single responsible output.

**Executor key:** AF = agent-father handles (new files, structural edits); CRE = cowork-refactory-expert handles (cowork `.md` flow rewrites/audit).

### Phase 1 — Foundation (no agent flows changed)

| # | Executor | Action | File |
|---|---|---|---|
| F1 | AF | Create dirs: docs/daily/, docs/outbox/market/danger/, docs/outbox/market/normal/, docs/outbox/work/, docs/outbox/dead/, docs/recaps/weekly/, docs/recaps/monthly/, docs/recaps/yearly/, docs/attention/ | git mkdir + .gitkeep |
| F2 | AF | Add docs/daily/, docs/outbox/ to .gitignore. docs/attention/ is NOT gitignored. | .gitignore |
| F3 | AF | Add daily section file entries to docs/data/file-size-caps.json (200L per agent section) | docs/data/file-size-caps.json |
| F4 | AF | Add slot stubs to cowork-schedule.json: daily-seed (enabled:false), delivery-cron-danger (enabled:false), delivery-cron-normal (enabled:false), monthly-recap (enabled:false), yearly-recap (enabled:false). Add retention config object. | docs/data/cowork-schedule.json |
| F5 | AF | Write docs/standards/daily-document-spec.md per spec above. **Must include the Language rule block (Addition 6) and the bootstrap-only read rule (Addition 7).** | docs/standards/daily-document-spec.md |
| F6 | AF | Create docs/attention/watch.md with empty template (## OPEN / ## TRIGGERED / ## EXPIRED sections + item schema table header) | docs/attention/watch.md |
| F7 | AF | Create docs/data/market-push-state.json with zeroed initial state | docs/data/market-push-state.json |
| F8 | AF | Create docs/data/delivery-cron-delivered.json as empty {} | docs/data/delivery-cron-delivered.json |

### Phase 2 — Parallel Run

| # | Executor | Action | File | Bootstrap sub-step |
|---|---|---|---|---|
| F9 | CRE | Edit cowork-team/flow/main.md Step 4.7: add _header.md write alongside tick-snapshot write | docs/agents/cowork-team/flow/main.md | Verify dispatcher write step does not load daily folder for read; header write is write-only |
| F10 | AF | Add daily-seed sub-flow to unified-agent/flow/: creates day folder + stub files at 00:00 UTC; reads watch.md OPEN items → writes ## Today's Catalysts to _header.md | docs/agents/unified-agent/flow/daily-seed.md (new) | CHEF seed reads full watch.md at 00:00 UTC only — not a domain-agent cycle, exempt from domain bootstrap rule |
| F11 | AF | Enable daily-seed slot in cowork-schedule.json | docs/data/cowork-schedule.json | — |
| F12 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection, **prose in comprehensible Vietnamese**) to news-scout/flow/stage-log-notify.md | docs/agents/news-scout/flow/stage-log-notify.md | **Verify: append step writes own-section only; no full-folder read added. Mark done only after verification.** |
| F13 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection, **prose in comprehensible Vietnamese**) to market-watcher/flow/eod.md and cycle.md | docs/agents/market-watcher/flow/cycle.md + eod.md | **Verify: append step writes own-section only; no full-folder read added. Mark done only after verification.** |
| F14 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection, **prose in comprehensible Vietnamese**) to financial-analyst/flow/main.md | docs/agents/financial-analyst/flow/main.md | **Verify: append step writes own-section only; no full-folder read added. Mark done only after verification.** |
| F15 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection, **prose in comprehensible Vietnamese**) to alert-commander/flow/stage-dispatch-log.md | docs/agents/alert-commander/flow/stage-dispatch-log.md | **Verify: append step writes own-section only; no full-folder read added. Mark done only after verification.** |
| F16 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection, **prose in comprehensible Vietnamese**) to report-analyzer/flow/main.md | docs/agents/report-analyzer/flow/main.md | **Verify: append step writes own-section only; no full-folder read added. Mark done only after verification.** |
| F17 | CRE | Add end-of-cycle daily-append step (including ## WATCH subsection) to tran-ngoc-bau/flow/main.md. **Note: tran-ngoc-bau is an audit/analyst role and reads full folder — full-folder read is permitted and correct for this agent.** | docs/agents/tran-ngoc-bau/flow/main.md | tran-ngoc-bau: full-folder read is correct (audit role) — no bootstrap restriction applies. Verify prose is still plain Vietnamese. |

**Phase 2 QA gate:** 5 consecutive trading days clean per all criteria in Phase 2 section above, including (e) language compliance spot-check and (f) bootstrap verification. PO signs off before Phase 3 starts.

### Phase 3 — Full Cutover

| # | Executor | Action | File | Bootstrap sub-step |
|---|---|---|---|---|
| F18 | CRE | Add delta-read from daily folder to domain agent cycle-start steps (per read pattern table above); wire last_read_anchor into notebook write step for each agent; add filtered watch.md OPEN-items read (domain-tagged) | 5 agent flow files (stage-bootstrap.md per agent) | **Verify: each agent's bootstrap reads ONLY own-section delta + header tail + domain watch items. No full-folder load. Mark done only after verification.** |
| F19 | AF | Write delivery cron component: danger loop (30s) + normal loop (5 min) + dedup/delta logic + market-push-state.json update + delivery-cron-delivered.json dedup check | new cron script / delivery-cron process | — |
| F20 | AF | Enable delivery-cron-danger and delivery-cron-normal slots in cowork-schedule.json | docs/data/cowork-schedule.json | — |
| F21 | CRE | Replace direct send_telegram(channel="market") with outbox-write in: unified-agent/chef.md (→ normal lane, push_mode:full), news-scout/stage-log-notify.md (→ normal lane for any market output), market-watcher/eod.md, financial-analyst/main.md, report-analyzer/main.md | 5 flow files | Verify: no residual send_telegram(channel="market") call remains in any of the 5 files |
| F22 | CRE | Replace direct send_telegram(channel="market") in alert-commander: danger items → docs/outbox/market/danger/<ts>-alert-commander.md (no push_mode needed). Non-danger market items → normal lane. Work/bug channels: KEEP direct send_telegram. | docs/agents/alert-commander/flow/stage-dispatch-log.md | Verify: WORK/BUG direct send_telegram kept; no MARKET direct send remains |
| F23 | CRE | Update digest-predict/flow/weekly.md: read docs/daily/<YYYY-Www>/ folder; write docs/recaps/weekly/<YYYY-Www>.md + normal-lane outbox; after verify: run prune (daily files >14d). Add monthly.md and yearly.md sub-flows with same pattern + respective prune step. | docs/agents/digest-predict/flow/weekly.md + 2 new sub-flows | digest-predict reads full folder for weekly synthesis — exempt from domain bootstrap rule (synthesis role). Verify: prune step runs AFTER recap verified. |
| F24 | CRE | Add CHEF watch consolidation step to daily-seed sub-flow: merge prior day ## WATCH subsections → docs/attention/watch.md; auto-expire stale items; write Today's Catalysts section. | docs/agents/unified-agent/flow/daily-seed.md | CHEF seed full-folder read at 00:00 UTC — exempt from domain bootstrap rule |
| F25 | CRE | Update unified-agent/flow/chef.md GATHER step: read docs/daily/<date>/ folder + docs/attention/watch.md (all OPEN) instead of docs/signals/*.json files | docs/agents/unified-agent/flow/chef.md | **CHEF full-folder read permitted at dish windows only — verify GATHER step is gated to dish-window slots, not every 15-min tick.** |
| F26 | CRE | Update digest-predict weekly sub-flow: add watch register scan (triggered/resolved this week → weekly recap summary). | docs/agents/digest-predict/flow/weekly.md | — |
| — | — | **F-MIG1 (ONE-TIME MIGRATION — precedes F27)** | — | — |
| F-MIG1 | AF | Survey existing historical data: list docs/signals/*.json agent-written files (price_anomaly_*, news_impact_*, bctc_signal_*, fundamental_*); list any cycle-snapshot-*.json files; list any existing digest outputs. Log the date range covered. | read-only survey step | — |
| F-MIG2 | AF | Generate historical recaps from surveyed data: write at least one monthly recap (current month) and weekly recap (current week) from signals/*.json content into docs/recaps/monthly/ and docs/recaps/weekly/ using the same format as the new recap sub-flows. | docs/recaps/monthly/<YYYY-MM>.md + weekly/<YYYY-Www>.md | — |
| F-MIG3 | AF | Verify migration recaps exist and are non-empty (stat check on each file written in F-MIG2). Log verification result to WORK channel. ABORT if any recap file is zero bytes — do not proceed to F-MIG4. | verification step | — |
| F-MIG4 | AF | Only after F-MIG3 passes: delete docs/signals/*.json agent-written files (price_anomaly_*, news_impact_*, bctc_signal_*, fundamental_*) and any stale cycle-snapshot-*.json. DASHBOARD.md is NOT deleted. | cleanup step | — |
| — | — | **Resume normal F-series after F-MIG4** | — | — |
| F27 | AF | Deprecation notice in cycle-bootstrap/SKILL.md: signal file writes (price_anomaly_*, etc.) are sunset; domain agents write to daily folder instead | docs/.claude/skills/cycle-bootstrap/SKILL.md note | — |
| F28 | AF | Enable monthly-recap and yearly-recap slots in cowork-schedule.json | docs/data/cowork-schedule.json | — |
| F29 | AF | Update cowork-refactory-expert to be aware of daily-document + watch register architecture (lazy-load entries to docs/standards/daily-document-spec.md and docs/attention/watch.md) | docs/agents/cowork-refactory-expert/init.md | **Verify: lazy-load entries use `trigger:` not `always_load`; cowork-refactory-expert is aware of the language register boundary and bootstrap-only rule.** |
| F36 | CRE | **Post-migration flow audit pass:** Review ALL cowork agent flows modified in F9–F25. For each agent: (a) confirm analysis prose is comprehensible Vietnamese (no caveman in section appends), (b) confirm domain agents bootstrap with own-section delta + header only, (c) confirm CHEF GATHER is gated to dish windows only, (d) confirm CHEF and tran-ngoc-bau are the only full-folder loaders. File audit report as a WORK channel message. Block Phase-3 QA gate until this pass is complete. | All modified cowork agent flow files (audit, no edits unless a violation is found) | This item IS the bootstrap verification — no sub-step needed. |

**Phase 3 QA gate:** 10 consecutive trading days clean per all criteria in Phase 3 section above, including (g) language compliance spot-check and (h) delta-read verification. **F36 audit pass must be complete before the QA gate countdown starts.** User verbal confirmation.

---

## Dependencies and Sequencing Constraints

1. F5 (`daily-document-spec.md`) must exist before F10 (daily-seed sub-flow) — seed uses the template spec.
2. F6 (`watch.md` created) must exist before F10 (daily-seed reads it for Today's Catalysts section).
3. F10 + F11 (daily-seed slot enabled) must be live for at least one full day before F12–F17 (agent appends) — ensures folder exists before agents try to write.
4. F18 (delta-read wired) must be deployed and QA-verified before F21–F22 (outbox cutover) — agents must be reading the daily folder before they stop writing to signals/.
5. F19 (delivery cron) must be deployed and F20 (slots enabled) before F21–F22 (non-danger and danger market-channel cutover).
6. F21–F22 (all market-channel direct sends removed from agents) must be complete before F25 (CHEF reads daily folder instead of signals) to prevent double-send during transition.
7. F-MIG1 → F-MIG2 → F-MIG3 → F-MIG4 must run in strict order, gated by verification. F27 (deprecation notice) must NOT precede F-MIG4 (cannot advertise sunset before migration is confirmed complete).
8. F24 (watch consolidation in daily-seed) must come AFTER F12–F17 have been running for at least 3 trading days, so there is `## WATCH` content to consolidate.
9. F23 (digest-predict with prune step) must be deployed with the retention config in cowork-schedule.json (F4) already present — prune reads the `retention.daily_days` value from that config before deciding what to delete.
10. F28 (monthly/yearly slots enabled) must come AFTER F23 has been tested with at least one successful weekly cycle including prune.
11. **(v2.1) F5 must encode the Language rule (Addition 6) before F12–F17 are executed** — the spec is the language authority; agent flows reference it. Agent-father must not write F5 without the language rule block.
12. **(v2.1) F36 (cowork-refactory-expert audit pass) must complete AFTER F18 (delta-read wired) and BEFORE the Phase-3 QA gate countdown** — the audit verifies the full live flow state, not the written intent.

---

## Open Questions (none — all resolved in this brief)

All 10 design points (A through J) are resolved above. No items are deferred to future briefs.

One carry-forward note for agent-father: the `handoff-delta-read` skill uses `## §N-<slug>` anchors (numeric sequence). Daily section files use `## §HH:MM-<agent>` anchors (time-based). These are compatible patterns (both match `^## §`) but the skill's "locate anchor by line scan" logic works identically for both formats. No skill modification needed.

Second carry-forward note: the delivery cron is NOT a cowork agent and therefore does NOT require an agent .md file, a notebook, or a task-lock slot. It is a plain cron process (like the existing cowork-team dispatcher). Register it only in cowork-schedule.json as two slot stubs.

Third carry-forward note (v2.1): cowork-refactory-expert is the executor for all cowork `.md` flow rewrites (F9, F12–F18, F21–F26, F36). Agent-father handles all new file creation and structural edits (F1–F8, F10–F11, F19–F20, F27–F29, F-MIG1–F-MIG4). The executor column in the checklist is the authoritative split. Do not reverse these.

---

## Signal Dropped

`docs/signals/cowork-team-daily-document-redesign-v2-20260527.json` → agent-father (updated to v2.1)
