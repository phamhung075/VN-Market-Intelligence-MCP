# PO Notebook

## Cycle 2026-05-30T23:23Z — P1-PO-APPROVE: DWF-PHASE1 spec APPROVED + 3 OQs resolved

Reviewed `docs/REQ_DYN-WF-PHASE1.md` (adaptive cadence — heartbeat consults cadence policy). **APPROVED.** Set `Status: APPROVED`. Critique-before-approve done: NFR-P1-1 holds — Phase 1 is additive between "leader won" and "fan-out"; leader lock + suffix-free `cowork-slot:<slot_id>` token + published-marker belt untouched; zone cross-service only (apps/mcp-server/ off-limits). 4 BLOCKERs are architect-scoped, correctly routed — did NOT solve them.

**3 OQ decisions (recorded in spec § 8 with full rationale):**
- OQ-P1-1 chef-intraday open/high → **CONFIRM 60 min.** Binding constraint = 16GB host-memory panic (heavy unified-agent sessions), not market coverage. 60 min = ~7 fires/peak-block, already 4x today. Never tighten in Phase 1. Open sessions NEVER suppressible (EC-6).
- OQ-P1-2 staleness → **TIGHTEN to 20 min** (NOT BA's 30, NOT hard 15). One */15 tick + 5min jitter. Fallback is the SAFE direction (NFR-P1-3) so trigger eagerly. Architect updates FR-P1-6 + AC-P1-6-2/6-3.
- OQ-P1-3 bctc-analyst-slot-1..4 → **SUPPRESS on holiday ONLY, FIRE on weekend.** BCTC is filing-driven not session-driven; no filings on holidays (waste), but companies file over weekends + host headroom highest then. Needs dedicated `bctc-offmarket` policy (holiday→null, weekend→1440, open→cron). Splits from BA's blanket holiday/weekend lumping — architect reconciles vs FR-P1-4/FR-P1-5.

Verified: 14 enabled slots in cowork-schedule.json (matches BLOCKER-2). pressure-state.json = 9 fields, calendar_status currently "unknown".

NEXT: architect P1-ARCH.

## Carry-over
- DWF-PHASE1 spec APPROVED → architect P1-ARCH: resolve BLOCKER-1..4 + ENCODE my OQ-P1-2 (20min, not 30) + OQ-P1-3 (bctc-offmarket holiday-only suppress).
- DWF-EXIT done (Phase 0+2 live-signed). Phases 3/4/5 STILL DEFERRED — do NOT relitigate.
- DWF settled invariants (never relitigate): deterministic-router only (no LLM), single-JSON pressure-state, opportunistic leader (bounded dark window), no new task_claim kind (cowork-slot), R1 explicit-TTL + R3 suffix-free key.
- DWF-TSC-DEBT still open (19 TS18048 test-only in DWF-routing-policy-fence.test.ts, zone apps/mcp-server/).
- KNOWN-OPEN (other sprints): FF-DEAD (foreign-flow dead, HIGH, VPS) · FU-TRUST-REFRESH (FPT+ACB empty) · BCTC-LAYOUT-FIRST Ph0 READY · SIG-FOLLOWUP-DRYRUN (X-1).
- Hygiene: scoped `git add <file>` ONLY (tree has DWF/HCM/BTB unrelated files); NEVER `-A`. main only, no branches. task_claim schema = task_id/task_kind/owner_agent/ttl_seconds; gateway wrapper, bare tool names.
