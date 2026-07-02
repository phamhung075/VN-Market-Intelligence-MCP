# PO Notebook

_Last: 2026-07-02T13:23Z_

## Tick 2026-07-02T13:07Z — dev-team triage (coord d3292ca4): re-rank + promote → BATCH(1 FIX)

**Inputs clean:** pendingSignals=EMPTY; read_telegram_reports(new)=none; list_unresolved_reports=[]; CI GREEN (HEAD 238de3a2, run 28562309347); git=main only; head=idle (leave idle); WIP=1 = FIX-BCTC-ENRICHER-STUCK-BACKLOG (PARKED user-gated rebuild — untouched); ready[] was EMPTY → 1 free slot.

**Decision — BCTC-HNX-SSL-HARDEN re-rank on corrected premise:** router recon (docs/vps-sources/hnx-tls-chain-2026-07-02.txt) FALSIFIED the 2026-07-07 expiry cliff — HNX renewed leaf Jun 18 2026, NotAfter 2027-01-03. Deadline urgency GONE → priority **high→medium**. REAL remaining driver = HNX server omits GlobalSign RSA OV SSL CA 2018 intermediate (openssl verify 21) so the June-1 hotfix `curl -k` (cert-verify OFF = MITM) is still live in /root/fetch-bctc.sh. Still worth doing = pure security-debt reduction (standing mandate).

**Fills the free slot?** YES. Scanned backlog: no competing groomed candidate — the P0/P1 mass is the FACTORY maintainability epic (held PLAN-ONLY, needs architect sequencing) + dep-chained F1-*/SHG-*/CCATO-* clusters. HNX is the cleanest: deps satisfied (FIX-BCTC-VPS-FETCH-LEG-DEAD DONE), recon complete, size S, ops-route, zone cross-service/ (DISJOINT from in_progress apps/mcp-server task → no collision). Promoted backlog→ready via inline jq|orch-apply.sh: CORRECTED title (dropped false expiry claim) + desc/AC (real driver) + priority medium + next_agent=ops + promote stamps. Conservation OK (backlog 387→386, ready 0→1, others byte-stable; rc=0, 102 pre-existing SHG coherence warns non-blocking). RETURN=BATCH(1) → router dispatches ops. head left idle.

## Carry-over
- WIP 1: `FIX-BCTC-ENRICHER-STUCK-BACKLOG` PARKED on user-gated mcp-server rebuild — do NOT unpark / plan container actions.
- `ready[]` = `BCTC-HNX-SSL-HARDEN` (ops, medium, size S) — router dispatches to ops this tick.
- Sibling `FIX-BCTC-VPS-FETCH-LEG-DEAD` DONE (revived the fetch leg); HNX-HARDEN is its hardening follow-up.
- Prior ticks (T09:37/T10:37): head-dup collapse (po-s138) + signal_queue wedge repair + FIX-BCTC-VPS-FETCH-LEG-DEAD mint — all shipped.
- Guards standing: `FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD` (architect groom), `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` (ops). Size-cap breach root (cold-evict not clearing terminal done[]) still DEFERRED while board in-flight.
