# Developer — Notebook

**Last updated:** 2026-07-31 | **Cycle:** FU-MACRO-SNAPSHOT-TIER-WORSTOF

## Session 2026-07-31 — FU-MACRO-SNAPSHOT-TIER-WORSTOF (sprint DATA-SERVE-INTEGRITY, router-dispatched, zone `apps/mcp-server/`) — IN_PROGRESS, routed to dev-mcp-server (not implemented here)

**Task:** BOUNDED-1 auto-pickup. Backlog desc: `get_macro_snapshot` wrapper derives `source_tier` from `signals.carry.source_tier ?? 2` only (commit `260655e3`) — DSI-INV-1 worst-of honesty requires `max()` over all PRESENT signal components (carry + yield, etc.), not carry-only, since a tier:4 `yield.earningYield` fixture can sit under an envelope mislabeled tier:2.

**Zone check (Step 0, mandatory before any code):** target file `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (handler `get_macro_snapshot`, lines 480-481) lives under `apps/mcp-server/` — `system-map.json` zone table + `dev-mcp-server/init.md` ("All code changes within apps/mcp-server/ only", `zone_restricted: apps/mcp-server/`) both name dev-mcp-server, not generic developer. Did not write any implementation code — dispatched instead, per Step 0 rule.

**Pre-analysis handed to dev-mcp-server (not implemented):** Fix = `sourceTier = max(...present component tiers)`, excluding absent components (don't default a missing component to tier 0/best-case) — read `data?.signals?.carry?.source_tier` and `data?.signals?.yield?.source_tier` (both `1|2|3|4`), take the max of whichever are `!== undefined`. **Gotcha:** `apps/mcp-server/src/__tests__/1881a-source-tier.test.ts`'s shared `beforeAll` fetch mock already fixtures `carry.source_tier=2` + `yield.source_tier=4` for ALL its tests — its own `get_macro_snapshot` assertions (L243 `expect(parsed.source_tier).toBe(2)`, L360-369 firstKey-only check) currently pass on the pre-fix under-report and MUST be updated to expect `4` once worst-of lands, or they'll false-green the exact bug this task fixes. AC(b) (carry-only, yield absent) needs its own fetch-mock fixture that omits `signals.yield` entirely — the shared 1881a fixture always includes it.

**Actions taken:** appended `dispatched_to`/`dispatch_note` to `task_board.in_progress[FU-MACRO-SNAPSHOT-TIER-WORSTOF]` (row stays `in_progress[]`, status unchanged), `.head.next_agent` → `dev-mcp-server` (was `developer`), via `scripts/orch-apply.sh`. Decision journal: `sprint-DATA-SERVE-INTEGRITY-developer.md` STEP developer-S1.

**Scope discipline:** did not touch `macroTools.ts` or any `apps/mcp-server/` source file. No handoff doc exists for this BOUNDED-1-sourced thin backlog row (desc came from `backlog-detail.json` directly) — none created, routing recorded on the board row itself instead.

**Zone note:** no MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team router session (`64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to spawn `dev-mcp-server` next and release `task:FU-MACRO-SNAPSHOT-TIER-WORSTOF` on completion.

## Session 2026-07-30 — FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER — REVIEW

**Task:** BOUNDED-1 auto-pickup (`cross-service/`, P1). `.claude/skills/decision-journal/SKILL.md` § Cap Check tested only `LINES>600` — no byte branch — so journals under 600L but well over the 36000-byte cap never rolled, while `context-bloat-backstop.sh`'s `context_bloat_breach` fired on them every cycle. Third instance of this exact defect class; same fix shape as the already-QA-approved sibling `FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES` (`notebook-auto-prune.sh`).

**Actions:** Cap Check now trips on `LINES>LINE_CAP OR BYTES>BYTE_CAP`. `LINE_CAP` read from `docs/data/file-size-caps.json` (SSOT, pattern `docs/agent-memory/decisions/sprint-*.md`, cap=600); `BYTE_CAP=LINE_CAP*60`(=36000) — same derivation `context-bloat-backstop.sh` uses (TE-T24), never a second hardcoded 36000. Rollover target generalized to a numeric-suffix increment parsed off the current `$JOURNAL_PATH` (base=implicit index 1) instead of a hardcoded `-2.md` — closes AC(5): a breaching `-2.md` now rolls to `-3.md`, unbounded.

