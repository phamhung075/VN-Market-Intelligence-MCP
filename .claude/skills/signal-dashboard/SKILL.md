<!-- size-justification: 192L — SSOT protocol skill for DASHBOARD.md; covers WRITE/READ/ACK/CLOSE/PRUNE operations + delta-read cache contract (two-phase mtime/linecount check + section-offset read) + payload pointer discipline (3 rules) + signal type taxonomy + per-type doc-load table; splitting operations would break the atomicity guarantee agents depend on -->
---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/signals/DASHBOARD.md. Covers write, read, ack, close, and prune operations. READ uses two-phase delta-read to eliminate full-file token cost.
---

# Signal Dashboard — Communication Skill

**File:** `docs/signals/DASHBOARD.md`
**Rule:** This file is the SSOT inbox for cowork agents. Dev-team pipeline (`signals.db` + JSON) is separate — do NOT replace it. This dashboard complements it for cowork-to-cowork visibility.

---

## Sections (reader agents)

| Section | Receives from |
|---|---|
| `## po` | tran-ngoc-bau, agents-architect, system-auditor |
| `## tran-ngoc-bau` | unified-agent, market-watcher, financial-analyst (methodology flags) |
| `## unified-agent` | market-watcher, news-scout, digest-predict |
| `## alert-commander` | market-watcher, news-scout |

To add a new reader section: append `## {agent-id}` + empty table header to DASHBOARD.md.

---

## WRITE — append a signal row

```
id     = {from[0:3]}-{YYYYMMDDTHHmmss}   # e.g. tnb-20260517T074033
ts     = ISO-8601 UTC compact             # e.g. 2026-05-17T07:40Z
status = NEW
```

