# Handoff — orch-state SSOT Deep Audit (2026-06-27)

**From:** router (commissioned 8-lens forensic workflow, 60 agents, every finding adversarially RAW-verified)
**To:** po → architect → pm → dev-team
**Full machine-readable findings + roadmap:** `docs/handoffs/orch-state-deep-audit-2026-06-27.json`
(`.confirmed[]` = 48 verified findings with RAW proof; `.roadmap.ranked_remediation[]` = 15 ranked work items; `.roadmap.proposed_sprint` = wave plan)

## Verdict
**NEEDS-WORK.** No live catastrophic corruption today (0 duplicate keys, canonical `.head` intact, 327/327 `detail_ref` resolve, cold files valid). But the 2026-06-27 hardening shipped a **half-built enforcement perimeter**: the HARD gate is false-green across ~70% of task lanes, the dominant writer bypasses it entirely, and ~150KB of hot-file bloat/lifecycle drift is real.

**Single biggest hallucination risk:** the false-green gate compounded by the un-gated writer — an agent believes the frozen enum holds when it does not, and a botched jq can clobber a whole lane with the gate none the wiser.

## Proven live offenders (router RAW-confirmed, not relayed)
- `scripts/orch-state-validate.sh` G-5 (enum) + G-3 (lane-type) + G-4 (null-id) scan only **3 of 9** status-bearing lanes (`active_sprints[].tasks`, `backlog`, `done`). Lines 96-110.
- `review/ARCH-SHIP-WAVE-REAUDIT` → `status=PARKED` (non-enum, qualifier-as-status).
- 7× lowercase `done_verified` in `closed_sprints[].tasks` — `select(.status=="DONE_VERIFIED")` under-counts terminal work by 7.
- The ~290 `po-s*`/`router-*` per-tick jq-patch apply idiom + `scripts/orch-backlog-stub.sh` + dev-team WF-1 head-reset write the HOT file with **valid-JSON + non-empty guards only — the gate is never called**.
- No gate detects **duplicate JSON keys** (jq silently keeps last → the exact `feedback_ssot_duplicate_key` clobber passes G-1..G-6 clean).
- G-6 tick-skew is doubly dead: `.head.last_tick` absent AND `.last_tick` (`20260622T2215Z`) unparseable by `fromdateiso8601` → always skips.
- 6 signal rows carry `payload_ref` → non-existent `docs/signals/db-integrity-history.json` (real file: `docs/data/db-integrity-history.json`).
- 34/34 `signal_queue` rows stuck `TRIAGED` — not in cold-evict terminal set → queue can only grow (37KB, oldest ~11 days).
- `active_sprints[].tasks` = 0/53 `detail_ref`, ~88.6KB inline prose (brief §3.6 migration never ran).
- `sprint_goal`: 11 of 12 entries map to non-active sprints (stale projection PO/BA/architect read as "what we're working on now").

## Severity histogram (48 confirmed)
17 HIGH · 23 MEDIUM · 8 LOW · (0 CRITICAL — adversarial verify downgraded the speculative ones honestly)

## Sprint mandate (from `.roadmap.proposed_sprint`)
**Goal:** Close the SSOT integrity perimeter so an agent can never be misled about task state and no writer can corrupt the board.

**Sequencing (must hold):** clean live data offenders FIRST (so the gate can flip to hard-fail without stranding the fleet) → extend + harden the gate to ALL lanes + duplicate-key + referential-integrity → route EVERY writer through one gated wrapper → THEN drain bloat (active-sprint prose migration, signal_queue lifecycle, sprint_goal/decision_journal rotation).

**Wave 1 (must-fix, ranks 1-6 + 12):** data relabel (PARKED→DEFERRED, 7× done_verified→DONE_VERIFIED) · re-collapse `task_board.head` + drop dup metadata keys · referential-integrity gates G-7/8/9 + fix 6 payload_ref · ONE canonical task-lane-list extending G-5/G-3/G-4 to all lanes incl `closed_sprints[].tasks` + PARKED regression fixture · G-0 duplicate-key reject + G-1 empty-file guard + G-6 tick-skew repair · `scripts/orch-apply.sh` gated wrapper routing all writers · fix RED `1837a` test + sync mcp-server TS types to v4.

**Wave 2 (ranks 7-10):** signal_queue lifecycle drain · active-sprint prose→cold (88.6KB) + stub-on-write rule · sprint_goal prune-on-close · decision_journal single-ts + `_cap` + rotation.

**Defer (ranks 11,13,14,15):** mixed-representation closed-sprint migration · legacy hot-key cleanup · status state-machine docs + cold-resolution recipe · signal-row data hygiene.

---

## ROUTER RAW-VERIFY ADDENDUM — post-po-Wave-1 (2026-06-27, architect: read before authoring the brief)
Router independently RAW-verified po's `SSOT-W1-DATA-CLEAN` on the committed file (`cf2f4f1b`) by JSON path, not grep. **po's data-clean is CONFIRMED correct** (0 `.status=="PARKED"`, 0 `.status=="done_verified"` lowercase; `review[0]` now `DEFERRED` with `park_reason`+`park_status_relabel.from=PARKED` retained as provenance; `task_board.head` re-collapsed to deprecation stub; dup `updated_at`/`updated_by` nulled). The all-9-lane status histogram surfaced **two findings the original 48-finding audit missed** — both must land in the hardening brief:

**ADD-1 [BLOCKER — bootstrap deadlock, resolve BEFORE the extend-gate task ships]:** The gate's enforced enum (`scripts/orch-state-validate.sh:92`) is exactly 11 values — **`READY` is NOT among them.** But the sprint's own kickoff task `ARCH-SSOT-INTEGRITY-PERIMETER` sits in `task_board.ready[0]` carrying `status: "READY"`. It passes today only because `ready[]` is an unscanned lane. **The moment `SSOT-W1-LANE-LIST-GATE` extends G-5 to all lanes, the gate hard-fails (exit 5) on the very task driving this sprint.** Empirically proven: injecting a non-enum status into `review[0]` on a scratch copy → gate exit=0 today; the same value in `backlog[0]` (scanned) → exit=5. The brief MUST decide deliberately: either (a) add `READY` as the 12th enum value (defensible — a `ready[]` lane exists, so a READY status is lane-coherent), or (b) mandate `ready[]`-lane tasks carry `TODO` and relabel this task. Do NOT extend the gate before this is resolved, or the sprint strands itself.

**ADD-2 [coherence gate candidate — feeds the lane-list / G-10 design]:** 5 backlog tasks carry `status: "REVIEW"` (`backlog[86,243,252,273,274]`). REVIEW is a valid enum value, so G-5 (even extended) accepts it — but a *backlog* item in *REVIEW* state is a **lane↔status contradiction** that no current gate catches. The canonical task-lane-list work (rank 1) should also emit a **lane↔status coherence map** (e.g. `backlog ⇒ {BACKLOG}`, `review ⇒ {REVIEW}`, `done ⇒ {DONE,DONE_VERIFIED}`…) and a gate (call it G-10) that rejects lane/status mismatch. Relabel these 5 to `BACKLOG` (or move to `review[]`) as part of the data-clean true-up.

**Confirmed-solid (no action):** G-5 is genuinely a HARD gate (exit 5 on scanned-lane offender — the `_warn` text label is misleading but line 122 exits 5); the false-green is *exclusively* the 3-of-9 lane-coverage gap, now reproducible as a fixture for the regression test.
