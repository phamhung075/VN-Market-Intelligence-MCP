# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · qa

**Sprint goal:** W4 bank total_assets mapping fixtures + total_liabilities exclusion fix; generic markdown row-repair for corrupted bank-form rows.
**Agent:** qa
**Started:** 2026-07-02T01:07:00Z

---

### STEP qa-S1 · qa · 2026-07-02T01:10:00Z
**task-id:** CLEAN-DELETE-STRAY-BUN-CACHE-MCP-SERVER
**what-done:** Deleted stray untracked bun install cache dir `apps/mcp-server/~` (26M, gitignored via .gitignore:5) after passing all 3 RAW pre-checks (dir exists+size, no tracked files, ignore-match confirmed).
**what-considered:**
- rm -rf quoted+./-prefixed path — only safe option, prevents tilde shell-expansion to $HOME
- leave in place — rejected: sole source of mock-guard --full CAUTION-block noise (ajv/path-key/zod bundled TODOs), physical dead debt
**why-decision:** Pre-checks all green; deletion is reversible via bun install if ever needed; zero risk to tracked source.
**why-change:** no change — matched dispatcher-issued steps exactly.

### STEP qa-S2 · qa · 2026-07-10T01:24:00Z
**task-id:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD
**what-done:** RAW-verified dev-mcp-server's REVIEW handoff live (docker exec readonly): AC-TRACK1-1/2/4/5/6 PASS confirmed exactly; AC-TRACK1-3 escalation corroborated legitimate by cross-checking all 4 other orphaned report_ids (none are CTG). Found DJ-GATE-1 journal missing for this task-id — held board REVIEW instead of flipping done_verified.
**what-considered:**
- Trust self-report and flip done_verified — rejected, DJ-GATE-1 explicitly blocks this + own gate is MANDATORY
- CHANGES_REQUESTED full round-trip to fixer — rejected, no code defect found, would misroute a paperwork gap as a code fix
- APPROVE + hold at REVIEW with status_note, route next_agent→dev-mcp-server for the one missing entry — chosen
**why-decision:** All technical PASS claims independently reproduced from live data; AC-TRACK1-3 escalation is a genuine root-cause gap (balance_sheet section absent from source, no rescue orphan matches CTG) correctly left unfabricated. Only blocker is the agent's own DJ-GATE-1 journal entry, which is non-code and fast to fix — CHANGES_REQUESTED (code round-trip) would be the wrong instrument.
**why-change:** dispatcher asked for APPROVE/CHANGES_REQUESTED/REJECT; landed on a 4th precise state (APPROVE-substance + DJ-GATE-1 hold) because the flow's own gate spec names this exact scenario and neither of the other two verdicts describes it accurately.
