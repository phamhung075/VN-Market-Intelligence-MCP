---
name: handoff-delta-read
description: >
  Delta-read a handoff file using section anchors. On first read (or stale >24h),
  returns the full file. On re-read, seeks to last_read_anchor and returns only
  the delta appended since, cutting repeated I/O 50–150 KB/trading-day.
---

## Section Anchor Convention

Handoff files use `## §N-<slug>` headings as positional anchors (space between `##` and `§`):

```markdown
## §1-spec
## §2-impl
## §3-qa-round-1
## §4-fixer-round-1
## §5-qa-round-2
```

Each workflow section appended to a handoff MUST start with one of these headings.
The anchor is the EXACT heading line (including `## §N-slug`). Grep pattern: `^## §[0-9]`.

---

## Delta-Read Algorithm

**Inputs** (from calling signal payload or in-context variable):
- `last_read_anchor` — string | null: the `## §N-slug` heading at which the previous read ended
- `last_read_at` — ISO timestamp | null: when the last read occurred

**Decision:**

```
if last_read_anchor is null OR (now - last_read_at) > 24h:
  → FULL READ: Read(path=<handoff_path>)
  → record anchor_out = last §N-slug heading found in file (or null if none)
  → record read_at = now (ISO)
else:
  → locate anchor line in file using Read + line scan
  → if anchor line NOT FOUND: fall back to FULL READ (silent, no error)
  → if found at line L: read from line L to EOF (Read with offset=L)
  → record anchor_out = last §N-slug heading found in the delta slice
  → record read_at = now (ISO)
```

**Fallback rules (AC-4 backward compat):**
1. File has NO `## §` anchors → `anchor_out = null` → next call triggers full-read silently.
2. `last_read_anchor` present but not found in current file → full-read silently (no error raised).
3. `last_read_at` absent → treat as null → full-read.

---

## Caller Contract

**Store after each read** (in calling signal JSON or in-context var):
```json
{ "last_read_anchor": "## §3-qa-round-1", "last_read_at": "2026-05-22T08:00Z" }
```

**Pass on next spawn** via signal payload field `handoff_delta` or inline in the prompt:
```
handoff: docs/handoffs/TASK_NNN.md
last_read_anchor: "## §3-qa-round-1"
last_read_at: "2026-05-22T08:00Z"
```

The anchor field goes into the DONE signal emitted by each agent, so the next agent in the chain picks it up without a separate file write.

---

## Smoke Test (AC-4 / § 4 of handoff spec)

First read: `last_read_anchor=null` → full file returned, `anchor_out` = last `## §` heading.
Second read with same anchor → delta only (≤30% bytes of first read).
Read with `last_read_at = now - 25h` → full-read triggered despite anchor present.
File with no `## §` headings → `anchor_out=null`, next read is full-read, no error.
