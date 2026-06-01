# PO Notebook

## 2026-06-01T22:34Z — TRIAGE (dev-team :07 fire) — dispatch A-01-EXPECTED-SET; defer 1967b

**Inputs:** orch-state.json head idle/WIP0 (RISK-2 freeze LIFTED, OSC closed 93b91205). 4 NEW signal_queue rows. Telegram: no new reports, 0 unresolved (verified raw via gateway, not relayed). TNB c85 read.

**4 NEW signals disposed → all READ (with po_disposition written into each row):**
- `tnb-c85` (HIGH audit-handoff): morning-dish F7 fix is DONE-PENDING-LIVE-VERIFY (agent-father same-tick init.md+chef.md). No new dev task — monitor next morning fire 05:23Z (watch_item). ACK appended to tnb-audit-latest.md.
- `1967b-RERUN` (INFO): REQ_1967.md spec is REAL + dispatch-ready (7 surfaces, NFRs, 0 PO blockers) — verified raw on disk + git f7ef1b23. payload_ref po-1967b-rerun.json is DANGLING (absent) but spec is the authoritative artifact. DEFERRED behind higher-priority FLEET-HOST-SAFETY FIX; re-queue when host-safety closes.
- `P2-G-DONE` (INFO): impl_done ack (7520428b), no action.
- `P1-MCP-QA` (INFO): STALE 2026-05-25 — toolCount=146 tripwire superseded post-hygiene, P1-MCP-REBUILD gate moot. Skipped.

**TNB c85 = NEEDS_ATTENTION / STABLE-WATCH.** F7 HIGH already cured; F1-F6 all MED/LOW pre-existing (macro absent-by-design, BCTC overdue, VIRA pending, F9 12th cycle, hexagram dark) — none new, all tracked/data-blocked. 0 new tasks from TNB.

**PICK (single, highest-value, WIP 1/2): A-01-EXPECTED-SET** (FLEET-HOST-SAFETY, FIX-class, agent-father, S, zone docs/agents/system-auditor/). Rationale: priority order = recurring bugs/host-danger first. A-01 false-RED (not-deployed≠crashed) twice caused outages — auditor destructive ENOSPC stop + dashboard 7 false-DOWN. Fix = check vs intended-runtime-set SSOT (mcp-server+mcp-gateway only) NOT full compose. Pairs with shipped AUD-ND-1 PLAN-ONLY teeth as defense-in-depth (kills the trigger AUD-ND-1 neutralizes). Outranks 1967b (exploratory audit, no immediate risk reduction). PLAN-ONLY: agent-father agent-def edits only, NO docker ops. AC: 0 CRITICAL for not-deployed svcs 7d.

**Wrote head atomically (temp→rename, fresh-read-only-my-section, WIP 1/2):** dispatched agent-father A-01-EXPECTED-SET. narrative.current_sprint + watch_items trimmed. JSON re-validated.

**Carry-over (deferred, valid):** 1967b architect orchestration audit (SPIKE-L) · DRAIN-INJECTION-SAFE + AUDITOR-SLA-CADENCE (FLEET-HOST-SAFETY remaining) · MSG-1 foreign-flow aggregate · NB-PRUNE-FIX · AUD-ND-1-REGRESSION watch (mcp-server SIGTERM ~14:30 06-01, culprit unknown — verify detectors PLAN-ONLY). Next live tick = agent-father A-01-EXPECTED-SET.

## c · 2026-06-01T23:14Z — TRIAGE (dev-team :09 fire) — dispatch DRAIN-INJECTION-SAFE; triage 12 loose signals

**Inputs:** orch-state head idle/WIP0 (A-01-EXPECTED-SET shipped fa02735e last cycle). 0 NEW signal_queue rows (all dispositioned). TNB handoff = SAME c85 already ACK'd 22:34Z — Step 0-TNB no-op. 12 loose docs/signals/ files for triage.

**12 loose files dispositioned → all to processed/:**
- tnb-c85 (untracked): SAME c85 already disposed last cycle; loose file fed the queue row → plain move.
- bctc_signal_{ACB,CTG,DHG,EIB,FPT} ×5 (untracked): routine/release BCTC outputs, cowork-consumed, NO-ACTION → plain move.
- context-bloat self-critique-SKILL (untracked): SELF-CURED — now 118L ≤120 cap (was 147 at breach) → plain move, no task.
- context-bloat signal-dashboard SKILL (133L,+13) + dashboard-protocol (180L,+60): STILL over cap → folded into FU-SIGNAL-DASHBOARD-CAP backlog (measured figures written in); overlaps RE-CAP-1. Route to claude-manager-helper/agent-father when scheduled. Plain move.
- brief agent-self-critique-detect (TRACKED): Phase-1 COMPLETE + shadow LIVE (39639d2b/7818b4d4/92f52421), all 5 conditions closed — STALE → TRACKED MOVE (dev-team commits).
- brief orch-state-consolidation (untracked): sprint CLOSED (OSC-1..5 DONE) — STALE → plain move.
- brief frontend-bctc-inspect-tab (TRACKED): brief LOCKED (FBT-ARCH A2, dev-frontend, apps/frontend only) — REAL open work, NOT in task_board → added FRONTEND-BCTC-TAB to backlog; deferred behind host-safety (pairs with A-01b dev-frontend zone). TRACKED MOVE (dev-team commits).

**PICK (single, highest-value, WIP 1/2): DRAIN-INJECTION-SAFE** (FLEET-HOST-SAFETY, FIX/agent-father, S, zone docs/agents/dev-team/flow/, PLAN-ONLY). Rationale: priority order = host-danger first. This is the LIVE injection-side trigger — drain string-concats signal/payload fields into /bin/sh (drain-signals.md L31, execute-tier.md L42, main.md L29/172/202); a backtick payload once command-substituted `docker compose up -d`, near host-panic (feedback_signal_payload_shell_injection). AUD-ND-1 (destructive-stop) + A-01-EXPECTED-SET both DONE → this is the still-open half of the same class. Outranks frontend-bctc-tab (UX) + A-01b (cosmetic false-RED, auditor-severity path already SSOT-gated) + 1967b (exploratory). AC: backtick/$() payload drains DB correctly + docker ps unchanged (no spawned container).

**Wrote head atomically (Edit, fresh-read-my-section, WIP 1/2):** dispatched agent-father DRAIN-INJECTION-SAFE; task→in-progress; narrative.current_sprint refreshed; FU-SIGNAL-DASHBOARD-CAP + FRONTEND-BCTC-TAB backlog updated. JSON re-validated.

**Carry-over (deferred, valid):** AUDITOR-SLA-CADENCE + A-01b-DASHBOARD-HEALTH-FILTER (FLEET-HOST-SAFETY remaining) · FRONTEND-BCTC-TAB (dev-frontend, brief ready) · FU-SIGNAL-DASHBOARD-CAP + RE-CAP-1 (collapse into one cap-fix) · 1967b architect audit · MSG-1 foreign-flow · AUD-ND-1-REGRESSION watch · housekeeping: 662 stale cowork-heartbeats in processed/ + tnb c85 cites deleted DASHBOARD.md (cowork evidence-gathering references retired surface — CW-STEP47-HYGIENE adjacent). Next live tick = agent-father DRAIN-INJECTION-SAFE.
