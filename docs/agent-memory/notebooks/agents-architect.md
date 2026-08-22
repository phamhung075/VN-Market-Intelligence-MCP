# agents-architect — Notebook

## 2026-08-22T16:20:35Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md`

User-requested observe-and-report review (not a fix cycle): mermaid diagram + per-agent mechanics for the cowork-team dispatch loop and the anomaly-detection→dev-team-planning loop, plus a live correctness check. Confirmed the `signal_queue` junction hypothesis but scoped it (only `to==po` rows cross loops; `to∈{tnb,unified-agent,alert-commander}` stay inside cowork). Live-verified a real multi-day host-suspension backlog (3 undrained signal_queue rows, 7d-stale `.head`, no cowork-schedule fire since 08-15 — corroborated by system-auditor's own c104 notebook entry) and freshly-reclaimed cron-registration markers (~9min old at read time) whose underlying `CronList` entries I could not independently verify (no tool route). Found the guaranteed-slot launchd backstop is real and bridged the outage but never stamps `cowork-schedule.json.last_fired`, desyncing that field from reality; found a stale `TODO`-vs-`BACKLOG` doc contradiction in `anomaly-task-bridge/SKILL.md`; found an 8-day-unread signal addressed to this agent's own id re: Step 2.4 TTL. No wiring defects — nothing fixed, 2 small doc/script follow-ups recommended to agent-father, 2 more flagged to PO for awareness.

**Signal dropped:** `docs/signals/2026-08-22-cowork-detect-loop-flow-review.json` → agent-father

---

## 2026-08-22T19:08:49Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md` (update)

Restructured §A per coordinator feedback: the original single combined mermaid diagram placed Loop 1/Loop 2 as sibling subgraphs (renderer free to lay them side-by-side) and fanned one node into 10 parallel edges — rendered far wider than a normal screen despite `flowchart TD`. Split into two independent stacked diagrams; collapsed the 9-agent spawn fan-out and LAUNCHD's 4 dashed backstop targets into single grouped nodes (per-agent mechanics already live in §B prose); kept the `SQ`/`SQ2` signal_queue junction node in both, with a prose note that they're the same physical array. Verified narrow programmatically (wrote a dagre-style longest-path rank simulation over the parsed edge lists, not eyeballed): max width = 2 nodes at any rank in both diagrams (11 nodes/10 edges and 14 nodes/14 edges respectively). §B and §C untouched.

**Signal dropped:** none new — prior entry's signal (`docs/signals/2026-08-22-cowork-detect-loop-flow-review.json`) still stands, payload unchanged.

---

## 2026-08-22T19:19:23Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.vi.md` (new — Vietnamese translation)

One-off ad-hoc request (not a standing-convention change — engineering briefs stay English by default): full Vietnamese translation of the English brief, created as a NEW sibling file, original left untouched and still SSOT (linked back via a top-of-file note). Translated all prose (title, §A explanatory text + both mermaid diagrams' human-readable labels, §B per-agent mechanics, §C findings F1-F8 + legend + bottom line); left code-like tokens untranslated (file paths, cron expressions, tool/function names, JSON field/status values, agent ids, mermaid node IDs). Re-ran the same programmatic dagre-style rank-width check against the translated diagrams to confirm topology/narrowness parity with the English original (both diagrams: 11n/10e and 14n/14e, max width 2 — identical to source).

**Signal dropped:** none new — same signal as prior entries, payload unchanged; this is a translation artifact, not a new architectural finding.

---

## 2026-08-22T19:50:40Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md` (update — new §D, English only, `.vi.md` sibling deliberately not touched)

New operational fact from user: whole fleet runs on their personal PC, ~1 week vacation coming with sleep and/or full shutdown, exceeding the 2 confirmed sleep-outages (2.5d/4d) that self-healed. Added §D (F9-F12 + checklist): F9 only `com.vn-market.cowork-guaranteed-slot-firer` survives a full shutdown+reboot (real launchd LaunchAgent, confirmed via `~/Library/LaunchAgents/`); everything else in both loops is session-only `CronCreate`. F10 (new, significant): the designed guaranteed-slot catch-up module (`cowork-catchup-predicate.js`) is built and wired into `cowork-match-slots.js`'s output, but grep-confirmed zero live consumers reference `catchup_raw` — dispatcher's own planned Step 4.55 sub-flow was never created, preflight script's planned Step 6.5 never added, and the launchd firer itself never wired despite the original design brief naming it the most relevant plane. Consequence: guaranteed dishes missed during any host-down window (including possibly the return day itself, given re-arm is an unscheduled human action vs. the ±2min match window) are silently and permanently skipped, no catch-up, no miss-alert. F11: no duplicate-publish/stale-as-fresh risk either way (sleep self-heals via CronCreate's own native missed-fire replay through the real marker-gated flow, proven 2x; shutdown just resumes from "now" with no burst at all) — reassuring but for the wrong reason (silent loss, not correct recovery). F12: confirmed zero SessionStart hook or any automated long-gap→re-arm detection anywhere (checked both settings files) — 100% human/router-memory-dependent, no self-alert fallback even from system-auditor (which would itself be dark).

**Signal dropped:** `docs/signals/2026-08-22-cowork-detect-loop-vacation-resilience-addendum.json` → agent-father (F10 + F12 follow-ups, P2/backlog, routed for PO prioritization — not implemented here)
