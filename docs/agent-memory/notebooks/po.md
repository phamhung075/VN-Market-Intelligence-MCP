# PO Notebook

## Last updated: 2026-05-14 (c99 re-triage — 1910a USER-STOPPED → RESTART as 1910a-retry)

---

## Cycle 99 re-triage — 1910a USER-STOPPED classification + restart

**Input:** tnb c52 explicit re-triage request for 1910a USER-STOPPED. WIP=0/2 (1912a SHIPPED c99). 1909c HOLD intact.

### Evidence gathered
- Original spec `docs/specs/1910-fred-ism-subcomponents-and-effr-package-reg.md` §3.1 read in full — atomic reqs intact (FRED fetcher, regime classifier, cron piggyback `macroIndicatorRefreshJob`, AC-1..7).
- TASKS.md L27: 1910a marked USER-STOPPED c97, "no commits, no merge attempted, worktree may persist".
- Router c97 close commit `924419d6`: "user-stopped mid-flight; partial work preserved stash@{0} `1910a-user-stopped-c97-worktree-leak`; project-stats.json premature toolCount bump reverted; task moved back to Todo".
- Stash @{0} content: 10 files +59/-4 (fetcher index, domain macro index, tool registry, agentBootstrap, macroIndicatorRefreshJob, SKILL_MANIFEST, 3 package docs).
- `architect.md` L30: "1912-go-migration-program. User-approved option 3 (selective Go rewrite) **post-1910a stop**" — user pivoted attention to 1912 Go program, NOT a defect in 1910a.
- `pm.md` L50: FRED_API_KEY confirmed in `.env` line 23 (precondition met).
- `git log -- '*ism*'`: zero prior ISM commits → recurring-bug rule does NOT apply.
- Architect SD-1 already resolved (PATH-a FRED REST API key) per architect c94 rubber-stamp `a34f04d8`.

### Classification
**Stop reason = (E) User explicit attention pivot** to 1912 Go-migration program (architect notebook L30 + c97 commit message). NOT class A (no failed test/build), NOT class B (no design issue), NOT class C (FRED_API_KEY already in `.env`), NOT class D (spec still aligned with bottom-up COC pillar). Pure scheduling stop — work preserved cleanly, no rollback baggage.

### Decision
**RESTART as `1910a-retry-ism-tool`** under existing spec — no spec rewrite needed. Spec §3.1 + AC-1..7 stand. TNB c52 re-triage request = the user signal c98 was waiting on (notebook L27). Conditions to restart now:
- 1912a-gateway-go-migration SHIPPED c99 (TASKS.md L49) → WIP free.
- 1909c still HOLD (2026-05-16 reparse) → does not block.
- FRED_API_KEY present.
- No recurring-bug escalation.

### WIP plan
- Restart 1910a-retry-ism-tool, owner dev-mcp-server, existing handoff `TASK_1910a-ism-tool.md`, existing spec.
- Developer optionality on stash@{0}: cherry-pick partial work OR discard and restart fresh. Stash is convenience, not gospel — c97 stop was scheduling, not defect, so the 10-file partial diff is structurally sound but developer must own integration choice.
- Spec file unchanged; no new spec file required.

### Channel audit
- Skipped MARKET/WORK/BUG read this cycle (single-task re-triage, gateway substrate per c98 L30 still applies).

### Recurring-bug compliance
- 1910a-retry: 0 prior ISM commits, 0 prior FIX commits on `fredApi.ts` for ISM series. Rule does NOT apply. No architect block.

### Carry-forward to c100+
- 1910a-retry pickup by developer next dispatch cycle.
- AC-5 cycle-evidence gate (D-step transition from "carry/skip" to "passed" in news-scout / unified-agent / financial-analyst notebooks) still applies.
- 1909c HOLD until 2026-05-16.
- 1912b alert-engine Phase 2 still gated on 24h smoke window for 1912a.

