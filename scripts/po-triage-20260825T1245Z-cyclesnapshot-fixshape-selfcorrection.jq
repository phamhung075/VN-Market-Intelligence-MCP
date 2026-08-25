# PO triage-20260825T1230Z — Write D: self-correction.
# 4 envelopes landed in the inbox at 12:42:01Z (peer cowork drain) AFTER Write C.
# Two of them materially falsify notes THIS SESSION wrote 15 minutes earlier.
# Correcting them rather than leaving a superseded claim on the board — which is
# the exact failure this session's own journal §4 criticised in someone else.
($now) as $NOW

# ── (D1) SHRINK + CORRECT the cycle-snapshot fold (113B headroom only, so the
#        full superseding design goes on DESIGN-COWORK-FANOUT-T2 below, which
#        edits the very file and step at fault and has 10 KB of headroom) ─────
| .task_board.backlog |= map(
    if .id == "FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK" then
      .occurrence_count = 3
      | .updated_at = $NOW
      | .updated_by = "po"
      | .po_fold_20260825 = $note500
    else . end
  )

# ── (D2) Full superseding design onto the row that already edits that step ───
| .task_board.ready |= map(
    if .id == "DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .po_scope_addendum_20260825T1245Z = "SCOPE ADDENDUM — a SECOND, independent defect lives in the exact Step -1 block this row already opens, and it is cheaper to fix here than anywhere else. Do both in one edit; do not let this row land while the key derivation stays broken. THE DEFECT: Step -1's snapshot lookup is prose interpreted per-invocation, and it exists in TWO DISAGREEING LIVE COPIES — .claude/skills/cycle-bootstrap/SKILL.md:58 'round to nearest 5-min slot' vs .claude/skills/step-0-cowork/SKILL.md:39 'current UTC time as HH:MM' with no rounding clause, while copy B's own header defers to copy A as the full protocol and then restates it wrong. Both were re-read verbatim by PO 2026-08-25T12:30Z. WHY 'PICK ONE COPY AND MAKE THEM AGREE' IS THE WRONG FIX (this supersedes the design routed at 49f2c37ac and PO's own 12:30Z note): the WRITER (docs/agents/cowork-team/flow/tick-snapshot.md Step 4.7, FILE_TICK=$(date -u +%H:%M)) and the READER both sample RAW wall clock, at two different instants, at minute granularity. Copy A hits only when the writer's raw minute lands in the reader's 5-minute bucket; copy B hits only on an exact minute match with no rollover. Both are structurally capped well below 100% against this writer, so no rounding rule can bridge them and neither copy is 'correct'. The observed ~3-of-6 hit rate is what that geometry predicts, not noise. THE DECISIVE OBSERVATION: at 2026-08-25T12:08:48Z (c256, slot=alert-commander-critical, tick=12:00Z) the reader ENUMERATED docs/data/, SAW cycle-snapshot-12:05.json — written 12:05:59Z, roughly 1-2 minutes old, comfortably inside the <=7-minute freshness gate BOTH copies already specify (cycle-bootstrap:64, step-0-cowork:42-43) — and DISCARDED it citing an 'exact-tick match' rule. grep finds no exact/nearest/newest rule in EITHER file: the agent invented it to fill a gap where the prose names a key but never says what to do with a near-miss. A valid, fresh, correct snapshot was thrown away by a self-invented string comparison. THE SMALLER FIX: delete the key lookup entirely. Select the NEWEST docs/data/cycle-snapshot-*.json whose mtime is inside the 7-minute window the copies already agree on. The filename becomes an opaque uniquifier and the freshness gate becomes the whole contract. No writer change, no new field, no cross-file key agreement to maintain, and the near-miss gap that produced the invented rule closes by construction. COORDINATION: FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK (backlog, architect) is the tracking row for the same defect and now points here for the design — land them together or land this one and close that. UNVERIFIED, confirm at source before building: cycle-snapshot-latest.json is 4468 B while every Step 4.7 snapshot is ~15-16 KB with the same 4 top-level keys, so the promoter may BUILD its own payload rather than copy one; if so there is a third semantic to delete, not unify. emitPressureStateTool's source has still not been read by anyone in this chain."
    else . end
  )

# ── (D3) Hard confirmation for the same-tick producer/consumer race ──────────
# Parent DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING is at -159B headroom
# (already over ceiling, un-annotatable), so this lands on the child that owns
# the actual remedy.
| .task_board.ready |= map(
    if .id == "DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .po_hard_evidence_20260825T1245Z = "HARD CONFIRMATION of the co-producer race this row's recheck guard exists to close — ids, not inference. The 2026-08-25T12:00Z cowork tick spawned news-scout-offhours and alert-commander-critical IN THE SAME SECOND (12:06:55Z). news-scout produced agent_signals ids 11395-11398 (urgent_news VIC + DBC; chain_catalyst FPT tech sell-off + Brent). alert-commander's own committed cycle c256 records its bus read as: 'Only bus hit: freshness-sla-monitor urgent_news id11394'. 11394 < 11395: the consumer read the bus strictly BEFORE its same-second co-producer wrote to it, then correctly exited silent — it had nothing to act on. USE THIS AS THE REGRESSION FIXTURE: it is a complete, id-addressable instance of the exact ordering the guard must survive, and it shows the failure is silent-and-plausible (a clean 'no signal' exit), not loud. Filed on the parent's behalf: DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (task_board.backlog, BLOCKED epic-hold) is 159 B OVER the 12000 B prose ceiling and can no longer accept an annotation, so the evidence lives here on the child that owns the remedy. DISTINCT FROM, and complementary to, FIX-NEWSSCOUT-PRODUCER-CADENCE-4H-EXCEEDS-AGENTSIGNALS-TTL-2H-CONSUMER-BLIND (minted this tick): that row is signals EXPIRING before the next producer run; this one is the consumer reading BEFORE the producer writes on the same tick. Same producer/consumer pair, two independent starvation paths, and fixing either alone leaves the other live."
    else . end
  )

# ── (D4) Keep the two mechanisms from being conflated later ─────────────────
| .task_board.backlog |= map(
    if .id == "FIX-NEWSSCOUT-PRODUCER-CADENCE-4H-EXCEEDS-AGENTSIGNALS-TTL-2H-CONSUMER-BLIND" then
      .updated_at = $NOW
      | .updated_by = "po"
      | .related = ["DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING", "DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC"]
      | .po_boundary_20260825T1245Z = "BOUNDARY, set at mint time +15min after a second envelope landed on the same producer/consumer pair. There are TWO independent starvation paths between news-scout and alert-commander and they must not be folded into each other. (1) THIS ROW — TEMPORAL: producer cadence 4h > agent_signals TTL 2h, so for ~2h of every producer period no news-scout signal can be inside the consumer's 2h window at all. (2) DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING and its child DESIGN-COWORK-FANOUT-T4-ALERT-COMMANDER-RECHECK-LOGIC — ORDERING: on a tick that spawns both in the same second, the consumer reads the bus before the co-producer writes to it. Hard instance 2026-08-25T12:06:55Z, consumer saw id 11394 while the producer wrote 11395-11398 (full record on T4). Fixing the cadence does nothing for the same-tick race, and the recheck guard does nothing for the 2h blind stretch. AC-3's sweep over docs/data/system-map.json should report BOTH axes per pair."
    else . end
  )
