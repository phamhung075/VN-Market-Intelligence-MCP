# Decision Journal — Sprint FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH · qa

**Sprint goal:** Re-route bctc-analyst ESC-1..5 escalation dispatch off bash `jq | orch-apply.sh` (agent has no Bash tool) onto Write-tool signal files under docs/signals/, drained by dev-team.
**Agent:** qa
**Started:** 2026-07-02T02:38:08Z

---

### STEP qa-S1 · qa · 2026-07-02T02:38:08Z
**task-id:** FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH
**what-done:** Verified commit 881e38f1 RAW against filesystem/git: grepped all 3 touched bctc-analyst flow files (main.md, esc-coverage-guard.md, deep-dive-opus.md) for bash/jq/orch-apply.sh — only explanatory "NO Bash" comments remain, all 3 direct-write points now use `Write(path="docs/signals/bctc-analyst-{ts_compact}.json", ...)`.
**what-considered:**
- Trust review_note claim vs re-derive from diff — chose re-derive: ran `git show 881e38f1 -- <file>` per touched file to see exact before/after, not just final state.
- Whether `esc-deep-dive-request`/`data-coverage-gap`/`deep_dive_result` all need explicit drain-signals.md routing rows, or only the literal ESC-dispatch type.
**why-decision:** Read live orch-state.json `.task_board` REVIEW entry's `status_note` (read-only) — AC is scoped to ESC-3/ESC-4 escalation firing "WITHOUT any no-Bash BUG telegram" via `esc-deep-dive-request`; confirmed that type IS in drain-signals.md 0a-3 table (pre-existing row, unmodified by commit) routing to ESC-DISPATCH, with dual-source (dashboard|file) handling added to drain-esc-dispatch.md this commit. The other 2 emitted types (data-coverage-gap, deep_dive_result) lack dedicated routing rows in both drain-signals.md and po/triage-signals.md — pre-existing gap (unchanged by this commit, same "unknown type → log+skip+WORK-notify" fallback existed before), out of this task's literal AC scope — flagged as non-blocking observation.
**why-change:** no change — verdict APPROVE, findings reported as observations for follow-up ticket.
