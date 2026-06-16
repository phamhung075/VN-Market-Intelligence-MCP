# Decision Journal — Sprint INFOCARD-EXPAND-FETCH · qa

**Sprint goal:** INFOCARD-EXPAND-FETCH epic — every served info element must link its source + expand to full fetched detail on click.
**Agent:** qa
**Started:** 2026-06-16T19:12:00Z

---

### STEP qa-S1 · qa · 2026-06-16T19:12:00Z
**task-id:** FIX-SIGNALS-STOCK-FULL-DETAIL
**what-done:** Full QA gate on backend handler extraction (commit 6abf4d19, stockSignalsHandler.ts). 22/22 targeted tests GREEN. TSC exit 0. DDD PASS. Security PASS. mock-guard EXIT 0. Genericity PASS (no signal_type switch, no ticker hardcode). No-fake-data PASS (null finding_data returns null, never fabricated). DJ entry present in sprint-FE-PAGE-REORG-dev-mcp-server.md §dev-mcp-server-S5.
**what-considered:**
- Only path: all checks green — bun test 22 pass / 0 fail / 59 expect(); tsc exit 0; DDD clean; security clean; mock-guard exit 0; no ticker/signal_type hardcode; honest-null on unparseable
**why-decision:** APPROVED. Code is generic (querySignalsForStock handles all signal types via JSON passthrough), honest (null→null, never fabricated), and well-tested.
**why-change:** No change from plan.

---

### STEP qa-S2 · qa · 2026-06-16T19:14:00Z
**task-id:** FIX-CASCADE-CARD-INVALID-DATE
**what-done:** Full QA gate on formatDate.ts (commit 60652af3). vitest full suite: 1695 pass / 2 fail — 2 failures are QUE-REFERENCE-PAGE-detail.test.ts + QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx, both introduced at commit d7167c0a (2026-06-13), ZERO diff between d7167c0a..60652af3 on those files — pre-existing and disjoint confirmed. TSC exit 0. DDD PASS. Security PASS. mock-guard EXIT 0. No date-literal special-cases (grep clean). No per-card/ticker hardcode. parseDate returns null on NaN — "Invalid Date" impossible. Honest "—" fallback. DJ entry present in sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md §dev-frontend-S1.
**what-considered:**
- Disjoint-failure-set test: QUE test files zero-diff from d7167c0a to 60652af3; INFOCARD commits touch none of QUE_DESCRIPTIONS/que-descriptions.generated.ts — pre-existing confirmed per [[feedback_ci_red_can_be_flaky_confirm_before_blame]]
- No per-card/date-literal hardcode anywhere in formatDate.ts
- Honest empty-state: returns "—" not "Invalid Date"
**why-decision:** APPROVED. Helper is generic, honest, and well-tested.
**why-change:** No change from plan.

---

### STEP qa-S3 · qa · 2026-06-16T19:16:00Z
**task-id:** FIX-INFOCARD-DROPDOWN-EXPAND
**what-done:** Full QA gate on InfoCardExpand.tsx + domain/market.ts + client.ts + dashboard.analysis.tsx (commit a20b2d18). vitest full suite: 1695 pass / 2 fail (same 2 pre-existing QUE failures, disjoint). TSC exit 0. DDD PASS. Security PASS. mock-guard EXIT 0. Genericity PASS: zero ticker hardcode, zero signal_type special-case in InfoCardExpand (FIELD_LABELS is purely a UX label map, not a data branch). Honest empty-state: "Không có dữ liệu chi tiết." when both findingData null and source null. Vietnamese-only user-facing strings. aria-expanded + CollapsibleTrigger keyboard accessible.
BLOCKER FOUND: DJ-GATE-1 — no `task-id:** FIX-INFOCARD-DROPDOWN-EXPAND` entry exists in docs/agent-memory/decisions/sprint-INFOCARD-EXPAND-FETCH-dev-frontend.md. Commit a20b2d18 did not include a DJ file for task #3. The dev-frontend DJ only covers FIX-CASCADE-CARD-INVALID-DATE (§dev-frontend-S1). Flow requires DJ before DONE flip.
**what-considered:**
- Code itself passes all checks (tests green, tsc clean, genericity clean, honest empty-state)
- DJ-GATE-1 is a mandatory gate per flow § Approval: "verify sprint-<SPRINT_ID>-*.md contains task-id:** <TASK_ID>; if absent → status stays REVIEW, status_note: journal-missing"
- This is a process gap, not a code defect — a minimal CHANGES_REQUESTED round to add the DJ entry is the lowest-friction resolution
**why-decision:** CHANGES_REQUESTED (DJ-GATE-1 only) — one file to add, no code change needed. Round count = 1 (fixer round, not architect escalation).
**why-change:** Code is APPROVE-QUALITY; only process gate missing.
