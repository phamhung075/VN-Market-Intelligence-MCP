---
sprint: 1968c
branch: task/1968c-p01-tick-snapshot
size: M
zone: .claude/ + apps/mcp-server/
depends_on: []
blocks: [1968c-P02, 1968c-P03]
---

## TLDR
Write shared bootstrap + macro snapshot file on every 15-min cowork tick to eliminate 2 redundant `get_cycle_bootstrap` and 2 redundant `get_macro_snapshot` calls per tick. Cowork-team dispatcher writes `docs/data/cycle-snapshot-<TICK>.json` before spawning agents; agents read if ±5 min-fresh, fallback to direct call if absent/stale.

## [PM] Planning Context

**Zone:** `.claude/commands/` (cowork-team dispatcher) + `.claude/skills/cycle-bootstrap/` + 3 cowork agent flows

**Acceptance Criteria:**
- [ ] AC-1: `docs/data/cycle-snapshot-<TICK>.json` file written by cowork-team dispatcher immediately before agent spawn (Step -1 in main.md)
- [ ] AC-2: File format is JSON with keys: `tick` (HH:MM), `created_at` (ISO 8601), `market_context` (object), `macro_snapshot` (object)
- [ ] AC-3: Each spawned agent (news-scout, market-watcher, alert-commander, financial-analyst, report-analyzer) reads snapshot at cycle start; uses if timestamp ≤7 min old; falls back to direct `get_cycle_bootstrap` if absent, stale, or malformed
- [ ] AC-4: Agents skip file reading if `cycle-snapshot-<TICK>.json` does not exist → zero blocker on new agents or emergency manual spawns
- [ ] AC-5: File is NOT git-committed (add `docs/data/cycle-snapshot-*.json` to `.gitignore`)
- [ ] AC-6: MCP call reduction verified: cowork cycle logs show 2 fewer `get_cycle_bootstrap` + 2 fewer `get_macro_snapshot` per tick (before: 3 bootstrap + 3 macro per tick; after: 1 bootstrap + 1 macro + shared file read)
- [ ] AC-7: Fallback path tested: manually delete snapshot file → next cycle reads it as absent → agents execute direct call + log fallback event
- [ ] AC-8: No regressions: market-watcher, news-scout, alert-commander produce identical signal output pre/post snapshot write

**Files to read first:**
- `.claude/commands/cowork-team.md` (dispatcher structure, Step 0–3)
- `.claude/skills/cycle-bootstrap/SKILL.md` (current bootstrap read pattern)
- `.claude/flows/market-watcher/cycle.md` (line 1–50, Step 0 bootstrap call)
- `.claude/flows/news-scout/stage-bootstrap.md` (Step 0 bootstrap pattern)
- Brief: `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § L-6 Tier 2

**Files to create:**
- None new (snapshot file is ephemeral, not versioned)

**Files to modify:**
- `.claude/commands/cowork-team.md` — Add snapshot write step (5–10 lines) before main agent spawn loop. Use atomic write (write to tmpfile, then rename).
- `.claude/skills/cycle-bootstrap/SKILL.md` — Add Step -1 (8–15 lines): check for `docs/data/cycle-snapshot-<TICK>.json`, read if ≤7 min old, populate `$CYCLE_SNAPSHOT` variable, skip direct `get_cycle_bootstrap` if loaded.
- `.claude/flows/news-scout/stage-bootstrap.md` — Step 0c: read `$CYCLE_SNAPSHOT` variable from skill; if set, skip `get_cycle_bootstrap` call; else call direct (backward compat).
- `.claude/flows/market-watcher/cycle.md` — Step 0 early (before current bootstrap call): same check for `$CYCLE_SNAPSHOT` variable.
- `.claude/flows/alert-commander/cycle.md` (or stage-bootstrap.md equiv) — same pattern.
- `.claude/flows/financial-analyst/cycle.md` — optional; if present, apply same pattern.
- `.claude/flows/report-analyzer/cycle.md` — optional; if present, apply same pattern.
- `.gitignore` — Add line: `docs/data/cycle-snapshot-*.json`

**Dependencies:** None (can pair with P02/P03 in parallel)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (atomic file writes, error handling)
- `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` § 3 Context-Tracking Safeguards § L-6

## [Developer] Implementation Notes

### Snapshot Write (cowork-team.md)
```bash
# Step -1: Write shared cycle snapshot before agent spawn
FILE_TICK=$(date +%H:%M)
SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"
TMPFILE="${SNAPSHOT_FILE}.tmp"
# Write to tmp first
jq -n --arg tick "$FILE_TICK" \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --argjson market_context "$MARKET_CONTEXT" \
  --argjson macro_snapshot "$MACRO_SNAPSHOT" \
  '{tick: $tick, created_at: $created_at, market_context: $market_context, macro_snapshot: $macro_snapshot}' \
  > "$TMPFILE"
# Atomic rename
mv "$TMPFILE" "$SNAPSHOT_FILE"
```

### Snapshot Read (cycle-bootstrap SKILL)
```bash
# Step -1: Check for tick snapshot
SNAPSHOT_FILE="docs/data/cycle-snapshot-${CURRENT_HOUR}:${CURRENT_MIN}.json"
if [[ -f "$SNAPSHOT_FILE" ]]; then
  AGE_SECS=$(($(date +%s) - $(stat -f%m "$SNAPSHOT_FILE" 2>/dev/null || echo 0)))
  if [[ $AGE_SECS -lt 420 ]]; then  # 7 min = 420 sec
    CYCLE_SNAPSHOT=$(cat "$SNAPSHOT_FILE")
    export CYCLE_SNAPSHOT
  fi
fi
```

### Agent-side fallback (news-scout stage-bootstrap.md)
If `$CYCLE_SNAPSHOT` is set and valid, extract `market_context` and `macro_snapshot` from it; skip Step 0c direct call. Otherwise fall through to current Step 0c logic.

---

## [QA] Review Record
_(To be filled by QA upon task completion)_

- [ ] Snapshot file created with correct schema on each tick
- [ ] All 5 agents tested: bootstrap calls reduced and fallback verified
- [ ] Stale/absent snapshot handled gracefully
- [ ] No git artifacts from snapshot file
- [ ] 48-hour live observation: zero missed ticks, zero false-stale scenarios

---

## [PM] Handoff Summary
**Tier 2 token economy lever (Phase 3).** Shared snapshot reduces 4 redundant MCP calls per 15-min cowork tick = ~168 calls per trading-day savings. Pairs in parallel with 1968c-P02 and 1968c-P03. No schema changes, no DB writes. Context-tracking safeguard: fallback path ensures zero blocker if snapshot write fails. Brief §3 L-6 safeguard checklist applies.
