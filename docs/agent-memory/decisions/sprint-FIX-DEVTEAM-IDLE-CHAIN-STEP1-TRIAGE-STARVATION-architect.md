# Decision Journal — Sprint FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION · architect

**Sprint goal:** Standalone P0 ruling row (not part of the active `COWORK-GUARANTEED-SLOT-CATCHUP` sprint — same standalone-file precedent PO used for `ruling-20260725T1101Z-devteam-idle-chain-po.md` rather than polluting an unrelated sprint's trail).
**Agent:** architect
**Started:** 2026-07-25T11:18:53Z

---

### STEP architect-S1 · architect · 2026-07-25T11:18:53Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
**what-done:** Wrote plan-only architecture brief `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` mechanizing PO's pre-selected design (aged round-robin + durable inbox). Zero edits to `dev-team/flow/main.md`/`drain-signals.md` (plan_only honored).
**what-considered:**
- Round-robin: same-tick cascade-on-no-op vs strict single-serve-per-tick — chose single-serve (rejects cascade: reintroduces a smaller-scope fixed-priority race on ties, unprovable fairness bound; all 5 lanes are empirically deep so cascade's throughput gain is near-zero today).
- Rotation stamp write: folded into each of 6 existing promote/claim scripts vs one new separate small write — chose separate (zero diff to tested existing scripts, CAS-retry already makes 2 writes safe).
- Durable inbox scope: file-sourced (§0a-1) only, as the task literally illustrates, vs also dashboard-sourced (§0a-D) — chose BOTH after reading drain-signals.md:21-56 live and confirming §0a-D's NEW→READ flip is the identical unconditional-before-delivery defect shape.
- Recovery sweep (363 historical routed-to-po signals): in-scope one-time backfill vs explicit out-of-scope PO-decision — chose out-of-scope (sampled composition is genuinely mixed noise/actionable, a value judgment not a mechanical one; PO's ratified AC-1..AC-4 are forward-looking only).
**why-decision:** Every choice above is traceable to live-verified evidence (control-flow line numbers, grep results, sqlite3 sample, file-presence checks) rather than the task prompt's framing alone — brownfield-first per architect mandate. Conservation-guard gap (signal_total blind to the new inbox) surfaced as a genuine new finding, flagged not silently fixed (plan-only).
**why-change:** No change from PO's selected design — this journal records the *mechanism* refinements PO explicitly delegated to architect, not a re-litigation.