### Sign-off
c99 RE-TRIAGE: 1910a USER-STOPPED → class-E (user attention pivot, not defect) → RESTART as 1910a-retry-ism-tool. Spec unchanged. PO sub-flow EXIT.

---

## Cycle 98 triage — dev-team Step 1 PO triage

**Input:** 2 pendingSignals[] (1912 architect brief + tnb c51), WIP=0/2 free, 1910a USER-STOPPED Todo, 1909c HOLD.

### Decisions

1. **1912 program — 3 architect open questions ALL CONFIRMED** (architect-recommended defaults adopted):
   - **Q1 Go 1.22** — monorepo base image consistency, stdlib `slices`, `net/http` improvements.
   - **Q2 `mattn/go-sqlite3` (CGO)** — alert-engine q30s + stock-price tier-3 cache cannot eat ~2x pure-Go penalty. Standard `golang:1.22-alpine + apk add gcc musl-dev` per brief R1.
   - **Q3 `log/slog` JSON** — aligns with ops observability roadmap, TNB layers + cowork-side parsers.
   - Program moved Backlog with decisions baked in; sub-task **1912a-gateway-spec (SPRINT-M, BA owner)** added to Todo for Phase 1 dispatch.

2. **FA runtime gap — NOT a server-side bug.** Verified `get_cash_flow` / `get_macro_snapshot` / `get_investment_clock_phase` registered both in `agentBootstrap.ts` financial_analyst[] (L72-75) and `tools/registry.ts` (L99/L197/L201). Per tnb `mcp_gateway.blocker_type=user_action_desktop_config` + SPIKE_C86_MCP_REG, blocker is Claude Desktop / cowork gateway config. **Spawned 1913-fa-mcp-gateway-config-user-action (CRITICAL, F1 USER, BCTC deadline 2026-05-15).** Did NOT spawn a dev FIX — would be misrouted.

3. **1907a digest-predict 5d silence — ESCALATED HIGH → CRITICAL** per tnb c51 recommendation. Same gateway/desktop substrate as 1913; linked.

4. **Alert precision scoring (bug 2874) — DEFERRED.** MEDIUM, no urgency tag, queue WIP discipline + BCTC tomorrow + 1912 launch take priority. Tracked, not actioned.

### WIP plan
- BATCH(2) returned: **1912a-gateway-spec (SPRINT-M, ba zone:apps/api-gateway/)** + **FIX-1913-fa-gateway-config-USER (UNBLOCK, owner=user)**.
- 1910a stays Todo USER-STOPPED until user signal — do NOT redispatch.

### Channel audit
- Skipped MARKET/WORK/BUG read (gateway offline for cowork c46-c51 per tnb). Substrate already in 2 signals processed.

### Recurring-bug compliance
- 1912a-gateway-spec: BA work, no prior FIX on `apps/api-gateway/` Go rewrite. Architect brief is the unblocker.
- 1913: USER action, no code path.

### Carry-forward to c99+
- 1912a spec → architect review → PM sprintify → dev-* (still TBD per zone — Go rewrite needs a new dev role assignment, BA spec must flag this).
- 1912b alert-engine spec (Phase 2) blocked until 1912a P1 ships + 24h smoke window.
- 1912c stock-price spec (Phase 3) blocked until 1912b stable.
- 1913 user-action F1 — user refresh Claude Desktop / cowork MCP config; observe FA next cycle.
- 1907a CRITICAL — observe next 3 cycles for digest-predict signal; if silent again → architect rethink (cowork heartbeat reliability).

### Sign-off
c98 BATCH(2): 1912a-gateway-spec (SPRINT-M, ba) + 1913-fa-gateway-config (UNBLOCK, user). 1907a escalated CRITICAL in place. PO sub-flow EXIT.

---

## Cycle 97 triage — ARCHIVED (1910a dispatched then USER-STOPPED, 1911a probe shipped)

Carry: 1910a stays Todo pending user signal; 1909c HOLD until 2026-05-16.