**Verification:** extracted the patched bash, ran against synthetic fixtures with the real `file-size-caps.json`: 300L/79800B→rolls (byte axis); 650L/19500B→rolls (line axis not regressed); 300L/19800B→untouched; synthetic `-2.md`@620L→rolls to `-3.md`; `-3.md`@620L→rolls to `-4.md` (unbounded confirmed). Applied live to this cycle's own decision journal (499L/159,241B — one of the 3 blind-spot examples named in the task) — `CAP-REACHED` sentinel appended; `send_telegram` bug notification NOT sent (no gateway tool grant this session), flagged for follow-up. No `apps/` TS/Go touched (zone `cross-service/`, pure `.claude/skills/` md) — `bun test`/`tsc` N/A. File itself 99L/4349B, under its own 200L/12000B skill-doc cap.

**Board:** `task_board.in_progress[FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER]` → `review` (`next_agent: qa`), lane-moved `in_progress[]→review[]`, `.head` reset to idle/`active_task_id:null`/`next_agent:"router"`, same `orch-apply.sh` write.

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating router session (`64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release/notify on my behalf.

## Session 2026-07-30 — FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL — REVIEW

**Task:** board row `zone: cross-service/`, reassigned `agent-father → developer` mid-flight (agent-father correctly declined — `.jq` under `scripts/` is a `developer` zone per `system-map.json`, not agent-father's `docs/agents/`-only scope). Per ratified brief `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` §3/§6/§8: `scripts/devteam-review-claim-qa-drain.jq`'s `.head` write was an unconditional whole-object replace — PO's own live dry-run 2026-07-29 proved it would silently clobber a genuinely-running developer session's `.head.active_task_id` resume pointer.

**Actions:** Made the `.head` write conditional on `$head_free` (`.head.status` in {idle,done} OR `.head.active_task_id == null`) — mirrors the proven `scripts/devteam-wrapper-autoclose.jq:122-128` guard shape (brief's own named precedent), applied in the claim-INTO-head direction. review[]→qa[] lane-move logic (selection, `$picked`, mutation) is byte-unchanged — only the final `.head` assignment now branches. No `main.md` edit (brief explicit: caller-side impact NONE, the one existing call site is only ever reached with `.head` already idle; task's own AC-3 forbids a `main.md` edit here — that's Part 2, a separate depends_on-gated row).

**Verification:** `bash scripts/audits/devteam-dispatch-gate-satisfiability.sh` full suite green — added 3 new `AC-QADRAIN-HEAD-GUARD` assertions per brief §6 DoD: negative control (`.head` pre-seeded busy with an unrelated task → byte-identical after, row still moves review[]→qa[] underneath), positive control (`.head` idle before → IS written with the picked row, regression-guarding the one live call site). Also hand-verified via standalone jq run: `.head` MISSING entirely → still written correctly (`// "idle"`/`// null` defaults resolve `$head_free=true`). All pre-existing assertions (incl. 4 sibling HEAD-GUARD blocks: DRS/BOUNDED-1/SLS/RLC) stayed green — no regression. No `apps/` TS/Go touched (zone `cross-service/`, pure jq+bash) — `bun test`/`tsc` structurally N/A.

**Board:** `task_board.backlog[FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL]` → `review` (`next_agent: qa`), lane-moved `backlog[]→review[]`, `.head` untouched (was busy with a peer's unrelated task per this task's own explicit constraint — never touch `.head` except the terminal-flip idle-reset, which does not apply here since `.head` was not this row's own slot).

**Zone note:** No MCP/gateway tool grant this session (Read/Edit/Write/Bash only) — could not `task_release`/`send_telegram`; flagged for the coordinating dev-team session (`owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`) to release any outer claim and notify on my behalf.

