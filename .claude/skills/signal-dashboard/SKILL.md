---
name: signal-dashboard
description: SSOT protocol for cowork agent signal communication via docs/signals/DASHBOARD.md. Covers write, read, ack, close, and prune operations.
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
- After appending: update `_Updated: {ISO}_` timestamp in line 4.

---

## READ — scan own section for new signals

```
1. Read docs/signals/DASHBOARD.md
2. Find section: ## {my-agent-id}
3. Collect all rows where status = NEW
4. For each NEW row:
   a. If payload ≠ "-": Read payload file → add to context
   b. Note: type + summary → route to relevant flow step
5. Mark each processed row: NEW → READ  (edit in place)
6. Log: "[dashboard] {N} new signals read: {id1}, {id2}, ..."
```

If own section is absent → log `"[dashboard] No section for {agent-id} — skip"`.
If DASHBOARD.md missing → log `"[dashboard] DASHBOARD.md not found — skip"`. Never fail-loud.

---

## ACK / CLOSE

- **ACK** (signal received, processing in progress): change `NEW` → `READ`
- **CLOSE** (signal fully consumed, no further action): change `READ` → `DONE`
- Edit in place — change only the `status` cell of the target row.

---

## PRUNE — keep dashboard short

Run at end of every write cycle (after appending new rows):

```
1. Read DASHBOARD.md
2. Remove all rows where status = DONE
3. Update _Updated: {ISO}_ timestamp
4. Write back
```

Prune threshold: **DONE rows removed immediately** — no aging delay.
Never prune NEW or READ rows. If a section becomes empty (header only), keep it.

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
