# Architecture Brief: Context-Resume Economy
<!-- slug: context-resume-economy -->
<!-- date: 2026-06-01 -->
<!-- author: agents-architect -->
<!-- status: READY-FOR-IMPLEMENTATION -->

## 1. Problem Statement

Every dev-team cron tick (`:07 * * * *`) and every cowork-team cycle starts cold — disk is the only resume state. The context-load phase before any real work currently wastes ~38–40k tokens per agent invocation re-reading stale, already-consumed data. With ~10 cowork agents firing multiple times per day plus dev-team every hour, the fleet-wide burn exceeds 350k tokens/day on dead signal rows and freeform-prose pipeline state that machines can not route without re-parsing.

Three distinct failure modes are identified below.

---

## 2. Root-Cause Analysis

### 2.1 ECONOMY — DASHBOARD.md full-file read every cycle (primary, ~85% of resume cost)

**Measured state (2026-06-01):**
- `docs/signals/DASHBOARD.md` = 153 KB / 224 lines
- Token cost per read: ~38,000 tokens (file content exceeds 25k-token Read limit — agents must paginate or miss tail)
- Status breakdown: 9 NEW rows, 32 READ rows, 12 DONE rows, 10 CLOSED rows — **63 of 72 data rows are non-NEW (dead on re-read)**
- The `_Updated:` header on line 4 is a multi-hundred-word prose narrative accumulating every tick's full triage story; this single line accounts for ~28 KB alone

**Root cause:** The signal-dashboard SKILL `## READ` section (`.claude/skills/signal-dashboard/SKILL.md` line 51) instructs:
```
1. Read docs/signals/DASHBOARD.md
```
This is an unconditional full-file read. Every agent that calls this skill reads the entire file regardless of whether anything new exists for it.

**Already-built solution not wired:** `.claude/skills/handoff-delta-read/SKILL.md` implements exactly the anchor-based delta-read needed. The skill is live and tested but has never been connected to the DASHBOARD read path. The DASHBOARD does not use `## §N-slug` anchors so the existing skill cannot be applied verbatim — but the same principle can be adapted with a lighter mechanism (last-known row-count + section-level offset, see §4.1).

**PRUNE is defined but not enforced:** The signal-dashboard SKILL `## PRUNE` section specifies DONE rows removed immediately and READ rows removed after 48h. The current DASHBOARD has 12 DONE + 32 READ rows many of which are weeks old. The prune step is listed as "cowork-team main cycle step" but drain-signals.md does not call it, and cowork-team/main.md does not call it either. PRUNE is a dead letter.

### 2.2 QUALITY — pipeline-state.json fields are freeform prose blobs

**Measured state:**
- `docs/pipeline-state.json` = 7 KB
- Fields `status`, `currentSprint`, `activeTaskId`, `nextAgent`, `nextPrompt`, `updatedBy` are all freeform prose paragraphs — 300–700 words each
- The `status` field currently reads: "IDLE (dev-team :07 ON-DEMAND run 2026-06-01T08:09Z, Monday, VN market OPEN ~close). PREFLIGHT clean. Drained 4 cowork-fire silent heartbeats; 0 telegram; DASHBOARD git-clean (5 NEW = known-stale P2-*/1967b breadcrumbs)..." — 60+ words to encode what should be a 3-field machine record
- `nextAgent` is a 200-word paragraph mixing the actual next agent name with rationale, watch items, and backlog hints

**Root cause:** No schema constraint. Every agent writing pipeline-state.json fills prose because there is no machine-readable head section. The next tick's dispatcher must re-parse intent from prose to decide routing — a fragile pattern that drifts over time and re-triage cost grows with narrative length.

**Secondary effect:** Stale NEW DASHBOARD rows get re-triaged repeatedly (visible in current `_Updated:` header which references "5 NEW = known-stale P2-*/1967b breadcrumbs" — these rows have been re-read and dismissed for 3+ ticks without being pruned or closed).

### 2.3 PERFORMANCE — `_Updated:` header accumulates unbounded prose

The DASHBOARD `_Updated:` line 4 is a single markdown line that has grown to ~28 KB of accumulated narrative from every tick that ever wrote to the file. Agents that read even the first 50 lines of DASHBOARD.md ingest this entire blob. It serves no machine-routing purpose — the actual rows in sections below it are the signal data.

---

## 3. Affected Agents / Files / Skills

| Surface | Type | Change required |
|---|---|---|
| `.claude/skills/signal-dashboard/SKILL.md` | Skill | Upgrade READ to delta-read + enforce PRUNE at end of every write cycle |
| `docs/agents/dev-team/flow/drain-signals.md` | Flow | Add DASHBOARD PRUNE call after row consumption |
| `docs/pipeline-state.json` | Data | Restructure to machine-readable head + capped narrative |
| `docs/agents/dev-team/flow/main.md` | Flow | Step 0b reads only pipeline-state HEAD fields for routing |
| All cowork agent flows that call signal-dashboard READ | Flows | Pick up new SKILL contract automatically (no per-agent edit needed if SKILL is the SSOT) |

