# TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE

**Zone:** `cross-service/` · **Owner:** `qa` · **Size:** S (~1.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §7
**depends_on:** `TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK`, `TASK-COWORK-MISSED-FIRE-AUDIT`, `TASK-COWORK-CATCHUP-SCOPE-PREDICATE`, `TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE`

---

## TLDR
This task **is** the parent row's `verification_gate`, given an owner so it cannot be narrated instead of executed. Produce a per-slot disposition table against the **frozen 2026-08-23T09:00Z schedule snapshot**: one row per stale slot, each landing in **exactly one** bucket.

Row gate verbatim: *"a replay of the 2026-08-23T09:00Z schedule snapshot shows every one of the 11 stale slots either caught up or **explicitly declared out of scope with a reason**."*

## Acceptance Criteria
- [ ] **AC-1 — all 11 stale slots present, each in exactly one bucket.** No slot omitted, none double-counted, none left "unclear".
      - **`recorded-late`** — ran under Layer C but `last_fired` was not written; fixed by `TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK`. Expect: chef-eod, digest-sunday, fb-daily, fb-weekend.
      - **`genuinely-missed / no-catchup-possible`** — publish-date-bound dish, host asleep at the scheduled minute; declared `on_miss: skip_and_record` by `TASK-COWORK-SCHEDULE-ONMISS-AND-SCOPE`, detected going forward by `TASK-COWORK-MISSED-FIRE-AUDIT`. Expect: chef-morning, chef-intraday, news-scout-sentiment, market-watcher-eod, alert-commander-market.
      - **`catchup-eligible under the widened scope`** — no publish-date semantics; covered by `TASK-COWORK-CATCHUP-SCOPE-PREDICATE` + the schedule flags. Expect: bctc-analyst-slot-1, refine-bctc-slot-4, and the originating refine-bctc-slot-1.
- [ ] **AC-2 — expectations are hypotheses, not answers.** The bucket lists above are the architect's prediction. **Measure, then report divergence loudly.** A slot landing in a different bucket than predicted is a finding to escalate, not a number to adjust.
- [ ] **AC-3 — brief AC-1 re-verified independently.** After the write-back fix, a Layer-C fire of a slot whose flow does not self-write (`fb-weekend`) updates `last_fired`, and monotonicity holds under a simulated double-write from flow + firer.
- [ ] **AC-4 — brief AC-2 re-verified independently.** Replaying the 2026-08-18 → 2026-08-22 sleep window produces exactly one signal row per affected slot with the correct missed-fire count, and **zero** rows for the 10 fresh slots.
- [ ] **AC-5 — brief AC-3 re-verified independently.** `catchup_raw` contains the `refine-bctc-*` / `bctc-analyst-*` slots with `catchup_eligible:true` when late, while every publish-date-bound slot still refuses. **`catchup_raw` must NOT be uniformly non-empty** — that would mean the guard was removed, not narrowed. This is a falsification check; run it as one.
- [ ] **AC-6 — brief AC-4 re-verified independently.** `grep` finds no surviving claim that RemoteTriggers provide persistence in `.claude/skills/cron-cowork-team/SKILL.md`, `docs/agents/cowork-team/flow/match-slots.md`, `docs/protocols/cowork-master-cron-runbook.md`.
- [ ] **AC-7 — verdict is evidence-backed.** Every PASS cites the command run and its output. No PASS may rest on reading a diff or a task's own claim (memory: `feedback_janitor_false_green_verify`, `feedback_auditor_fresh_pass_narrates_unrecorded_escalation`).

## Files
- **Read:** `docs/data/cowork-schedule.json` (and the frozen 09:00Z snapshot) · Layer C firer log · brief §2, §3, §7
- **Produce:** the disposition table in the QA verdict / task RETURN. Do not create a new standalone report file.

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · QA verdict convention per the qa agent flow
