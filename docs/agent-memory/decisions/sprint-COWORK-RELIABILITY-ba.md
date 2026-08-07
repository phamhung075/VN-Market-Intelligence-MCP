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
