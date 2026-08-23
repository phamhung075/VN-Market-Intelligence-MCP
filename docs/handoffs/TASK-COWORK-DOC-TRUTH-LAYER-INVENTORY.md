# TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY

**Zone:** `docs/` · **Owner:** `agent-father` · **Size:** S (~1.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §1, §4, §6 item 5, AC-4
**depends_on:** none — dispatchable immediately
**blocks:** `TASK-CRON-SKILLMD-PROBE-WIRING` (same file: `.claude/skills/cron-cowork-team/SKILL.md`)

---

## TLDR
Three docs assert things about the cowork durability layers that are measurably false, and **one of those false sentences was quoted verbatim into a live P0 incident row's `status_note`** as the explanation for why nobody noticed an 8-hour outage. A two-month-stale doc is actively manufacturing wrong incident diagnoses. Doc-fix is required, not optional.

## Ground truth to write (brief §1, §3, §4)
| Layer | Mechanism | Scope | Measured 2026-08-23 |
|---|---|---|---|
| **A** | 12 cloud RemoteTriggers | 12 guaranteed/hourly slots | **RETIRED 2026-06-22.** `cowork-schedule.json._notes.layer_a_deletion_gate` — "the mechanism itself is retired, not merely paused". Live count of slots with `trigger_status:"active"` = **0** (5 `superseded`, 5 `deleted`, 11 absent). |
| **B** | `*/15 * * * *` CronCreate dispatcher | all 21 enabled slots | Session-scoped. Evaporates on CLI exit. |
| **C** | launchd `com.vn-market.cowork-guaranteed-slot-firer`, `StartInterval=900` | the 8 `guaranteed:true` slots | **Loaded and working** (`launchctl list` present, last exit `0`, symlinked into `~/Library/LaunchAgents/`). But **awake-scoped, not host-scoped**: a `StartInterval` job does not run while the host sleeps, and on wake missed intervals are **coalesced into one fire, not replayed**. |

## Acceptance Criteria
- [ ] **AC-1 — `.claude/skills/cron-cowork-team/SKILL.md` "Why this skill exists".** Delete the claim *"The 12 RemoteTriggers (sprint 1957a stopgap) provide persistence for the 12 guaranteed/hourly slots"*. Replace with: Layer A is retired (2026-06-22); **Layer C is the session-independent layer, and it is awake-scoped** — during a host-sleep window Layers B and C are down simultaneously and neither has catch-up.
- [ ] **AC-2 — `docs/agents/cowork-team/flow/match-slots.md:40`.** Correct the `catchup_raw` scope description, and state that Step 4.55 is **not merely unwired — it would recover nothing as specced**. Measured live: `catchup_raw` returns **8 records, ZERO eligible** (6 `rolled_past_vn_date`, 2 `freshness_window_exceeded`); the 60–1440 min bounds cap catch-up at one VN day against a measured 4-day outage. `docs/agents/cowork-team/flow/catchup-check.md` does not exist.
- [ ] **AC-3 — `docs/protocols/cowork-master-cron-runbook.md`.** Close out the 2026-07-07 brief §5 item 5, which ordered this same runbook fix and was never done. Record the three-layer inventory above as the runbook's ground truth.
- [ ] **AC-4 (brief AC-4) — grep gate.** `grep` finds **no surviving claim that RemoteTriggers provide persistence** in any of the three files.
- [ ] **AC-5 — `guaranteed` is not the discriminator.** Wherever these docs imply the guaranteed/non-guaranteed split predicts durability, correct it: staleness tracks **hour of day** (10 fresh slots all fire UTC 17:30–00:10; 11 stale all UTC 01:30–16:35; 3/8 guaranteed fresh vs 7/13 non-guaranteed). The load-bearing variable is whether the host was awake and/or a session was up at the scheduled minute.
- [ ] **AC-6 — no new claims beyond what was measured.** Every assertion added must be traceable to the brief's measurements. Do not restate "Layer C is durable" — it is *awake*-durable.

## Same-file coordination — read before editing
`.claude/skills/cron-cowork-team/SKILL.md` is also edited by `TASK-CRON-SKILLMD-PROBE-WIRING` (Step 1a/1b.1/1c) and by the dep-gated `FIX-CRONCREATE-CONTRACT-DIVERGENCE-DURABLE-NOOP-AND-NO-DESCRIPTION-PARAM`. This task is **first** in that ordering and is deliberately unblocked so a live wrong-diagnosis source is removed fast. Touch only the "Why this skill exists" section — **do not** edit Step 1a / 1b.1 / 1c here.

## Files
- **Modify:** `.claude/skills/cron-cowork-team/SKILL.md` ("Why this skill exists" section only) · `docs/agents/cowork-team/flow/match-slots.md` (~line 40) · `docs/protocols/cowork-master-cron-runbook.md`
- **Read first (do not modify):** `docs/data/cowork-schedule.json` `_notes.layer_a_deletion_gate` · brief §1–§4 · `docs/architecture-briefs/2026-07-07-*` §3, §3.5, §3.8, §5 item 5

## Standards
`docs/policies/dev-standards.md` · `.claude/skills/commit-boundary/SKILL.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-COWORK-DOC-TRUTH-LAYER-INVENTORY` + `AC:` trailer)
