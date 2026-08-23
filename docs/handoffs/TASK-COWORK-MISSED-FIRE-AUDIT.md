# TASK-COWORK-MISSED-FIRE-AUDIT

**Zone:** `scripts/agents-flow/` · **Owner:** `developer` · **Size:** M (~2.5h) · **Priority:** P1
**Parent row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-NO-CATCHUP-CATCHUPRAW-SCOPED-TO-GUARANTEED-ONLY`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md` §3, §5-Q1-C-3, §6 item 2, AC-2, R1, R3
**depends_on:** `TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK`
**blocks:** `TASK-COWORK-STALE-SLOT-DISPOSITION-TABLE`

---

## TLDR
Build a **miss detector, not a catch-up engine**. Per slot, compute the expected fire count over a window from the cron expression, compare to actual, and file **one** signal row per slot per window carrying the count. Today a miss is indistinguishable from a no-op — that is what turned a 4-day host sleep into a 34.8-day `digest-sunday` gap nobody noticed.

## Why this is the deliverable, and catch-up is not (brief §4, §5)
The architect ran the live matcher: `catchup_raw` returns **8 records, ZERO eligible** (6 `rolled_past_vn_date`, 2 `freshness_window_exceeded`). The predicate's `catchup_max_lateness_minutes` bounds (60–1440 min per `_dish_type_catchup_config`) cap catch-up at **one VN day** against a measured **4-day** outage. A fully-wired Step 4.55 recovers **zero** slots — guaranteed or not. And the refusal is correct on its merits: you cannot publish Friday's morning dish on Sunday. **Do not build catch-up here.**

Root cause of the misses (brief §3): `pmset -g log` shows **96.5 h continuous Standby, 2026-08-18T12:00Z → 2026-08-22T12:35Z**, and the Layer C log has **zero** entries between 2026-08-18T08:51Z and 2026-08-22T13:29Z — the gap matches both edges exactly. A LaunchAgent `StartInterval` job does not run while the host sleeps and, on wake, missed intervals are **coalesced into one fire, not replayed**. Layer C is **awake**-scoped, not host-scoped; during a sleep window Layers B and C are down simultaneously.

`guaranteed` is **not** the discriminator: staleness tracks hour-of-day (10 fresh slots all fire UTC 17:30–00:10; 11 stale all UTC 01:30–16:35; 3/8 guaranteed fresh vs 7/13 non-guaranteed). Do not key the detector on `guaranteed`.

## Acceptance Criteria
- [ ] **AC-1 — new detector.** `scripts/agents-flow/cowork-missed-fire-audit.js`: for each enabled slot, derive expected fire count over a bounded look-back window from its cron expression, compare against actual fires, emit the delta.
- [ ] **AC-2 — reuse `cronMatches()` from `scripts/agents-flow/cowork-match-slots.js`.** **No new cron parser.** A second parser is a guaranteed divergence source.
- [ ] **AC-3 (brief R1) — built on the FIXED `last_fired`.** This task is dependency-gated behind `TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK` for a measured reason: a detector built on today's field reports **4 false misses on the guaranteed set alone** (chef-eod, digest-sunday, fb-daily, fb-weekend). The `#1 → #2` order is not stylistic. Verify the field is truthful before trusting it.
- [ ] **AC-4 (brief AC-2) — sleep-window replay.** Replaying the 2026-08-18 → 2026-08-22 window produces **exactly one** signal row per affected slot with the correct missed-fire count, and **zero** rows for the 10 fresh slots.
- [ ] **AC-5 (brief R3) — bounded alarm volume.** One row per `(slot_id, window)`, **not** per missed occurrence, and a capped look-back. Unbounded, this window alone files ~11 slots × several days of rows.
- [ ] **AC-6 — signal row type is an existing, routed type.** Check the live routing registry before choosing; an unrouted type is a silent drop (see `FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES` and memory `project_signalrow_type_open_namespace_vs_closed_allowlist_20260813`). Route via the existing `docs/signals/` convention; if the row goes to `orch-state.json`, it MUST route through `scripts/orch-apply.sh`.
- [ ] **AC-7 — no `guaranteed` keying.** The detector covers all enabled slots. Assert with a test that a stale **non-guaranteed** slot is detected.
- [ ] **AC-8 — tests.** `scripts/agents-flow/cowork-missed-fire-audit.test.js`: expected-count arithmetic per cron expression; the 08-18→08-22 replay fixture; zero-rows-for-fresh-slots negative control; one-row-per-`(slot,window)` dedup; look-back cap.

## Files
- **Create:** `scripts/agents-flow/cowork-missed-fire-audit.js`, `scripts/agents-flow/cowork-missed-fire-audit.test.js`
- **Read first (do not modify):** `scripts/agents-flow/cowork-match-slots.js` (`cronMatches()`) · `docs/data/cowork-schedule.json` · brief §3, §5, §6 item 2, §7
- **Do NOT modify:** `scripts/agents-flow/cowork-catchup-predicate.js` (that is `TASK-COWORK-CATCHUP-SCOPE-PREDICATE`) · `docs/data/cowork-schedule.json` (agent-father-maintained)

## Explicitly out of scope
- Wiring the never-built Step 4.55 consumer / `docs/agents/cowork-team/flow/catchup-check.md`. Measured to recover nothing (brief §4). `TASK-COWORK-CATCHUP-3` in `ready[]` still schedules exactly this — flagged to PO for disposition; do not fold it in here.
- Extending Layer C to sub-hourly market slots (`news-scout-market`, `market-watcher-market`, `alert-commander-market`) — deliberately kept Layer-B-only (2026-07-07 brief §3.5).

## Standards
`docs/policies/dev-standards.md` · `docs/protocols/fail-loud-protocol.md` · orch writes: `docs/policies/dev-standards.md` CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER · commits: `docs/policies/commit-convention.md` (`Task: TASK-COWORK-MISSED-FIRE-AUDIT` + `AC:` trailer)
