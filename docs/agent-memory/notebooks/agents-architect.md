# agents-architect — Notebook

## 2026-07-20T05:51:07Z

**Brief:** `docs/architecture-briefs/2026-07-20-signalqueue-persistent-finding-collapse-and-tally-accuracy.md`

Batched non-urgent design: (1) collapse 26 live append-always pdf-extractor A-11/A-20 rows (one persistent condition) → new downstream compaction pass modeled on `orch-cold-evict.sh`, status=NEW-only (frozen once triaged), never touches append-always E-3 emit path; found `check_id`/`dedup_key` are never persisted onto the row today (`emit-audit-signal.sh` discards them) — schema-blocker for any collapse design. (2) OUTPUT-CONTRACT `signal_queue_rows_written` 0/2/2 flakiness root-caused to a `flow/main.md` instruction gap, NOT a script bug — `emit-audit-signal.sh` is deterministic (a `SKIP-dedup` marker still means E-3 wrote a row; only `ABORT` means it didn't). Fix: doc-only counting-rule edit (agent-father, ship now) + optional `E3-ROW-WRITTEN` marker (developer, batched with the schema work). FOLD-vs-FRESH: fresh — `FIX-SIGNALQUEUE-DUP-ID-GUARD` is a distinct id-collision/ts-format class (no id collisions found live); `FU-AUDITOR-D4-SIGNAL-ID` cross-referenced as related-but-narrower prior art, not folded, not mutated.

**Signal dropped:** `docs/signals/signalqueue-persistent-finding-collapse-and-tally-accuracy-20260720T055107Z.json` → agent-father

---

## 2026-07-20T22:29:51Z

**Brief:** `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md`

GLOBAL-GEOPOLITICAL-SIGNAL-COVERAGE: 2026-07-20 war/trade-war VN selloff (44up/263down) surfaced zero global-cause coverage in any cowork agent — root cause (b) schema/flow gap, no event category models "war/geopolitical" anywhere. Split into LANE A (6 doc-only items, agent-father, ZERO code dependency — found `event_type:"trade_war"` already live+server-accepted, unused only for lack of a trigger rule, so LANE A ships a functionally complete pipeline today, not a dormant contract): news-scout dedicated-Reuters-slice (stage-fetch.md) + Geopolitical/War dispatch block (stage-signals.md) + alert-commander no-ticker carve-out (stage-signals.md, with a field-precision correction — carve-out must key off top-level `stock_code` omission, NOT `finding_data.affected_stocks` which is schema-required non-empty `min(1)` and never surfaces to alert-commander's text-rendering path) + CHEF US-stack 4th element/L2_OK extension + CHEF 5th convergence rule + new `docs/policies/data-sources-coverage.md`. LANE B (PO backlog, dev-mcp-server): geopolitical domain-tag + `geopolitical_conflict` enum + detector (bundle, mirrors legalRiskDetector.ts pattern) + new US-equity-index/VIX tool (no existing tool surfaces S&P/Nasdaq/VIX). LANE C: ops probe of `news-fetch`/Reuters reachability — dated unresolved carry-over (dev-mainserver-crawls notebook, 2026-06-08, 43d stale) is a material dependency for LANE A's real-world value.

**Signal dropped:** `docs/signals/global-geopolitical-signal-coverage-20260720T222951Z.json` → agent-father

---

## 2026-07-21T15:03:37Z

**Brief:** `docs/architecture-briefs/2026-07-21-orchestration-health-agent.md`

Designed new recurring agent `orch-sentinel` (final name; working name "orchestration-health" retired) — meta-observer of the 4-loop orchestration (dev-team/cowork/claude-manager-helper/system-auditor), re-answering today's one-off 4-question audit on a weekly-FULL + daily-LITE cadence. Checked the D-FLEET precedent (5 days prior, rejected a new standalone agent) against this case and found a genuine structural difference: OH-3 must audit system-auditor's own coverage gaps, which cannot live inside the audited entity without recreating the self-resolve/false-green lesson — that's the deciding argument, not just task framing. Notebook stays OVERWRITE-class (≤80L, literal "full overwrite" honored); trend/delta data (utilization delta, consecutive-run counters) lives in a self-diffing scorecard (`docs/data/orch-sentinel-scorecard.md`, reads its own prior write before overwrite — same technique as system-auditor's D-BCTC-EVAL snapshot). Signal writes: `scripts/orch-apply.sh` only, POST-WRITE READ-BACK + CAS-retry contract. Worked corroboration-gate example (OH-1.3 ATB liveness) + anti-flood dedup so the new detector doesn't itself feed the OH-1.5 queue-congestion problem it measures.

**Signal dropped:** `docs/signals/orchestration-health-agent-20260721T150023Z.json` → agent-father
