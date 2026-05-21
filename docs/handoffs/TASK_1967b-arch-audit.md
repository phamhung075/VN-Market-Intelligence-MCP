# Handoff — TASK_1967b: Orchestration Bug & Conflict Audit (Architect)

**Task:** 1967b | **Sprint:** 1967 | **Handoff created:** 2026-05-21T19:29:19Z
**Chain:** PO → BA (1967a) → Architect (1967b) → PM (1967c)
**Input spec:** `docs/REQ_1967.md`
**Brief output:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` (v2 canonical)

---

## [Architect] Section — 1967b Findings

**Status:** COMPLETE 2026-05-21T19:29:19Z
**Brief version:** v2 canonical (supersedes 1967a entry)
**Total findings:** 22 (13 ratified from v1, 9 new)
**Severity breakdown:** 0 CRIT / 6 HIGH / 13 MED / 3 LOW
**BCTC-gated:** 1 (ITEM-13, depends_on: 1954c-gate)
**Deferred to Sprint 1968a:** 2 (ITEM-12 startup-trigger → 1968 L-1; ITEM-19 identity stanza → 1968 L-2)

### Gap closure status vs po-1967b-rerun.json

| Gap | Status |
|---|---|
| REQ-1967-1b signal-file naming contract | CLOSED — ITEM-14 (3 violating files found) |
| REQ-1967-1d caveman ≤120 char compliance | CLOSED — Confirmed clean (po-1967b-rerun.json payload=101 chars, all others use structured JSON) |
| REQ-1967-2a per-flow JUMP-TO/RETURN table | CLOSED — 5 flows scanned, all clean |
| REQ-1967-2b recursive spawn guard | CLOSED — ITEM-16 (text-only guard, LOW, accept-risk) |
| REQ-1967-2d cowork flow idempotency | CLOSED — Confirmed clean (signals.db + slot-lock dedup) |
| REQ-1967-3a dispatch table coverage | CLOSED — All spawned agent types have dispatch rows |
| REQ-1967-3b hidden general-purpose fallbacks | CLOSED — None found |
| REQ-1967-3c dispatcher-wrap symmetry | CLOSED — ITEM-17 + ITEM-22 (2 sites missing try/finally) |
| REQ-1967-3d acquire/release path completeness | CLOSED — ITEM-17 + ITEM-22; developer flow delegates release to QA (intentional) |
| REQ-1967-3e dual-claim conflict | CLOSED — Confirmed safe (SQLite atomic INSERT) |
| REQ-1967-4a writer-prune vs reader-scan race | CLOSED — Confirmed safe (DB layer closes race) |
| REQ-1967-4d processed/ migration atomicity | CLOSED — Confirmed atomic (OS rename) |
| REQ-1967-5b isRunning guard audit | CLOSED — ITEM-18 (marketScanJob not in finally — LOW) |
| REQ-1967-5c watchdog start_period vs cron | CLOSED — Confirmed clean (no collision) |
| REQ-1967-5e OBSERVE-1955d gate status | CLOSED — Gate open post 2026-05-22T21:00Z for 1955e diagnostic |
| REQ-1967-6a full 35-agent capability/flow | CLOSED — 40 agents confirmed (count updated); ITEM-06 + ITEM-19 cover drift |
| REQ-1967-6c always_load discipline | CLOSED — Confirmed clean (no spurious always_load) |
| REQ-1967-6d identity stanza completeness | CLOSED — ITEM-19 (9 agents missing mindset/skills) |
| REQ-1967-6e agent count | CLOSED — 40 agent files (not 35); discrepancy explained |
| REQ-1967-7e 11-field per-finding invariant | CLOSED — All 22 ITEMs carry all 11 fields |
| REQ-1967-7f BCTC-gated finding enumeration | CLOSED — 1 finding (ITEM-13), all others NOT BCTC-gated |

### PM action input for 1967c slate

**Priority batch (route to dev-mcp-server + agent-father first):**
- ITEM-01: alertSource enum XS fix → dev-mcp-server
- ITEM-09: weekly cron retry S fix → dev-mcp-server + agent-father (OBSERVE-1955e gate dependency)
- ITEM-04: market-watcher identity S fix → agent-father
- ITEM-02: verified_decision schema S fix → dev-mcp-server + agent-father

**Secondary batch (agent-father only, all XS):**
ITEM-03, ITEM-05, ITEM-07, ITEM-08, ITEM-10, ITEM-11, ITEM-14, ITEM-15, ITEM-17, ITEM-21, ITEM-22

**Accept-risk (no task needed):**
ITEM-16 (LOW, textual guard), ITEM-20 (LOW, confirmed safe), ITEM-18 (LOW, marketScanJob finally — include in secondary batch as optional)

**Deferred (not for 1967c):**
ITEM-12 → Sprint 1968 L-1 | ITEM-19 → Sprint 1968 L-2

### NFR compliance notes

- NFR-1 (≤600L): Brief is within limit.
- NFR-2 (silence ≠ pass): All 7 surfaces have explicit "clean" or "finding" verdicts.
- NFR-3 (BCTC freeze): ITEM-13 carries `depends_on: 1954c-gate`. No BCTC-path fix proposed in immediate slate.
- NFR-4 (WIP 2/2): PM must enforce per-zone WIP cap in 1967c dispatch.
- NFR-5 (no double-fix): ITEM-12 and ITEM-19 are evidence-flagged only; fix authority = Sprint 1968 team.

---

## [PM] Section — 1967c Slate Decomposition

*To be filled by PM agent.*

---

## Audit trail

| Stage | Agent | Timestamp | Output |
|---|---|---|---|
| BA spec | ba | 2026-05-21T20:20Z | docs/REQ_1967.md |
| PO approval | po | 2026-05-21T21:24Z | docs/signals/po-1967-ba-approved.json |
| Architect 1967a (superseded) | agents-architect | 2026-05-21T19:08Z | v1 brief (evidence only) |
| PO re-run decision | po | 2026-05-21T19:19Z | docs/signals/po-1967b-rerun.json |
| Architect 1967b (canonical) | agents-architect | 2026-05-21T19:29Z | v2 brief (this handoff) |