**Cowork agents using signal-dashboard READ (fleet affected):**
- `cowork-team` dispatcher (calls drain-signals equivalent)
- `system-auditor` (reads DASHBOARD for anomaly rows)
- `tran-ngoc-bau` (reads own section)
- `unified-agent`, `market-watcher`, `news-scout`, `bctc-analyst`, `alert-commander`, `digest-predict`

---

## 4. Recommended Design

### 4.1 DASHBOARD Delta-Read + Mandatory Prune

**Contract change (signal-dashboard SKILL § READ):**

Replace the unconditional full-file read with a two-phase check:

```
Phase 1 — CHEAP CHECK (always):
  stat docs/signals/DASHBOARD.md → get mtime + line_count
  Compare to caller's stored {last_read_mtime, last_read_linecount}
  (stored in calling agent's pipeline-state or notebook, or passed via spawn prompt)

  if mtime unchanged AND line_count unchanged:
    → SKIP READ entirely. Log "[dashboard] no change since {last_read_mtime} — skip"
    → 0 tokens consumed
  else:
    → Phase 2

Phase 2 — SECTION-ONLY READ:
  Read only the caller's own section (## {agent-id} ... next ## header)
  Not the full file. Use line-offset Read (offset=section_start_line, limit=section_length).
  section_start_line stored in {last_section_start} (update after each section-read — sections grow by append, never reorder)

  Collect NEW rows only.
  Update stored {last_read_mtime, last_read_linecount, last_section_start}.
```

**Section-start cache storage:**
- dev-team: `docs/pipeline-state.json` field `dashboard_section_cache` (object: `{section_name, start_line, last_mtime, last_linecount}`)
- cowork agents: their pipeline-state equivalent or spawn-prompt field (same pattern as `handoff-delta-read` caller contract)

**PRUNE — make it mandatory, not optional:**

Add PRUNE as a **mandatory step** in `drain-signals.md` after row consumption, not as an optional "cowork-team step":
```
After all NEW rows consumed and marked READ:
  PRUNE: remove DONE rows immediately; remove READ rows where ts < now() - 48h
  Cap _Updated: header to ONE line (ISO timestamp + agent-id + tick-summary ≤ 80 chars)
  Commit: git add docs/signals/DASHBOARD.md; git commit -m "chore(signals): drain + prune {ts}"
```

**`_Updated:` header cap:**
- Maximum: `_Updated: {ISO} — {agent-id} tick {brief-10-word-summary}_`
- NO accumulated history. Historical triage narrative belongs in `docs/agent-memory/sessions/{date}-{agent}.md` not in the live DASHBOARD header.

**Token-save estimate:**
- Current: ~38k tokens/read × 10+ agents × multiple reads/day ≈ 380k+ tokens/day
- After: Phase 1 SKIP (0 tokens, majority of reads when file unchanged) + Phase 2 section-only read (~200–400 tokens for own section with 2–5 NEW rows) ≈ ~2–4k tokens/day active reads + 0 for no-change reads
- Fleet-wide saving: **~95% reduction, ~370k tokens/day**

### 4.2 pipeline-state.json Structured Head

**New schema (backward-compatible migration):**

```json
{
  "_schema": "v2",
  "_maintained_by": "every agent at RETURN via agent-chaining-protocol",

  "head": {
    "status":          "idle | in_progress | blocked | stale",
    "active_task_id":  "TASK-ID or null",
    "next_agent":      "kebab-case-agent-id or null",
    "next_action":     "≤20-word one-line summary of next action",
    "wip":             0,
    "wip_max":         2,
    "updated_at":      "ISO-8601 UTC",
    "updated_by":      "agent-id"
  },

  "dashboard_section_cache": {
    "section_name":       "po",
    "start_line":         8,
    "last_mtime":         "ISO-8601 UTC",
    "last_linecount":     224
  },

  "narrative": {
    "_cap": "≤30 lines total — prune oldest on overflow",
    "current_sprint":  "≤2-sentence sprint description or null",
    "last_closed":     "≤2-sentence last-closed task summary or null",
    "watch_items":     ["≤10-word item", "..."],
    "open_sprints":    ["SPRINT-ID: ≤10-word status", "..."],
    "backlogs":        "compact dot-list ≤120 chars or null"
  },

  "session_handoff_status": { "...": "unchanged shape (backward compat)" }
}
```

**Routing contract for dev-team Step 0b:**
- Read `head.status` → route: `in_progress` spawns `head.next_agent`; `idle` falls through to Step 1
- Read `head.active_task_id` → claim key for dispatcher-wrap mutex
- Read `head.next_action` → one-line spawn prompt suffix (no prose parsing)
- `narrative.*` → lazy-loaded only on explicit resume (not on every tick cold start)

**Token-save estimate:**
- Current pipeline-state read: ~1,750 tokens (7 KB)
- After head-only read: ~150 tokens (head block ~600 bytes)
- Saving per tick: ~1,600 tokens × 24 ticks/day = ~38k tokens/day

**Migration:** on first write by any agent, detect `_schema` absent → emit v2 with head fields populated from best-effort parse of old prose fields (status from "IDLE"/"in_progress" prefix match; next_agent from first kebab word in old `nextAgent`). Old prose fields moved into `narrative`. One-time migration, no cross-agent coordination needed since pipeline-state is single-writer-at-a-time.

