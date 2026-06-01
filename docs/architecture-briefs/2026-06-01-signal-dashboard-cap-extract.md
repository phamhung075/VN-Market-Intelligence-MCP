# Architecture Brief — RE-CAP-1: signal-dashboard SKILL.md lazy-load extraction

**Date:** 2026-06-01
**Author:** agents-architect
**Task:** RE-CAP-1 (Sprint NB-PRUNE-FIX, commit 74caacf9)
**Status:** READY-FOR-IMPL

---

## Problem

`.claude/skills/signal-dashboard/SKILL.md` is 192L against the skill-file cap of 120L
(overage: 72L). The oversize was introduced in commit `b38ac812 feat(resume-economy)` which
added load-bearing resume-economy contracts (§READ two-phase delta-read, §WRITE `_Updated:`
cap, §PRUNE mandatory protocol). These contracts cannot be deleted — the fleet's ~410k
token/day DASHBOARD resume-economy depends on them.

**Fix:** lazy-load extraction — move the full protocol bodies of §WRITE, §READ, and §PRUNE
into a single sibling child file `.claude/skills/signal-dashboard/dashboard-protocol.md`,
leaving SKILL.md with the frontmatter + concise contract summary for each section + explicit
pointer to the child. All other sections (§ACK/CLOSE, §Payload Pointer Discipline,
§Signal types, §Docs to read) stay in SKILL.md — they are small lookup tables / simple rules
that agents need inline.

---

## Affected Files

| File | Action | Projected L |
|---|---|---|
| `.claude/skills/signal-dashboard/SKILL.md` | Rewrite (condense §WRITE/§READ/§PRUNE bodies → summaries + pointers) | ≤120L |
| `.claude/skills/signal-dashboard/dashboard-protocol.md` | Create (full bodies of §WRITE/§READ/§PRUNE) | ~110L |

**No other files change.** Callers reference the skill as
`.claude/skills/signal-dashboard/SKILL.md` — that path is unchanged. The PRUNE call in
`docs/agents/dev-team/flow/drain-signals.md` (step 0a-D-PRUNE) references
`.claude/skills/signal-dashboard/SKILL.md § PRUNE` — it remains resolvable because §PRUNE
stays in SKILL.md as a summary section with its mandatory-call statement intact and a pointer
to the full protocol in the child.

---

## Extract Boundary (exact line ranges from SKILL.md @ 192L)

### Sections staying in SKILL.md (condensed)

| Lines | Section | Keep / Condense |
|---|---|---|
| L1-5 | size-justification comment + frontmatter | Keep; update comment to reflect new line count |
| L6-12 | Header, File, Rule | Keep as-is (~8L) |
| L14-25 | `## Sections (reader agents)` table | Keep as-is (~12L) |
| L27-48 | `## WRITE` body | **Condense** to ~8L summary + pointer |
| L50-100 | `## READ` body | **Condense** to ~10L summary + pointer |
| L104-109 | `## ACK / CLOSE` | Keep as-is (~6L) |
| L112-138 | `## PRUNE` body | **Condense** to ~10L summary + pointer |
| L141-165 | `## Payload Pointer Discipline` | Keep as-is (~25L) |
| L168-178 | `## Signal types (canonical)` table | Keep as-is (~11L) |
| L181-192 | `## Docs to read per signal type` table | Keep as-is (~12L) |

### Sections moving to `dashboard-protocol.md`

| SKILL.md Lines | Section | Move to child |
|---|---|---|
| L27-48 | `## WRITE` full body (template row, rules, `_Updated:` cap) | Yes |
| L50-100 | `## READ` full body (Phase 1 stat block, Phase 2 steps, cache contract JSON) | Yes |
| L112-138 | `## PRUNE` full body (numbered steps, thresholds, archive format, dedup key) | Yes |

---

## Target SKILL.md structure (post-extraction, ≤120L)

```
L1       : <!-- size-justification: ~118L — ... -->
L2-5     : --- frontmatter ---
L6-12    : # Signal Dashboard — Communication Skill (header + File/Rule)
L14      : ---
L15-25   : ## Sections (reader agents) — table as-is
L27      : ---
L28-35   : ## WRITE — append a signal row
             Summary: id/ts/status format, template row shape, `_Updated:` ONE-line cap.
             → Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § WRITE`
L37      : ---
L38-47   : ## READ — two-phase delta-read (0–400 tokens vs 38k full-file)
             Summary: Phase 1 = stat mtime+linecount, skip if unchanged. Phase 2 = section-only
             offset read, collect NEW rows, mark READ, update cache.
             Cache key: `dashboard_section_cache` in pipeline-state.json (dev-team) or
             spawn-prompt (cowork agents).
             → Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § READ`
L49      : ---
L50-55   : ## ACK / CLOSE — as-is
L57      : ---
L58-68   : ## PRUNE — MANDATORY after every drain/consume cycle
             Summary: Remove DONE rows immediately (archive first). Remove READ rows after 48h
             (archive first). Cap _Updated: to ONE line. Commit DASHBOARD.md + ARCHIVE.md.
             NEW rows NEVER pruned.
             → Full protocol: `.claude/skills/signal-dashboard/dashboard-protocol.md § PRUNE`
L70      : ---
L71-95   : ## Payload Pointer Discipline — as-is (Rules 1-3)
L97      : ---
L98-110  : ## Signal types (canonical) — table as-is
L112     : ---
L113-120 : ## Docs to read per signal type — table as-is
```

