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
