# TASK-COWORK-PMSET-WAKE-ADJUNCT

**Zone:** `infra` · **Owner:** `ops` · **Size:** S (~1h) · **Priority:** P2
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §5-Q1-C-1, §6 item 6, R4
**depends_on:** none

---

## TLDR
Configure `pmset repeat wakeorpoweron` covering the union of the guaranteed slots' scheduled minutes, so the host is awake when Layer C's `StartInterval` job is due. Host configuration only — **no repo file changes**.

## Context (brief §3)
`pmset -g log` shows **96.5 h continuous Standby, 2026-08-18T12:00Z → 2026-08-22T12:35Z**, and the Layer C firer log has **zero** entries across exactly that window (both edges match). A LaunchAgent `StartInterval` job does not run while the host sleeps, and missed intervals are coalesced into one fire on wake, not replayed.

## Acceptance Criteria
- [ ] **AC-1 — schedule derived from data, not guessed.** Compute the union of scheduled minutes for the 8 `guaranteed:true` slots from `docs/data/cowork-schedule.json`. Do not hardcode a guessed time.
- [ ] **AC-2 — applied and verified.** `pmset -g sched` shows the repeating wake entry after application. Paste the exact command used and the verification output in the RETURN block.
- [ ] **AC-3 — reversible, and the revert command is recorded** (`sudo pmset repeat cancel`), so this can be undone without archaeology.
- [ ] **AC-4 (brief R4) — visibility.** `pmset repeat` is host state, invisible to the repo. If it silently un-sets, we are back here. Record the applied setting and its verification output in the ops notebook and in this task's RETURN so a later reader can re-verify. Do **not** edit `docs/protocols/cowork-master-cron-runbook.md` — that file belongs to `TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY` this cycle.
- [ ] **AC-5 — honest scoping in the report.** State the known limits: this is **partial** — it does not survive lid-closed-in-a-bag or power-off. It is an **adjunct to `TASK-COWORK-MISSED-FIRE-AUDIT`, never a substitute**; that detector is what will notice this mitigation having failed.

## Explicitly rejected alternative — do not reopen
Moving generation to the Vinahost VPS (C-2). The 2026-07-07 brief §3 rejection still holds on its own terms: no LLM runtime, no Anthropic credential, no flow-doc tree on that box, and shipping an API key to an internet-facing host is a security-surface increase.

## Files
- **None** (host state). No repo writes other than the ops notebook.

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md`
