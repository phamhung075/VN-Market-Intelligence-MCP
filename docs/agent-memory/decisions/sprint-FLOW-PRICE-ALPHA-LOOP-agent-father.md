# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · agent-father

**Sprint goal:** FLOW-PRICE-ALPHA-LOOP (active sprint at task pickup time)
**Agent:** agent-father
**Started:** 2026-07-20T22:00:00Z

---

### STEP agent-father-S1 · agent-father · 2026-07-20T23:15:00Z
**task-id:** FIX-CMH-OBSOLETE-FILE-CLEANUP
**what-done:** Added claude-manager-helper Pass 0b (quarantine-first obsolete-file cleanup) + fixed Pass 0 disposition (no longer relocates pattern-A/B garbage into committable docs/archive/); shipped policy SSOT + reusable script.
**what-considered:**
- Script directly calls send_telegram via scripts/agents-flow/mcp-call.sh (self-contained, testable) vs. relying on the calling agent to relay stdout markers — chose direct call since claude-manager-helper's frontmatter tools list is Bash-only (no MCP tool), matching the emit-audit-signal.sh precedent for that agent class.
- Pattern-C day-grouping: filename-embedded date for unified-agent-synthesis vs. mtime-derived day for cycle-snapshot (no date in its filename) — two extraction paths, documented in script comments.
- Excluded cycle-snapshot-latest.json from Pattern C (active pointer file, not per-cycle ephemera) — a defensive addition beyond the literal brief text, to avoid deleting a live-referenced pointer.
**why-decision:** Brief (docs/handoffs/2026-07-20-obsolete-file-cleanup-janitor-pass.md) fully specified AC1-AC5+AC1b; implementation choices above fill genuine spec gaps without expanding scope.
**why-change:** No change from brief scope. Live quarantine of $DUMP_FILE / coverage-state.json.tmp deliberately left for the first real Pass 0b cron tick per router instruction — verified via --dry-run against the live tree instead.
