# Layer C guaranteed-slot firer spawns with no IDENTITY_PREAMBLE and no off-flow detector

**Filed by:** cowork-team (router session, 20:00Z tick)
**Measured:** 2026-08-26
**Severity:** HIGH — falsifies a stated premise of a READY P1 row before it is built

## Finding

`com.vn-market.cowork-guaranteed-slot-firer` (launchd, StartInterval=900 — "Layer C") spawns
raw `claude -p run <flow_path> slot=<slot_id>`. It does NOT compose `IDENTITY_PREAMBLE`, and it
has no equivalent of the dispatcher's Step 5.3 off-flow detector.

Both guards exist only in `docs/agents/cowork-team/flow/spawn-fanout.md` Steps 5.2/5.3, which is
Layer B (the in-session `*/15` dispatcher). Layer C never passes through that file, so every
backstop spawn is structurally unprotected against the router-protocol latch that
FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW exists to prevent.

## Live measurement

- pid 70235 = `claude -p run docs/agents/unified-agent/flow/chef.md slot=chef-evening`
- started 19:46:38Z, exited 19:49:35Z, **exit_code=0**
- stdout captured in `docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log` is
  router-protocol ladder prose, verbatim: "Step 0a presence registered · Phase A orphan-probe
  0 rows · Phase A.5 roster 1 row (dev-team, live) · Step 2.4 -> collision, EXIT · Phase B never
  attempted." That is the off-flow latch, not chef's flow.
- it ps-grepped for its own slot and matched **its own pid**, then self-suppressed as if a peer
  held the work.
- artifacts produced: **none** — no synthesis JSON, no notebook section, no published marker.

Control: the Layer B spawn of the same slot at 19:52Z, WITH the preamble, produced all three
(synthesis 4311 B, notebook section, marker `published:chef-evening:2026-08-26`).

## Why this is not already covered

- `FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION` — 600s/1800s kill of backgrounded children.
  Different mechanism; this run died at 3m by its own choice, not by a timeout.
- `FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE` — arbitration between the two planes. Orthogonal:
  this is about what the Layer C plane sends, not whether both planes fire.
- `FIX-COWORK-LASTFIRED-NO-STAMP-ON-A-GENUINELY-DELIVERED-FIRE` — opposite direction (frozen
  stamp on a real delivery).
- `FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION` (done, P0) — same defect
  CLASS, but scoped to the dispatcher plane's Step 5.3 positive-match set. It ratifies the
  principle this row extends: narration/exit status is not delivery proof.

## Direct impact on a READY row — read before building

`TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK` (ready, P1, owner developer) specifies that the firer
call `node scripts/agents-flow/cowork-write-last-fired.js <slot_id>` **after an exit-0 `claude -p`
invocation**.

The run measured above was exit-0 and delivered nothing. Building that row as written would stamp
`last_fired` on a null fire, and the next dispatcher would read that stamp as a real delivery —
manufacturing exactly the false-delivery class the fleet already has two rows about. **exit-0 is
not delivery proof on this plane, because nothing on this plane stops the router latch.**

## Cheap direction (PO to rule)

1. Have the firer compose the SAME `IDENTITY_PREAMBLE` as Step 5.2 — ideally from one shared
   source rather than a second copy, since a divergent copy is the documented failure mode of
   this whole class.
2. Gate `TASK-COWORK-LAYERC-LASTFIRED-WRITEBACK` on artifact-delta proof (marker claimed, or
   notebook/synthesis mtime advanced), not on exit code. At minimum: do not land it as specified.

Ordering note: (1) is a prerequisite for (2) being meaningful.
