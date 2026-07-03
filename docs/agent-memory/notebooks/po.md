# PO Notebook

_Last: 2026-07-03T20:07Z_

## Tick 2026-07-03T20:07Z (router-dispatched) — WIP=0 discovery-fix dispatch (B-05-FU-SSC-503-RETRY re-spec+promote)

**Context:** dev-team :07 tick. pendingSignals EMPTY (router pre-drained: ctx_bloat_breach on ops.md STALE/RESOLVED @147L; 2× price_anomaly + 1× cowork-telemetry = non-code artifacts). read_telegram/list_unresolved_reports = 1 routine BCTC low-conf skip (VCI 2025-Q4 composite 0.10) — data-quality artifact, not a dev signal. TNB c103+c104 already ACK'd 07-02T20:33 (no new action). head=idle, WIP=0, backlog 401.

**Router standing directive:** BCTC discovery DEAD 17d. Root (RAW-verified B-05 RECON): (A PRIMARY) HSX Strategy-0 `discoverHosePdfUrls()` returns 0 URLs for legit-HOSE tickers; (B) SSC-503 fallback hangs (~60s retry > mcp ~5s discovery timeout) → silent `[]` → ~328 items frozen in `deferred_infra`.

**DECISION → BATCH (1 FIX): B-05-FU-SSC-503-RETRY, re-specced + promoted.**
- CRITICAL FINDING: backlog row spec was INVERTED — it said "add 1 retry + 60s backoff in `_ssc_curl_search()`", i.e. it would ADD the very 60s-blocking loop that IS the freeze cause. Correct fix is the OPPOSITE: bound the SSC curl to fail-fast STRICTLY UNDER the ~5s caller timeout (e.g. `--max-time 4`, confirm value), REMOVE the 60s loop, return None fast (lesson: bounded fetch < caller timeout).
- Value: does NOT restore HOSE discovery (that's Part A, needs SPIKE) but UNFREEZES the ~328-item queue lifecycle (silent-hang → honest fast-fail). Bounded, single-file, single-zone (vps-crawls), next_agent=dev-vps-crawls → single-shot-ready AFTER correction.
- Correct-on-promote pattern (po-s107 precedent): rewrote status_note/files_hint/acceptance, stamped scope_corrected+prior_spec, promoted backlog→ready via po-s138.

**Writes:** po-s138 orch-apply exit 0 (backlog −1, ready +1; 104 pre-existing SHG coherence warns non-blocking, unrelated). Script persisted + pointer added to po/flow/main.md. .head UNTOUCHED (router owns tick/head). No push (fleet-push timer owns). Provenance "po (router-dispatched)" — no session UUID.

## Carry-over
- **NEXT to prep (NOT this tick): SPIKE — HSX Strategy-0 `discoverHosePdfUrls()` returns 0 URLs for legit-HOSE tickers.** This is the PRIMARY root; fail-fast alone does NOT restore discovery. Exploratory (no bounded scope yet) → needs a SPIKE (timebox 120m, zone apps/mcp-server) before it's dispatchable. Router flagged same.
- **B-05-FU-SSC-503-RETRY** now READY (dev-vps-crawls). After it lands: re-verify a queue item exits `deferred_infra` on a simulated 503.
- **FIX-VPS-SSC-INSIDER-502** (backlog, vps-scripts, medium): needs live SSH + external portal may be down → NOT single-shot this tick; dispatch when a slot opens + portal reachable.
- **RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL** (backlog, ops, PLAN-ONLY): extraction returns 0 tables all sectors — root upstream of parsing; deploy-gated.
- **DEPLOY-GATE (standing):** mcp-server ROBUST tier pending rebuild batch; route gated deploys to ops.