Projected line count: **~118L** (within 120L cap).

---

## Child file `dashboard-protocol.md` structure (~110L)

```
L1       : <!-- size-justification: ~108L — full protocol bodies for §WRITE/§READ/§PRUNE
             extracted from SKILL.md per RE-CAP-1 to satisfy 120L skill-file cap.
             Load this file when you need the step-by-step procedure, not just the contract. -->
L2-5     : --- frontmatter (name: signal-dashboard-protocol, no description trigger needed) ---
L6       : # Signal Dashboard — Full Protocol Bodies
L7       : > Parent: `.claude/skills/signal-dashboard/SKILL.md`
L9-30    : ## WRITE — full body (template row, rules, _Updated: cap)
L32      : ---
L33-83   : ## READ — full body (Phase 1 stat block, Phase 2 numbered steps, cache contract JSON,
             fallback/error rules)
L85      : ---
L86-108  : ## PRUNE — full body (numbered steps, thresholds, archive format, dedup key, NEW-never-prune rule)
```

---

## Invariants Preserved

1. **SKILL.md § PRUNE stays callable:** drain-signals.md references
   `.claude/skills/signal-dashboard/SKILL.md § PRUNE` — the section header + mandatory-call
   statement + pointer remain present; the pointer directs to `dashboard-protocol.md § PRUNE`
   for the step-by-step. Callers that already know the steps (drain-signals.md embeds them
   inline in step 0a-D-PRUNE) are unaffected.

2. **Resume-economy contract intact:** the §READ two-phase summary in SKILL.md is sufficient
   for any agent to understand the skip/read decision; agents needing the exact Phase 2 step
   list load `dashboard-protocol.md`. No behavioral change — the full bodies still exist.

3. **No circular DAG:** `dashboard-protocol.md` has no `always_load` trigger (it is lazy,
   loaded only when a caller explicitly needs the full procedure). SKILL.md does not load it
   on its own — it is a pointer, not an include.

4. **DRY / SSOT:** the protocol body exists exactly once — in `dashboard-protocol.md`. The
   SKILL.md summaries are intentionally condensed, not copies; they do not duplicate the step
   lists.

5. **Frontmatter on line 1 rule:** `dashboard-protocol.md` must start with `---` on line 1
   (agent-frontmatter-on-line-1 policy). The size-justification comment moves to line 1 of
   the frontmatter block as a YAML comment: `# size-justification: ...` inside the `---` block.
   Wait — the existing SKILL.md pattern uses an HTML comment BEFORE the frontmatter. To
   comply with frontmatter-on-line-1: `dashboard-protocol.md` must start with `---` on L1.
   The size-justification goes as a YAML `# comment` inside the frontmatter, or is omitted
   (child files under a skill dir are not governed by file-size-caps.json pattern
   `.claude/skills/**/*.md` only if they end in `SKILL.md` — but to be safe, keep the
   comment inside the frontmatter block).

   **Ruling:** `dashboard-protocol.md` starts `---` on line 1, with `# size-justification`
   as first line inside the YAML block (before `name:`).

---

## Implementation Steps for agent-father

1. **Create** `.claude/skills/signal-dashboard/dashboard-protocol.md`:
   - Frontmatter on L1 (`---`), with `# size-justification` comment inside YAML block.
   - `name: signal-dashboard-protocol`
   - `> Parent:` pointer on first line after closing `---`.
   - Copy verbatim: §WRITE body (SKILL.md L27-48), §READ body (SKILL.md L50-100),
     §PRUNE body (SKILL.md L112-138) — with their `---` separators and section headers.

2. **Rewrite** `.claude/skills/signal-dashboard/SKILL.md`:
   - Update size-justification comment to reflect post-extraction line count (~118L).
   - Keep frontmatter unchanged (name/description fields).
   - Replace §WRITE body with condensed summary + pointer line.
   - Replace §READ body with condensed summary + pointer line.
   - Replace §PRUNE body with condensed summary + pointer line.
   - Keep all other sections verbatim (§Sections table, §ACK/CLOSE, §Payload Pointer
     Discipline, §Signal types, §Docs to read).
   - Verify `wc -l` ≤ 120 before committing.

3. **Verify** pointer integrity:
   - `wc -l .claude/skills/signal-dashboard/SKILL.md` → must be ≤ 120
   - `ls .claude/skills/signal-dashboard/dashboard-protocol.md` → must exist
   - Grep SKILL.md for `dashboard-protocol.md` → must find pointer in §WRITE, §READ, §PRUNE

4. **Commit** (C3-exempt hygiene):
   ```
   git add .claude/skills/signal-dashboard/SKILL.md \
           .claude/skills/signal-dashboard/dashboard-protocol.md
   git commit -m "refactor(skills/signal-dashboard): RE-CAP-1 lazy-load extract protocol bodies to dashboard-protocol.md (192L→≤120L)"
   ```

---

## Signal

Drop `brief_complete` to agent-father via DASHBOARD.md § agent-father row.
Signal payload: this brief path.
