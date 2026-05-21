# Handoff — TASK_1967-07: market-watcher cycle.md append/overwrite + DASHBOARD prune (ITEM-05 + ITEM-08 + ITEM-15)

**Task:** 1967-07 | **Sprint:** 1967c | **Severity:** MED | **Size:** XS (3 items, all flow/.md edits)

---

## Summary

Three related flow/knowledge items:
1. **ITEM-05:** market-watcher/cycle.md says APPEND ONLY but canonical skill mandates OVERWRITE
2. **ITEM-08 + ITEM-15:** DASHBOARD unbounded growth + missing prune rule in signal-dashboard skill

All three are knowledge-file edits (no code). Bundle together for single PR.

---

## Evidence

**Brief cross-links:**
- ITEM-05: `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-05
- ITEM-08/15: same brief § ITEM-08, ITEM-15

**Repro paths:**
- ITEM-05: market-watcher/cycle.md Step 5 says "APPEND ONLY" but notebook-write skill mandates OVERWRITE
- ITEM-08: signal-dashboard SKILL.md has no CLOSE/PRUNE section; DASHBOARD.md 70+ historical rows grow unbounded
- ITEM-15: REQ-1967-1c done-criteria requires prune condition; skill has no cleanup trigger

---

## Current Behavior

### ITEM-05
- market-watcher cycle.md: "APPEND entry to notebook"
- But canonical `.claude/skills/notebook-write/SKILL.md` says OVERWRITE entire notebook

### ITEM-08 + ITEM-15
- DASHBOARD.md rows transition NEW→READ but are never deleted
- Over sessions DASHBOARD grows linearly (70+ rows as of 2026-05-21)
- Context token cost grows per cowork-team cycle
- signal-dashboard SKILL.md has no prune condition documented

---

## Expected Behavior

### ITEM-05
- market-watcher/cycle.md Step 5: "OVERWRITE notebook per `.claude/skills/notebook-write/SKILL.md`"
- Notebook stays ≤150L (feeds ITEM-04 fix)

### ITEM-08 + ITEM-15
- signal-dashboard SKILL.md CLOSE section: after marking READ, prune rows with `status IN (DONE, READ) AND ts < now() - 48h` → delete
- DASHBOARD.md stays bounded, context load stays low
- REQ-1967-1c compliance: explicit prune rule documented and enforced

---

## Proposed Fix

**Zone:** `.claude/` (knowledge files only, no code)

**Fix surface:**

1. **market-watcher/cycle.md:** Edit Step 5 instruction from "APPEND" to "OVERWRITE" + add reference link to `.claude/skills/notebook-write/SKILL.md`

2. **signal-dashboard/SKILL.md:** Add CLOSE section (after READ mark):
   ```
   ## CLOSE
   After marking row status=READ:
   If `(status IN (DONE, READ) AND ts < now() - 48h)` → DELETE row from DASHBOARD.md
   Dedup key: id (unique per signal)
   Frequency: cowork-team Step N (after all reads), or nightly cron via system-auditor
   ```

3. **mcp-tools.md:** Update signal_type table to cross-link "see also: DASHBOARD row prune rule in signal-dashboard SKILL.md"

**Blast radius:** 
- ITEM-05: notebook grows unbounded → context load grows → feeds ITEM-04 identity truncation
- ITEM-08/15: DASHBOARD grows unbounded → context token cost per cowork cycle increases

**Dependency chain:** 
- ITEM-05 → ITEM-04 (market-watcher identity, same PR candidate)
- ITEM-08 → ITEM-15 (same fix)

---

## Acceptance Criteria

1. [ ] market-watcher/cycle.md Step 5: "OVERWRITE" replaces "APPEND"
2. [ ] Notebook-write skill link added to cycle.md Step 5 comment
3. [ ] signal-dashboard SKILL.md CLOSE section added with prune rule
4. [ ] Prune rule is executable: `status IN (DONE, READ) AND ts < now() - 48h` → DELETE
5. [ ] mcp-tools.md cross-link added to DASHBOARD row prune rule
6. [ ] DASHBOARD.md can be manually pruned test: ≥1 old row meeting criteria removed ✓
7. [ ] Next cowork-team cycle post-fix: verify old DASHBOARD rows (>48h, status=READ) are pruned
8. [ ] tsc 0 errors

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `.claude/` (knowledge files)
- **Model:** claude-haiku-4-5-20251001

---

## Related

- ITEM-04 (market-watcher identity recurrence, same notebook trimming effort)
- REQ-1967-2e (flow identity vs declared responsibilities)
- REQ-1967-4e (DASHBOARD stale rows prune condition)