**Template row** (append inside recipient's `## {to}` table):
```
| {id} | {ts} | {from} | {type} | {summary ≤40 chars} | NEW | {payload path or "-"} |
```

**Rules:**
- One row per signal. Never batch multiple signals into one row.
- `summary` max 40 chars — strip to fit.
- `payload` is a file path (`docs/handoffs/…`, `docs/signals/…`) or `-` if none.
- After appending: update `_Updated:` header (line 4) — ONE line only:
  `_Updated: {ISO} — {agent-id} {≤8-word tick summary}_`
  Hard cap. No accumulated history. Historical triage narrative → session log only.

---

## READ — two-phase delta-read (0–400 tokens vs 38k full-file)

**Phase 1 — CHEAP CHECK (stat only, 0 tokens):**
```
stat docs/signals/DASHBOARD.md → get current mtime + line_count
Compare to caller's stored {last_read_mtime, last_read_linecount}
  (from pipeline-state.json dashboard_section_cache, or spawn-prompt field)

if mtime UNCHANGED AND line_count UNCHANGED:
  → SKIP READ entirely
  → log "[dashboard] no change since {last_read_mtime} — skip"
  → 0 tokens consumed; DONE
else:
  → Phase 2
```

If no stored cache (first run, or cowork agent with no cache) → skip Phase 1, go straight to Phase 2.

**Phase 2 — SECTION-ONLY READ (~200 tokens):**
```
1. Read ONLY own section: ## {my-agent-id} ... next ## header
   Use offset+limit Read: offset=start_line, limit=section_length
   If start_line unknown → scan from top for ## {my-agent-id} header
     (this is the only case requiring a partial scan; cache start_line after)
2. Collect all rows where status = NEW
3. For each NEW row:
   a. If payload ≠ "-": Read payload file → add to context
   b. Note: type + summary → route to relevant flow step
4. Mark each processed row: NEW → READ (edit in place)
5. Update stored cache: {last_read_mtime, last_read_linecount, start_line}
   (in pipeline-state.json dashboard_section_cache for dev-team;
    in spawn-prompt or notebook for cowork agents)
6. Log: "[dashboard] {N} new signals read: {id1}, {id2}, ..."
```

If own section is absent → log `"[dashboard] No section for {agent-id} — skip"`.
If DASHBOARD.md missing → log `"[dashboard] DASHBOARD.md not found — skip"`. Never fail-loud.

**Cache contract (`dashboard_section_cache`):**
```json
{
  "section_name":   "po",
  "start_line":     8,
  "last_mtime":     "2026-06-01T08:09:00Z",
  "last_linecount": 224
}
```
- Stored in `docs/pipeline-state.json` for dev-team.
- Passed via spawn-prompt field for cowork agents (optional — absent = Phase 2 standalone, no error).
- `start_line` is updated after each section-read (sections grow by append, never reorder).
- Absent cache = fall back to full Phase 2 section scan. Zero breaking change.

---

## ACK / CLOSE

- **ACK** (signal received, processing in progress): change `NEW` → `READ`
- **CLOSE** (signal fully consumed, no further action): change `READ` → `DONE`
- Edit in place — change only the `status` cell of the target row.

---

## PRUNE — MANDATORY after every drain/consume cycle

**Called from:** `docs/agents/dev-team/flow/drain-signals.md` after row consumption.
Cowork equivalents must also call PRUNE after their consume step.

```
After all NEW rows consumed and marked READ:
1. Remove all rows where status = DONE (immediate — no aging required)
2. Remove all rows where status = READ AND ts < now() - 48h
   Archive pruned rows: append to docs/signals/DASHBOARD_ARCHIVE.md before removing
   (one line per pruned row: | {id} | {ts} | {from} | {type} | pruned:{ISO} |)
3. Cap _Updated: header to ONE line:
   _Updated: {ISO} — {agent-id} {≤8-word tick summary}_
4. Commit: git add docs/signals/DASHBOARD.md docs/signals/DASHBOARD_ARCHIVE.md
           git commit -m "chore(signals): drain + prune {ts}"
```

Prune thresholds:
- **DONE** rows → removed immediately; archived first
- **READ** rows → removed after 48h aging (`ts < now() - 48h`); archived first
- **NEW** rows → NEVER pruned (never archive a NEW row)

Archive: `docs/signals/DASHBOARD_ARCHIVE.md` — append-only log of pruned rows. Never read back.
Dedup key: `id` (unique per signal). If a section becomes empty (header only), keep the section header.

**This step is mandatory, not optional.** `drain-signals.md` calls it after every consume pass.

---

## Payload Pointer Discipline

Rules apply to NEW signals from cycle 2 of Sprint 1968 onward. No retroactive rewrite.

**Rule 1 — DASHBOARD summary column cap:**
When the summary column of a DASHBOARD.md row would exceed 120 chars, truncate to 80 chars and append a pointer:
```
<first 80 chars of summary> → docs/handoffs/TASK_NNN.md
```
Full details live in the handoff file, not the signal row.

**Rule 2 — PM sprint-kickoff signal payload cap:**
`pm sprint-kickoff` signal payload body must be ≤800 chars JSON. Format:
```json
{ "title": "...", "scope": "...", "tasks": ["1968a", "1968b"] }
```
Full plan lives in `docs/handoffs/SPRINT_NNN.md`. The signal is a pointer, not the plan.

**Rule 3 — Pointer integrity check:**
The writer of a truncated signal MUST verify the pointed file exists before emitting:
```
ls docs/handoffs/TASK_NNN.md  # must return the file, not ENOENT
```
No orphan pointers. If the file does not exist, create it first, then emit the signal.

---

## Signal types (canonical)

| type | Meaning | Common payload |
|---|---|---|
| `audit-handoff` | TNB quality audit complete | `docs/handoffs/tnb-audit-latest.md` |
| `brief_complete` | Architecture brief ready | `docs/architecture-briefs/*.md` |
| `market-signal` | Market anomaly / regime shift | `docs/signals/*.json` |
| `news-impact` | News chain with market impact | `docs/signals/*.json` |
| `system-issue` | Infrastructure problem | inline summary only |
| `methodology-flag` | Agent violated TNB methodology | notebook path |

---

## Docs to read per signal type

When READ finds a NEW row, load these docs:

| type | Docs to read |
|---|---|
| `audit-handoff` | payload path + `docs/standards/tnb-methodology.md` |
| `brief_complete` | payload path only |
| `market-signal` | payload path + `docs/policies/alert-policy.md` |
| `news-impact` | payload path + `docs/standards/alert-message-format.md` |
| `system-issue` | `docs/protocols/fail-loud-protocol.md` |
| `methodology-flag` | payload path + `docs/standards/tnb-methodology.md` |
