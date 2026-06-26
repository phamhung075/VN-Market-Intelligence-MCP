# agents-architect — Notebook

## 2026-06-18T07:40:13Z

**Brief:** `docs/architecture-briefs/2026-06-18-cowork-blind-session-guard.md`

COWORK-BLIND-SESSION-GUARD (P1): confirmed live 2026-06-18 — blind news-scout spawn fabricated 06-18 sentiment into 5 briefs + fake-stamped 62 tickers in coverage-state.json; PO reverted+quarantined. Root: spawn-fanout.md has no preflight to detect gateway blindness before spawning. Fix: new blind-guard.md (Step 0c in main.md, before slot matching) runs gateway-free `jq '.mcpServers|length' .mcp.json`; spawn-fanout.md Step 5.0 gates the entire spawn loop on SESSION_BLIND — backstop slots logged as deferred, no-backstop slots (news-scout-market, market-watcher-market, alert-commander-market) written to telemetry errors[] as undeliverable, ONE work-channel summary per tick. Wired session: guard is a no-op. 3 file edits (create blind-guard.md + edit spawn-fanout.md + edit main.md), all agent-father zone, no rebuild needed.

**Signal dropped:** `docs/signals/cowork-blind-session-guard-20260618T074013Z.json` → agent-father

---

## 2026-06-24T15:04:57Z

**Brief:** `docs/architecture-briefs/2026-06-24-prediction-daily-cadence.md`

ARCH-PREDICTION-DAILY-CADENCE: prediction_claims producer starved since 2026-06-14 — Sprint 1949-T5 disabled monday.md (P-3..P-5 create_prediction_claim) but weekly.md only reads get_prediction_accuracy (never writes claims). Fix: create daily-predict.md reusing monday.md P-3..P-5 pipeline (cap=3/day), add same-day dedup gate in main.md (task_claim key published:digest-daily:YYYY-MM-DD TTL=86400s), add digest-daily cron slot (30 17 * * *) to cowork-schedule.json, update main.md dispatch table to route daily slot → daily-predict.md and Sunday → weekly.md (unchanged). Weekly ceiling raised to 15/week. Honest NO-OP when no ticker passes conviction threshold. weekly.md and monday.md untouched.

**Signal dropped:** `docs/signals/prediction-daily-cadence-20260624T150457Z.json` → agent-father

---

## 2026-06-26T15:28:08Z

**Brief:** `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md`

ORCH-STATE-HOT-COLD-SPLIT: orch-state.json is 2.46 MB / 26,185 lines (53% evictable terminal dead weight). Root causes: in-file archive never shrinks hot file (task-archive.md targets wrong denominator + same-file array); whole-file 2.46 MB rewrite per mutation; 10 meta-tracking keys (schema cruft); backlog prose inflation (507 chars/item × 313 items). Target < 150 KB hot file + append-only cold archive (docs/data/orch/archive/YYYY-MM.json). 7 tasks: HSC-1 (eviction script) → HSC-2 (one-time migration) + HSC-3..7 parallel → HSC-5 last (meta-key collapse, highest risk). Context reduction 94%. Primary hallucination vector (done_verified prose) evicted to cold, unreachable during normal planning cycles.

**Signal dropped:** `docs/signals/orch-state-hot-cold-split-20260626T152808Z.json` → pm