### 4.3 `_Updated:` Header Cap (trivial, high impact)

This is a one-line change to the signal-dashboard SKILL `## WRITE` and `## PRUNE` sections:

**Current instruction:** "update `_Updated: {ISO}` timestamp in line 4"

**New instruction:**
```
_Updated: {ISO} — {agent-id} {≤8-word tick summary}_
```
Hard cap. No accumulated history. If an agent wants to leave a triage narrative, it goes in its session log (`docs/agent-memory/sessions/{date}-{agent}.md`), not in the shared DASHBOARD header.

---

## 5. Contract Changes — Cross-Agent Impact

| Contract | Current | After |
|---|---|---|
| signal-dashboard SKILL § READ | Full file read, no cache | Phase-1 mtime/linecount check → Phase-2 section-only read with start_line cache |
| signal-dashboard SKILL § PRUNE | Optional, "cowork-team step" | Mandatory after every drain; drain-signals.md and cowork equivalents must call it |
| signal-dashboard SKILL § WRITE | Append row + update `_Updated:` (unlimited) | Same row append + cap `_Updated:` to one line |
| `pipeline-state.json` | Freeform prose, all fields | v2 schema: `head` block (routing fields only) + `narrative` block (capped, lazy) |
| dev-team `main.md` Step 0b | Reads full pipeline-state.json prose | Reads only `head` block for routing; `narrative` lazy |
| drain-signals.md | Reads DASHBOARD full file; no PRUNE step | Reads DASHBOARD via new SKILL READ (section-only); calls PRUNE after consumption |

**Backward compatibility:**
- SKILL change is in-place (SSOT) — all callers pick it up without per-agent edits
- pipeline-state.json v2 migration is one-time, self-healing (first writer detects `_schema` absent and upgrades)
- DASHBOARD rows and sections are not restructured — only the read strategy and `_Updated:` header format change
- `dashboard_section_cache` is additive to pipeline-state.json — no reader breaks on its presence/absence (treat as optional)
- In-flight ticks during migration: if `last_mtime` is absent → fall back to full section read (same as Phase 2 without Phase 1 skip). No data loss.

---

## 6. Implementation Sequencing (agent-father)

**Phase 1 — SKILL + PRUNE (highest impact, low blast radius)**
1. Edit `.claude/skills/signal-dashboard/SKILL.md`:
   - § READ: replace full-file-read with Phase-1 mtime check + Phase-2 section-only read + `start_line` cache contract
   - § WRITE: cap `_Updated:` to one line
   - § PRUNE: mark mandatory (not optional); add "called from drain-signals.md and cowork equivalents"
2. Edit `docs/agents/dev-team/flow/drain-signals.md`: add PRUNE call after step 0a-D row consumption
3. Immediate prune pass on DASHBOARD.md: remove DONE/stale-READ rows; cap `_Updated:` header to one line

**Phase 2 — pipeline-state.json restructure**
4. Edit `docs/pipeline-state.json`: restructure to v2 schema (head + narrative); migrate current content
5. Edit `docs/agents/dev-team/flow/main.md` Step 0b: read `head.status`/`head.next_agent`/`head.active_task_id` for routing; lazy-load `narrative` only on explicit resume

**Phase 3 — cowork equivalents (if needed)**
6. If any cowork agent has its own pipeline-state-equivalent file with the same prose-blob anti-pattern, apply the same v2 schema there (agent-father audit)

**Dependency order:** Phase 1 is independent of Phase 2. Both can ship in a single sprint. Phase 3 is optional follow-up.

---

## 7. Quantified Benefits Summary

| Metric | Before | After |
|---|---|---|
| DASHBOARD tokens/read (fleet) | ~38k tokens | ~0–400 tokens (skip or section-only) |
| Fleet-wide DASHBOARD cost/day | ~380k tokens/day | ~2–4k tokens/day |
| pipeline-state.json routing read | ~1,750 tokens | ~150 tokens (head only) |
| pipeline-state routing cost/day | ~42k tokens/day (24 dev-team ticks + cowork) | ~3.6k tokens/day |
| DASHBOARD dead row re-triage | Every tick (63 non-NEW rows) | Zero (prune enforced + skip on no-change) |
| Resume context quality | Prose-parse fragile | Enum + one-line routing, no re-parse |
| Total estimated fleet saving | — | ~410k tokens/day (~95% resume cost) |

---

## 8. Constraints Honoured

- **SSOT / DRY:** signal-dashboard SKILL is the single SSOT for DASHBOARD read/write/prune — one edit propagates to all callers
- **Lazy-load:** `narrative` block in pipeline-state.json is not loaded at routing time; `_Updated:` header no longer embeds history
- **Backward-compat:** all contract changes are additive or in-place replacements with fall-through on missing cache fields
- **No branches:** all work on `main`
- **agent-md-factory rules:** SKILL edit follows DRY / tree-DAG discipline; no circular dependencies introduced
- **Waterfall lazy-load:** mtime check (Phase 1) is a stat call, not a file read — zero token cost on no-change
