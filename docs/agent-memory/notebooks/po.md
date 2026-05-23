# PO Notebook

**Cycle:** c282 cycle-59 (Fleet Factory Rollout — ratification + framing + prework + TS-fence)
**Last update:** 2026-05-23T21:56:42Z
**Status:** Architect's fleet-rollout brief (`d898401a`) RATIFIED. Program goal (user): per-microservice factory + per-service dashboard for all eligible services. Two NOW dispatches emitted (architect SI-3, agent-father SI-1). Pilot-3/4 charters gated behind them.

---

## This cycle (cycle-59) — decisions recorded

Decision doc: `docs/po-decisions/2026-05-23-fleet-factory-rollout-ratification.md`. All facts verified via jq on `system-map.json` (12 zones; 5 RED-service dev agents present; news-fetch specialist=`developer` → confirms SI-5; no schema file → SI-1 open; no kinh-dich-factory dir → pilot-3 charter correctly ungated).

1. **Pilot order RATIFIED with ONE swap:** 3=stock-price(Go) → 4=kinh-dich(TS) → 5=alert-engine(Go) → 6=news-fetch(TS) → 7=pdf-extractor(Py) → 8=rag-service(Py). Promoted stock-price ahead of kinh-dich: first fleet pilot must carry zero new-tooling risk (Go depguard proven) while HIGH-RISK SI-3 (TS fence) runs in parallel. kinh-dich loses nothing — still gets full charter as pilot-4. **WIP=2 confirmed.**
2. **Framing: per-service in-app model is CANONICAL; original shared-`packages/*` framing SUBSUMED (a).** Q-9 (Go out of scope) REVERSED by two Go scale verdicts. mcp-server cleanup delivered incrementally via per-pilot G5 (no standalone Phase 4 workspace rewire). `11-open-questions` Q-1/Q-2/Q-6 MOOT. Will NOT revive shared-`packages/*` unless user sets a new distinct goal.
3. **Prework:** SI-1 GO now (agent-father, schema), SI-3 GO now (architect spike, TS fence) — parallel. SI-2 deferred→first-pilot G6. SI-4 deferred→pre-pilot-7. SI-5 deferred→pre-pilot-6.
4. **TS fence (SI-3): DELEGATE to architect spike** (G4 is load-bearing trust gate — must be uniform across fleet). Option C (weaker TS G4) pre-selected as CONDITIONAL fallback if spike >1 sprint. Pilot-3 (Go) NOT gated by SI-3; pilot-4 (kinh-dich) charter G4 cannot lock until SI-3 resolves.
5. **Signals emitted:** `po-si3-dispatch-architect-ts-fence-...`, `po-si1-dispatch-agentfather-schema-...`, `po-fleet-rollout-ratified-...` (all 20260523T215642Z).

Brief typo noted (non-blocking): `02-phasing.md` diagram labels kinh-dich "Go→TS" — inventory + tables correctly say TS/Bun. Architect to fix on next touch.

---

## Carry-over (next cycle)

- **NEXT (parallel):** main router spawns (1) architect→SI-3 TS-fence spike, (2) agent-father→SI-1 pilot-status-schema. Both `now-parallel`.
- **AFTER SI-1 lands:** PO authors `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` + `docs/data/pilot-status-stock-price.json` (clone macro v2.0; Go G4=depguard) → then dispatch stock-price Phase 0.
- **AFTER SI-3 lands:** PO authors `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` (+ status SSOT), transcribing SI-3 G4 AC verbatim. Respect WIP=2.
- **Deferred triggers:** SI-5 (agent-father, dev-news-fetch) pre-pilot-6; SI-4 (architect, Python fence) pre-pilot-7; SI-2 (dev) at stock-price G6.
- **Do NOT touch:** frozen `pilot-status.json` (TA), closed `pilot-status-macro-indicators.json`, any `apps/**` source.
