# TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK

**Zone:** `scripts/agents-flow/` · **Owner:** `developer` · **Size:** S (~1.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §2, §6 item 1, AC-1, R1
**depends_on:** none
**blocks:** `TASK-COWORK-MISSED-FIRE-AUDIT`, `TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE`

---

## TLDR
The launchd firer (Layer C) runs slots but never records that it did. Make `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` call the **existing** `cowork-write-last-fired.js` after a successful `claude -p` invocation. Highest leverage, smallest diff in the whole row — and **every** downstream decision reads this field, so nothing else in this row may proceed until it is truthful.

## Measured defect (brief §2)
`last_fired` is written only by `cowork-tick-postflight.sh` §(a) → `cowork-write-last-fired.js`, a **Layer-B-only** path. Layer C invokes `claude -p '<trigger_prompt>'` and never calls postflight. Slots whose own flow happens to write `last_fired` (`chef.md`, `digest-predict/flow/main.md`) get recorded; slots whose flow does not (`fb-market-poster`) do not. **4 of 8 guaranteed slots show a Layer-C fire NEWER than their `last_fired`:**

| slot | last Layer-C fire | `last_fired` in schedule | verdict |
|---|---|---|---|
| chef-eod | 2026-08-18T08:51Z | 2026-08-13T08:55Z | ran, not recorded |
| digest-sunday | 2026-08-09T13:47Z | 2026-07-19T13:49Z | ran, not recorded |
| fb-daily | 2026-08-14T09:18Z | 2026-08-13T09:25Z | ran, not recorded |
| fb-weekend | **2026-08-22T13:29Z** | 2026-08-08T13:24Z | ran **yesterday**, not recorded |

`fb-weekend` is **not 14.8 days stale — it ran yesterday.** Part of the staleness table is an observability artifact, not an execution failure.

## Acceptance Criteria
- [ ] **AC-1 — write-back wired.** After a `claude -p` invocation returns **exit 0**, `cowork-guaranteed-slot-firer.sh` calls `node scripts/agents-flow/cowork-write-last-fired.js <slot_id>`.
- [ ] **AC-2 — pure reuse, zero new machinery.** Do **not** write a new writer, a new lock, or a new coordination protocol. `cowork-write-last-fired.js` already exists, already takes slot ids as argv, and is already *monotonic forward-only with a parse-back guard* (`docs/agents/cowork-team/flow/last-fired.md`) — so a double-write from both the flow and the firer is **safe by construction**.
- [ ] **AC-3 — non-zero exit does NOT write.** A failed or non-zero `claude -p` must leave `last_fired` untouched; recording a fire that did not happen is strictly worse than recording nothing.
- [ ] **AC-4 (brief AC-1) — proof on a slot whose flow does not self-write.** Use `fb-weekend`: a Layer-C fire updates `last_fired`. Assert monotonicity holds under a **simulated double-write from flow + firer** (later timestamp wins, earlier one is a no-op — never a regression to an older value).
- [ ] **AC-5 — write-back failure is loud, not fatal.** If the writer fails, log fail-loud (stderr + non-suppressed) but do not abort the firer's remaining slots. A silent `|| true` here recreates exactly the invisibility this row exists to remove.
- [ ] **AC-6 — tests.** `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh` covers: exit-0 → write; non-zero exit → no write; double-write monotonicity; writer-failure path is logged and non-fatal.

## Files
- **Modify:** `scripts/agents-flow/cowork-guaranteed-slot-firer.sh`
- **Create/extend:** `scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh`
- **Read first (do not modify):** `scripts/agents-flow/cowork-write-last-fired.js` · `scripts/agents-flow/cowork-tick-postflight.sh` §(a) · `docs/agents/cowork-team/flow/last-fired.md` (monotonicity + parse-back guard contract) · brief §2 and R1

## Conflict warning — read before editing
`TASK-COWORK-CATCHUP-5` ("FR-9d: Extend cowork-guaranteed-slot-firer.sh with MCP access", `ready[]`, from the superseded 2026-07-22 design) targets **this same file**. Re-read the file at edit time; if that task has landed meanwhile, rebase onto it rather than reverting it. Flagged to PO for disposition — do not silently resolve the overlap by deleting the other task's work.

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK` + `AC:` trailer)
