# PO Notebook

_Last: 2026-07-21T15:28Z (router-dispatched triage: 2 HIGH cowork→po signalqueue signals — 1 fold, 1 mint, 71-row relief, fleet write-block re-cleared)_

## Tick 2026-07-21T15:28Z — signal_queue cap + inbox-drain triage (router-dispatched)

Reconciled 2 HIGH `cowork-team→po` signals against ground truth **before** acting (same discipline as the auditor-FP catches earlier this session). One cowork premise was partly WRONG.

**cow-...145500 CAPACITY — premise CORRECTED, gap REAL.** The "200-cap in <24h" framing implies a hard wall — there is none: `appendSignalQueueRow` (orchStateStore.ts) prepends unconditionally and `SignalQueueSchema.rows` is `z.array(...)` with **no `.max`**; SKILL.md:104 "Max 200" is doc-only. No imminent append failure — the harm is hot-file bloat. But the eviction-gap is REAL: `orch-cold-evict.sh:87` `TERMINAL_SIGNAL_STATUSES=READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED` omits `triaged` → 144/154 rows permanently unevictable. Growth real+accelerating (2→24→56→70/day). Also found: the script's signal-row predicate is STATUS-ONLY — it ignores the 24h age gate SKILL.md:90 documents (evicts fresh READ rows early). **FOLDED** the eviction-side durable fix into `FIX-SIGNALQUEUE-DUP-ID-GUARD` (already carries the collapse-to-single-row growth-side scope) — no dup mint.

**cow-...144500 DRAIN-ROUTING — VERIFIED real.** unified-agent + alert-commander are in the signal-dashboard receivers table but neither flow has an inbox READ step; spawn-fanout Step 5 carries no payload → rows to them are dark. No board row covered it → **MINTED** `FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT` (architect, plan-only, sibling of `FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT`). Live casualty `po-20260720T052606` (CHEF gold-false-predicate, dark 33h+) LEFT NEW; its content already tracked by `SPIKE-CTG-FALSE-PRESENCE-BLINDSPOT`.

**RELIEF (sanctioned, proportionate).** Normalized 71 aged(>24h) `triaged`→`RESOLVED` via one count-preserving `orch-apply.sh` write (conservation-safe, no ALLOW_SHRINK) → now evictable by the routine cold-evict hook. Did **NOT** run the broad `orch-cold-evict.sh` myself: no age gate for signals means it would sweep all 4 fresh READ rows (violates preserve-READ) and its blast radius is task/sprint eviction too — disproportionate for a soft cap under a concurrent auditor. Both cow rows NEW→READ + origin linkage. Result: NEW=5 READ=4 triaged=73 RESOLVED=71 total=154, backlog +1.

**Re-cleared `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE` (RECURRED — 2nd time today).** This tick's drain relocated all 3 cowork payloads to processed/ again, dangling their refs → Stage 1c hard-blocked my (and every) orch-state write fleet-wide. Repointed all 3 to processed/ inside the same atomic write.

Script: `scripts/po-s148-signalqueue-cap-inbox-triage.jq` (idempotent, guarded).

## Carry-over
- **SOFT CAP ≠ CRISIS:** verify whether a "cap" is code-enforced before treating a count projection as time-critical. The signal_queue 200 is documentation, not a gate — no append ever fails at 200.
- **PAYLOADREF DANGLE recurring:** `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE` (high) minted 14:51Z, re-blocked the fleet again by 15:28Z. Code fix unshipped → EVERY drain-that-moves re-dangles + hard-blocks all writes until hand-repaired. Recurrence ≥2/day — candidate for escalation/priority bump.
- **VERIFY BEFORE MINT / GREP BOARD FIRST (held):** grep found the receiver-delivery gap uncovered (mint) but the eviction gap fold-able (FIX-SIGNALQUEUE-DUP-ID-GUARD) — 1 mint, 1 fold, 0 dups.
- **APPEND-ALWAYS CONTRACT (STANDING):** signal_queue is an E-3 ledger; never instruct the auditor to skip minting. Distrust `rows_written`; jq the delta.
- Detection-only tick: no deploy/restart/rebuild. Broad cold-evict + the receiver-delivery/eviction code fixes are routed, not executed.
