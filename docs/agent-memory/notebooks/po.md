# PO Notebook

**Cycle:** Filed BUG DEPLOY-DRIFT (5 tasks) from 2026-05-25 macro+kinh-dich incident leftovers. (Prior 07:06Z mcp-server/build-wave governance preserved below.)
**Last update:** 2026-05-25T07:08Z
**Status:** DRIFT-1 + DRIFT-2 READY (dispatch NOW, parallel). DRIFT-3 architect design-lane. DRIFT-QA + DRIFT-CLOSE gated. mcp-server Phase-0 still HELD pre-0; build-wave A→B→C→D serialized (07:06Z cycle).

---

## 2026-05-25T07:08Z — DEPLOY-DRIFT incident follow-ups filed

User reported (via main terminal) 2 leftover drift items + 1 systemic guard from today's macro+kinh-dich outage. Connectivity root cause ALREADY fixed (`a5b6203d` Docker-net hostname env vars + `3bd9e6ae` corrected `MACRO_INDICATORS_URL`). These are the residual stale-image drift, NOT the outage.

**Verified before filing (didn't trust the report blindly):**
- `a5b6203d` + `3bd9e6ae` both in git log; `3bd9e6ae` message itself documents `get_macro_calendar: HTTP 404` as a known leftover.
- Go calendar handler EXISTS: `apps/macro-indicators/pkg/interface/http/handlers_calendar.go` → DRIFT-1 = deploy-Go OR backport-to-TS decision (dev-macro-indicators).
- kinh-dich Dockerfile = "Go reboot from TS/Bun"; `cmd/server/main.go`; latest `746dee48` → DRIFT-2 = pure REDEPLOY (ops), code already at HEAD, NOT a dev code change.

**Priority = HIGH (reliability tier, top of PO order).** Outranks all active structural work BUT these are small targeted redeploys/route-fix, NOT pilots → general dev/ops lane, do NOT consume WIP=2 fleet cap, no `pilot-status-*` touch.

**Routing:** DRIFT-1 → dev-macro-indicators + ops. DRIFT-2 → ops (dev-kinh-dich standby). DRIFT-3 → architect design (per-service verify vs shared deploy-gate) → owner/cross-service dev. DRIFT-QA → qa. DRIFT-CLOSE → po.

**Recurring-bug guard ENGAGED:** deploy-drift CLASS = 2 instances same root cause (image lags commit). DRIFT-3 IS the structural response per feedback_recurring_bug_escalation.md, not a 3rd one-off. 3rd drift before DRIFT-3 lands → block all deploys.

**False-green guard baked into DONE CONDITION:** verify END-TO-END through mcp-server, not direct curl (3bd9e6ae lesson). DRIFT-3 needs a deliberate-stale-image proof.

**Cross-check vs 07:06Z build-wave governance:** DRIFT touches macro + kinh-dich + cross-service zones, NOT mcp-server barrels → does NOT disturb the mcp-server quiesce/RUN-SOLO gate or WAVE-B. Independent reliability lane, safe alongside the structural waves.

Filed: `docs/TASKS.md` § BUG DEPLOY-DRIFT (top, above all sprints) + `docs/handoffs/TASK_DEPLOY-DRIFT.md` (spec).

---

## 2026-05-25T07:06Z — mcp-server Phase-0 + build-wave governance (USER "do both")

**Channel audit:** Telegram read NOT performable from this agent harness (no `read_telegram_reports`/`call_tool` exposed; real call → "No such tool", capability gap not MCP outage). Board audit instead: TASKS.md + git log + container-clean.
- mcp-server SOURCE tree CLEAN; NEWS-INGEST-2/-2b still READY → mcp zone NOT quiesced; Scale WIP=2 FULL (P2-F2 + P2-A1).

**DECISION 1 — mcp-server Phase-0 = HELD pre-0.** Charter §Sequencing RUN-SOLO/LAST non-negotiable; 3 unmet unblock conditions. Recorded in `sequencingGate`.
**DECISION 2 — analysis-only architect track runs NOW in parallel (read-only brownfield over ~132 tools, zero write contention).** Pre-seeded P0-MCP-1..5+EXIT (HELD).
**DECISION 3 — BUILD = SERIALIZED.** Waves: A frontend-build → B mcp-server-build-SOLO → C ops rebuild+live-health → D qa regression. Gates between each.

---

## Carry-over
- DRIFT-1 + DRIFT-2 dispatch-eligible NOW, parallel (isolated zones, zero collision w/ NEWS-INGEST/BCTC-TABLE/P2-TA/P0-SP/frontend-P0). DRIFT-3 on architect lane (P2-F2 occupies agent-father, NOT architect → no contention). DRIFT-QA gates -1+-2; DRIFT-CLOSE on QA.
- mcp-server Phase-0 opens FUTURE cycle (P0-MCP-4) only when 3-condition gate clears. WAVE B (mcp build) dispatch only after WAVE A settles + gate clears.
- NEWS-INGEST-2 (`developer`)+2b (`dev-mcp-server`) READY; NEWS-INGEST-3 qa gates both; ops NEWS-INGEST-LIVE final truth gate (also quiesces mcp zone for WAVE B).
- Other live: BCTC-TABLE (BT-1+BT-0), KD-QREF-LANG-1 architect, P2-TA, P0-SP, frontend P0-FE-1/-2. WIP=2 fleet cap on PILOTS only.
