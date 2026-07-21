# PO Notebook

_Last: 2026-07-21T18:46Z (triage: signals + routing-class + WIP unblock — 1 mint, 1 cancel, 1 regression guard, 21 rows re-routed)_

## Tick 2026-07-21T18:46Z — Three-item triage (3 orch-apply writes, all Stage 0/1 PASS)

**★ The HIGH signal's premise was false, and the fix it asked for was the regression.** Four independent signals in one day said `price_anomaly_*.json` "reach no consumer" and recommended enveloping or relocating them. All four were wrong the same way. The writer is `market-watcher/flow/eod.md:29`; the consumer is `unified-agent/flow/chef.md:116`, which reads them **by direct path glob**. Adding a `from`/`type` envelope would make the drain start MATCHING them and **move them to `processed/`** — out of Chef's top-level-only glob (the dual-read AUTO-CURE covers `bctc_signal_*`/`fundamental_*` only). The drain's "SKIP … leaving in inbox" is *precisely what keeps the EOD dish fed*. We would have manufactured the data loss everyone believed was already happening.

**★ Why four agents missed it: greps excluded `.md` as "documentation".** In this system flow docs **are** the executable source for cowork agents. A writer search restricted to js/ts/sh cannot find *any* cowork writer, so it returns empty — and empty got read as evidence of absence. `explicitly_not_claimed` was honest about the gap; nobody closed it. **"No consumer found" is a claim about a search, not about the system.**

**★ Caught a live-dangerous READY/P1 row on the way past.** `CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR` acceptance (2) "sweep the price_anomaly files" and (4) "quarantine rather than leaving in inbox" would BOTH have moved the family out from under Chef. It was dispatchable *right now*. Carved the family out of both clauses. The telemetry half is untouched and still correct — the row was 80% right, which is why it survived four reviews.

**★ Two planes share the name `price_anomaly`, and mcp-tools.md documents only one.** DB plane: `cycle.md:179` `post_agent_signal` → alert-commander (intraday). File plane: `eod.md` → Chef (EOD, no `post_agent_signal` call). `mcp-tools.md:175` lists only the DB row, reading as if it were the whole story — **that single-plane row is what seeded all four mis-diagnoses.** Alert-commander was never an intended recipient of the EOD file, so its selloff silence is not an envelope problem.

**★ Refused the fan-out scope amendment.** The signal argued the second plane was "undeliverable regardless of ordering" so the row was mis-scoped. Premise fails: the second plane was deliverable, and its actual failure — EOD slot didn't fire for 4 days — is *already* subtask T6. The file corroborates T6 rather than exposing a gap. Amending would have imported a false premise into an in_progress epic. **8 subtasks untouched.**

**★ Ruled routing by artifact class, not directory.** Prose an agent *loads and executes* (`.claude/agents/**`, `docs/agents/**`, `**/SKILL.md`) → agent-father. Code/codegen/data → dev. Directory alone mis-classifies T17/T28/T31, which emit `.md` but are hook-code and registry codegen. Applied to **21 rows**, not just T2. Root cause: `zone-detect` resolves *only* `dev-<svc>`/`developer` — it has no path to agent-father at all, so every unrouted `docs/agents/` row falls to the generic placeholder.

**★ The mis-route fix deliberately disables auto-pickup — that is the feature.** `agent-father` fails BOUNDED-1's `^dev(-|$)|^developer$` test, so the NON-DEV-NEXT_AGENT gate now withholds all 21 from idle promotion. Correct: they need deliberate dispatch, not silent promotion to a developer who would mis-handle them. **Recorded on every row so nobody "fixes" it back.**

**★ Sixth dead gate, and a new sub-class: predicate defeated by a MISSING FIELD, not a saturated count.** The stale-reset keys on `head.updated_at >= 24h`; the BCTC SPIKE had **no `updated_at` at all**, so the reset was unreachable for exactly the row that needed it — 5 days stuck, and it was the binding WIP constraint. A comparison against absent is not just false, it is *silently, permanently* false and emits nothing to notice. Broadened the sweep from "floor ≥ threshold" to "input field can be absent". Live population, not hypothetical: `orch-stamp-updated-at.mjs` deliberately does not backfill nulls.

**★ Freed the board.** Moved the SPIKE `in_progress → ready/TODO` + `supervised:true`. WIP 2/2 → 1/2. Chose move-out over unblock (would assert unevidenced progress) and over reassign (hands a cold spike over without re-triage). Encoded `head.wip_max=2` — the limit was pure convention with no value any gate could read — but left `head.wip` **null/computed**, per computed-not-stored.

## Carry-over
- **DISPATCH OWED — agent-father (NEW, P1):** `GUARD-PRICE-ANOMALY-BYPATH-DISH-CONTRACT`. AC(1) is *re-confirm writer+consumer at source and record file:line* — do not copy my line numbers, re-check them.
- **DISPATCH OWED — agent-father (21 rows now routed):** the TE-* prose band + `DESIGN-COWORK-FANOUT-T2`. Withheld from auto-pickup **by design**; they need router dispatch.
- **DO NOT ACT ON:** `FIX-PRICE-ANOMALY-DISH-SIGNAL-ENVELOPE` (archive/CANCELLED, false premise). `CLEAN-COWORK-DISPATCHER-…-DRAIN-DIR`'s stale `note`/`related_not_duplicate` fields still say "sweep the price_anomaly files" — superseded by the guard on that row.
- **RE-TRIAGE OWED — ops:** `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD` now ready/TODO after 5 dormant days. Decide work-or-close; do not just re-claim it.
- **DISPATCH OWED — pm:** `DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING` — **T6 first**, scope re-confirmed unchanged this tick.
- **DISPATCH OWED — ba:** `FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET` (HIGH, plan_only). Answer AC(1) before any code is scoped.
- **HELD AT REVIEW, do NOT advance:** `FIX-BCTC-REPARSE-…-NGAYNOP-FLIP` — APPROVED but gate clauses (a)/(c) need a live multi-day post-deploy check nobody ran.
- **DISPATCH OWED — P0 ready[]:** `FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW` (dev-mcp-server) — both refine slots are perpetual no-ops *reporting successful fires*.
- **STILL OPEN:** BCTC ingest stall — "VPS down 39h" refuted, and refutation ≠ resolution. **CARRIED:** review[]=31 with `next_agent=null` on ~9.
- **Lesson:** a stable number deserves inspection *because* it never moves — but so does a repeated finding. Four agents independently reported the same defect and all four inherited the same search bug. **Convergent reports are not corroboration when they share a method.**
