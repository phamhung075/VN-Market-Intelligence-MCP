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

### STEP qa-S3 · qa · 2026-07-10T03:39:51Z
**task-id:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST
**what-done:** Review-drain sweep (router-dispatched, no board row): RAW-probed live named-volume market.db — NOT safe to sign off, left BLOCKED with fresh evidence + backfilled entered_review_at.
**what-considered:**
- Trust blocked_on prose as still-accurate — verified instead: financial_reports total_assets=0.0 live, 0 balance_sheet-tagged bctc_table_rows for report 96e36139, both AC-6/AC-10 unmet
- Whether deploy already happened — yes (container rebuilt 2026-07-09T12:51Z, postdates fix commit d69b13f41 2026-07-03T08:03:47Z) but the live 451 rows were extracted_at 2026-07-03T05:16:10Z, BEFORE the fix — reingest never re-ran with fixed code
**why-decision:** Corroborates sibling CTG-CARRY-FORWARD qa finding (S2 above) that balance_sheet may be genuinely absent from source, not just a stale reingest — flagged as escalation path in status_note. next_agent unchanged (ops): re-run reingest first.
**why-change:** No change — genuinely still blocked, this was a verification pass not a fix.

### STEP qa-S4 · qa · 2026-07-10T03:39:51Z
**task-id:** W5-FU-CTG-REFINE-96e36139
**what-done:** Review-drain sweep: same root cause/blocker as S3 (this task's own declared unblock target) — left BLOCKED, backfilled entered_review_at from its own dispatcher review_note timestamp.
**what-considered:** No separate probe needed — identical live evidence applies (same report_id, same fix commit gap).
**why-decision:** STEP1 refine (56/56 DONE) already complete per this row's review_note; STEP2 reingest ran pre-fix and must be re-run now the classifier fix is live. Not safe to close.
**why-change:** No change from plan.
