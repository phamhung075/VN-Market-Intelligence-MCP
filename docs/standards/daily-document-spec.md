<!-- size-justification: 180L — full specification for daily document structure required by agent-father brief v2.1 (F5). Covers folder layout, section format, language rules (Addition 6), bootstrap-only read rule (Addition 7), header format, outbox format, and dish output format. All sections are cross-referenced in Phase 2/3 agent flow edits by cowork-refactory-expert. Cannot be split without breaking agent-flow cross-references. -->

# Daily Document Specification

**Version:** 1.0 — 2026-05-27
**Authority:** `docs/architecture-briefs/2026-05-27-cowork-team-daily-document-redesign.md` v2.1
**Maintained by:** agent-father

---

## Folder Structure

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

Each agent owns exactly one file. No two agents write to the same file. No git commit race.

---

## Agent Section Append Format

```markdown
## §HH:MM-<agent>
<agent findings — comprehensible Vietnamese prose, max 40 lines per append>

## WATCH §HH:MM-<agent>
- id: W-<YYYYMMDD>-<AGENT-ABBR>-<NNN> | flagged_by: <agent> | flagged_date: <date> | what_to_watch: <plain Vietnamese description> | why: <plain Vietnamese rationale> | trigger: <date or condition> | priority: high|normal|danger | status: open | domain: <tag>
```

**Section anchor:** `## §HH:MM-<agent>` is the delta-read anchor. Agents store `last_read_anchor` in their notebook. The next cycle reads from that anchor line forward (delta only).

**WATCH subsection:** Written only when the agent identifies a forward-looking catalyst. All 8 schema fields are mandatory: `id · flagged_by · flagged_date · what_to_watch · why · trigger · priority · status · domain`.

**File size cap:** 200 lines per agent section file (enforced by PostToolUse backstop hook via `docs/data/file-size-caps.json`). CHEF archives older entries to `_archive/` at EOD dish.

---

## Language Rule (Addition 6 — Mandatory)

```
Language: comprehensible Vietnamese
- Analysis prose under ## §HH:MM-<agent>: plain sentences, no caveman shorthand, no σ/bp/Layer#/hexagram-term jargon.
- what_to_watch and why fields of WATCH items: plain Vietnamese.
- CHEF _dish/ output: plain Vietnamese (per feedback_market_report_plain_vietnamese rule).
- Exception: RETURN blocks, DASHBOARD signal rows, outbox frontmatter, structural anchors — caveman/ULTRA unchanged.
```

**Rationale:** The daily document is CHEF's direct source for dish synthesis. Prose written in plain Vietnamese eliminates a lossy caveman-to-plain translation at synthesis time. The cost is bounded by the existing delta-read pattern (domain agents write ≤40 lines per append) and the 200L cap.

**Register boundary table** (authoritative — from Design Point I):

| Surface | Register |
|---|---|
| Daily document analysis prose — paragraphs under `## §HH:MM-<agent>`, WATCH `what_to_watch`/`why` fields, CHEF `_dish/` output | **Comprehensible Vietnamese — plain sentences, no caveman, no σ/bp/Layer#/hexagram terms** |
| RETURN blocks, DASHBOARD urgency pokes, signal rows, other agent-to-agent machine comms | **Caveman/ULTRA stays** |
| Structural/machine fields — section anchors, `_header.md` key:value lines, watch-item schema fields (id/flagged_by/flagged_date/trigger/priority/status/domain), outbox frontmatter | **Unchanged — machine fields, not prose** |

---

## Bootstrap-Only Read Rule (Addition 7 — Binding)

Domain agents (news-scout, market-watcher, financial-analyst, alert-commander, report-analyzer) MUST NOT load the full daily folder at any cycle step. Their maximum bootstrap per cycle is:

1. `_header.md` Live State section — last 10 lines only (using `offset` parameter).
2. Own section delta — lines since `last_read_anchor` (stored in agent notebook).
3. Filtered `docs/attention/watch.md` OPEN items — domain-tagged only, ≤20 lines.
4. alert-commander only: tail of `docs/daily/<date>/news-scout.md` (last 20 lines).

Loading the full daily folder by a domain agent is a context-bloat violation equivalent to `trigger: startup`. It must be caught by the cowork-refactory-expert audit pass (F36) and blocked before merge.

**Exemptions (full-folder load permitted):**
- CHEF (unified-agent): full folder read at dish windows only (4 times per day — not every 15-min tick).
- tran-ngoc-bau: full folder read (audit role — reads everything including `## WATCH` subsections).
- digest-predict: full folder read for weekly/monthly/yearly synthesis.

---

## `_header.md` Live State Format

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

**Writer ownership:**
- `# Live State` block: overwritten each dispatcher tick (cowork-team/flow/main.md Step 4.7).
- `## Today's Catalysts` section: written once at daily-seed (00:00 UTC); NOT overwritten by dispatcher ticks.

---

## Outbox File Format

Path: `docs/outbox/market/{danger|normal}/<ISO-ts>-<agent>.md`

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

**push_mode rules:**
- CHEF at dish windows (morning/intraday/eod/evening): `push_mode: full`
- Intraday state change: `push_mode: delta`
- alert-commander danger items: always danger lane (no push_mode needed — danger lane always sends full content)
- Absent push_mode: cron derives from slot type + time-of-day

**WORK and BUG channels:** Agents keep direct `send_telegram` for work and bug channels. No outbox file for those channels.

---

## CHEF `_dish/` Output Format

Path: `docs/daily/<date>/_dish/<slot>.md`

One file per CHEF dish window: `morning.md`, `intraday.md`, `eod.md`, `evening.md`.

CHEF writes dish content here AND writes the corresponding outbox file (normal lane). tran-ngoc-bau reads `_dish/` for audit.

---

## Failure Modes

| Scenario | Behaviour |
|---|---|
| Daily folder missing at agent cycle start | Auto-create minimal template (`# <date> — <agent>` + `## §template` stub). Log miss. Never hard-stall. |
| `_header.md` missing | Proceed without header. Log miss. Fall back to tick snapshot (cycle-bootstrap/SKILL.md Step -1). |
| Corrupt section file (non-UTF8, truncated) | handoff-delta-read fallback: anchor not found → full-read. If full-read fails → log miss + proceed without daily context. |
| watch.md unavailable | Proceed without watch items. Log miss. Watch items are forward-context enhancement only. |
