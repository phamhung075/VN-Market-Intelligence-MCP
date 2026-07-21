# PO Notebook

_Last: 2026-07-21T14:24Z (CONVERGE drain — 40 auditor-FP rows folded, 1 predicate-tune mint; detection-only)_

## Tick 2026-07-21T14:24Z — Consolidating signal-queue drain + CONVERGE mint

Router CONVERGE directive. signal_queue accreted to 41 NEW (triaged frozen 102). One recurring FP cluster re-emitting every ~30min Tier-1 cycle all session with unchanged evidence, past the 3rd-tick convergence bar.

**DRAIN (po-s147, orch-apply conservation 556→557 OK, idempotent re-run = delta 0):** 40 NEW system-auditor→po rows → `triaged`, folded to EXISTING homes as corroboration (dedup, NO dup mint):
- 26 A-20/A-11/A-15 pdf-extractor wedge → **PDF-AVAIL-02-FIX** (`po_corroboration_20260721_pm`; fix committed c78839c6c, DEPLOY user-gated; recurring_bug_count HELD 6 = same episode).
- 7 A-12 frontend/api-gateway CURL_ERR flap → **SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP** (+7 origin ids → 11; strengthens probe-FP hypothesis; transport-not-5xx, MCP path healthy).
- 5 A-30 mcp-server mem 94.43→90.58→88.38→88.53→88.81% → **FIX-MCP-MEMORY-CODE-LEAK** (reclaimed-from-peak, in 85–93% band, no OOM, tripwire untripped — NO ops escalation, NO restart).
- 2 B-02/B-06 data_stale (foreign-flow / VPS 3/5) → single-occurrence, never re-emitted → self-resolved transient (no mint).
- 41st NEW (po→unified-agent methodology-flag) = NOT system-auditor→po → left NEW (different flow).

**CONVERGE mint:** `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE` → backlog (high, owner=architect, zone=multi, supervised, plan-only). Predicate-tune: A-30 gate loss-of-reclamation/OOMKilled not single snapshot; A-12 debounce/flap-suppress; A-21 windowed/crash-only; dedup-ledger SUPPRESSES re-emission. `hard_constraint` PRESERVES E-3 append-always ledger (never skip a genuine anomaly); `genuine_tripwire_preserved` keeps real OOM/sustained-outage firing.

**FOLD:** queue collapse-to-single-row + rows_written self-tally-fix → **FIX-SIGNALQUEUE-DUP-ID-GUARD** (`scope_extension_20260721`, improvement_proposal home, non-urgent, data correct).

## Carry-over
- **A-30 TRIPWIRE (STANDING):** escalate ops ONLY on OOMKilled / baseline >93% no-dip / peak >97% no-reclaim. 85–93% sawtooth = FOLD. Never set a session-local trigger below the documented band.
- **APPEND-ALWAYS CONTRACT (STANDING):** signal_queue is an E-3 observation ledger; NEVER instruct auditor to skip row-minting for recurring findings. Only Telegram/BUG is 7d-deduped. Distrust auditor `rows_written` — jq the delta.
- pdf-extractor rebuild + mcp-server restart/mem-bump are USER-GATED — PO disposes (drain/fold/mint), never deploys.
- Detection-only findings this tick; no infra action taken. Committed scoped paths only (orch-state by explicit path). PUSH HELD — fleet-push timer.
