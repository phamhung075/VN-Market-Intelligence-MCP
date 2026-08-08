# Decision Journal — Sprint COWORK-RELIABILITY · ba

**Sprint goal:** Close recurring cowork signal/synthesis/publish-marker reliability defects (drain, filename collisions, marker key/lifecycle).
**Agent:** ba
**Started:** 2026-08-07T04:21:13Z

---

### STEP ba-S1 · ba · 2026-08-07T04:35:00Z
**task-id:** FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING
**what-done:** Wrote requirement spec (FR-1..FR-7, NFR-1..5, edge cases, file-by-file plan) to `docs/handoffs/FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-BA-spec.md`.
**what-considered:**
- Re-key filenames on raw `cycle_id` — REJECTED, PO's 2026-07-22 caution proves it's run-start-derived and diverges between peers of one window.
- Key on the scheduled-window anchor (`scheduled_utc=`/slot→cron lookup), same anchor `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR` mandates for the publish-mutex — CHOSEN, so filename-key and mutex-key agree by construction (row's own binding requirement).
- Treat tnb notebook collision with the same filename-window fix — REJECTED after reading `notebook-write/SKILL.md` + tnb's live notebook: it's a read-modify-write race on a shared mutable counter, not a missing discriminator; different defect class, flagged for a separate verify-first design.
- Fold the field-schema-instability adjacent finding into this row's AC — REJECTED (separable); flagged in §5 for a follow-up row instead, per dispatch instruction's own guidance.
**why-decision:** Live-verified evidence (git diffs across HPG/BID revisions, chef-dish.md's own forward-reference to this row, chef.md Step 0.5's existing pin-once pattern, drain-signals.js's content-based fingerprint) grounds every FR in source, not the board row's prose alone; window-anchor reuse avoids inventing a second, competing key mechanism.
**why-change:** No change from PO's mandated design direction — this spec operationalizes it per-writer.

### STEP ba-S2 · ba · 2026-08-07T23:04:00Z
**task-id:** FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58
**what-done:** Wrote requirement spec (FR-1..FR-8, NFR-1..5, edge cases, remedy trade-off table, file-by-file plan) to `docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md`. Did NOT pick a remedy (PO reserved HOW for ba/architect; deferred to architect per row's own instruction).
**what-considered:**
- Trust the board row's "58-ticker, 24 missing" evidence verbatim — REJECTED: live `docker exec` DB read (same DB_PATH the server uses) shows 34 rows, byte-identical to system-map.json, all sharing one `added_at` timestamp (2026-07-31 18:25:37) — a single bulk-reseed event, not incremental drift. Contradicts the row's `updated_at` (2026-08-07T22:51:55Z) 58-ticker claim.
- PO's 3 candidates (generate-from-DB / CI-audit / delete-file) taken at face value — REVISED: `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` (5th documented SQLITE_CORRUPT since 04-25) proves the DB is not durable and its own recovery notes wrongly certify watchlist as "regenerated… no permanent loss" — true only for system-map.json-seeded rows, false for `add_to_watchlist`-only rows (verified: plain INSERT, zero file write-back). Reframed candidate (i) as unsafe standalone; recommended (i′ write-through) + (ii audit) combo instead of picking one of PO's three as-is.
- Silently proceed without flagging the count discrepancy — REJECTED: would hand architect a spec built on possibly-stale numbers; flagged as Blocker Q1 (verify-first, not a business decision) instead, per "empty is not evidence / verify raw not badges" — routed NEXT to architect anyway (not po) since it's a live-tool re-check, not a product call.
**why-decision:** BA lacks `mcp__gateway__call_tool` grant (confirmed via a live failed call) so cannot place the decisive `get_watchlist` RPC itself; direct DB read against the exact live path is the strongest verification available within BA's tool grant, and the discrepancy is too consequential (reframes root cause from doc-staleness to recurring data-loss) to omit.
**why-change:** Diverges from the row's own framing on root-cause severity/mechanism (data durability, not file staleness) — flagged explicitly rather than silently adopted or silently ignored.

### STEP ba-S3 · ba · 2026-08-08T10:06:00Z
**task-id:** FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE
**what-done:** Reconciled SSOT to 25,500 (7 doc-edit sites specced) + designed 2-sub-check deterministic gate (SSOT-value + comparator-arithmetic). Spec: `docs/handoffs/FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE-BA-spec.md`.
**what-considered:**
- Collapse USD/VND to a single universal value across ALL contexts — REJECTED initially (chef-dish.md legitimately uses 25,500+26,500 as two distinct levels), then REVISED after finding `tnb-audit-supplementary-2026-07-24.md`'s prior-art grep: 26,500 has zero code source anywhere (confirmed live this cycle against `macroTools.ts:118`+`macroAdjustments.ts`) — it is pure narrative-drift, same class as the already-diagnosed "25,000" root cause. CHOSE 25,500 as the sole SSOT.
- Duplicate `FIX-USDVND-THRESHOLD-SSOT`'s production-constant-unification question — REJECTED: that row is still BACKLOG/undecided (PO explicitly "did not choose" among its a/b/c redesign options); scoped this spec narrowly to the doc/narrative-citation layer only, flagged the coupling risk (NFR-4) instead of preempting.
- Gate placement: JSON-only post-generation lint vs pre-publish — CHOSE pre-publish (chef-dish.md Step 6.7, new Rule AF-4) as primary: Step 7's `send_telegram` fires BEFORE Step 7.5/7.6, so a JSON-only check runs structurally too late to block the stated harm; kept JSON validation as secondary/defense-in-depth.
**why-decision:** All 3 rows of the live `unified-agent-synthesis-2026-07-24-eod.json` (26,130-exceeds-26,500 false claim; gold $2,200-vs-canonical-$4,300 drift; gold $4,300 correct citation as negative control) were used to validate both sub-checks are independently necessary before finalizing the design.
**why-change:** No change from the dispatch instruction's own framing — confirms and operationalizes it with source-level evidence.

### STEP ba-S4 · ba · 2026-08-08T11:01:58Z
**task-id:** IVC-ARCH-BLUEPRINT
**what-done:** Signed off architect's blueprint DONE_VERIFIED (review[]→done_verified[]); wrote `docs/handoffs/IVC-ARCH-BLUEPRINT-BA-spec.md` (10 atomic FR/AC task specs, reusing brief's own IDs); minted `IVC-PM-DECOMPOSE` (ready[], owner=pm) as the live handoff artifact.
**what-considered:**
- Trust the brief's §5 decomposition table verbatim vs re-verify its 4 folded rows' live board state first.
- Mint all 8 IVC-C/A rows myself vs write the FR/AC spec + one PM-facing decompose row (task breakdown is PM's job per `not_my_job`).
**why-decision:** Live recheck found `UC-CRITIC-HOOKS-ENFORCEMENT` already `DONE_VERIFIED` via a narrower `hook-guard.sh` fix, NOT gated behind IVC-C1 as the brief assumed — corrected in the handoff so PM doesn't inherit a stale dependency claim. `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT` also closed, giving §2's contract a 2nd live precedent. Live tool-file recount (167 vs brief's 162) further evidenced why `IVC-A1` must be scripted, not hand-counted.
**why-change:** None from the brief's own mechanism decision (fail-closed registry hook, §1) — only its 07-25-era row-status assumptions needed updating. `IVC-A3+` deliberately NOT minted (count is `IVC-A1`-scan-dependent, brief's own caution).
---
