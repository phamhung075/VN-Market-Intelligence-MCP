# PO Notebook
_overwritten 2026-06-16T16:25Z_

## Last cycle (2026-06-16T16:25Z user-request triage) — Macro Impact info-card defect+enhancement → INFOCARD-EXPAND-FETCH epic
Self-initiated triage of a router-relayed USER report on the "Tác động Macro — FPT" cascade-macro card (showed only NEUTRAL / 50% tin cậy / **Invalid Date**). Recon FIRST-HAND (not relayed badges), then minted 3 backlog FIX tasks. Commit folded into d8db496a by a concurrent dev-team commit-mutex holder (CONCURRENT-COMMIT RACE — my staged orch-state+script were swept into THEIR commit; verified HEAD orch-state carries all 3 po-s90 tasks + script tracked, work landed intact, only the msg is theirs). Script po-s90 idempotent (re-run mints 0).

RECON (router first-hand):
- FE component: `apps/frontend/app/routes/dashboard.analysis.tsx:731` MacroImpactPanel (rendered :1518), maps AgentSignal rows.
- Data source: `fetchCascadeSignals()` (client.ts:565) → `GET /mcp/api/signals/stock/:code?type=chain_catalyst` → backend route `apps/mcp-server/src/interface/mcp/server.ts:1327-1432`.
- Invalid Date ROOT: `dashboard.analysis.tsx:780` `new Date(sig.createdAt.replace(" ","T")+"Z")` — single-space replace + blind +"Z" corrupts an already-ISO/offset/empty created_at; backend serves RAW SQLite created_at (server.ts:1402), format varies → NaN.
- **DATA-GAP CONFIRMED:** endpoint FLATTENS finding_data+payload into ONE `detail` string (server.ts:1389-1404) and DISCARDS the rest. Full cascade detail IS STORED in agent_signals.finding_data (ChainCatalystFindingDataSchema signalTypes.ts:90 — event_type/direction/confidence/affected_stocks[]/affected_sectors[]/headline/source/+imfSentiment.reasoning/etc). → dropdown REAL detail is NOT fetchable today, needs a backend change.

VERDICT: BATCH of 3 FIX (epic INFOCARD-EXPAND-FETCH, all backlog P2, idempotent po-s90):
- **FIX-SIGNALS-STOCK-FULL-DETAIL** (dev-mcp-server, blocking) — pass finding_data fields through the endpoint + normalise created_at to canonical ISO server-side. GENERIC across all signal_types, not chain_catalyst-only. dev-macro-indicators = consult ONLY if live imfSentiment/driver fields empty.
- **FIX-CASCADE-CARD-INVALID-DATE** (dev-frontend, fast_track) — one reusable ISO-aware date-parse helper, render localized-or-"—", NEVER "Invalid Date"; defence-in-depth FE guard adopted by ALL timestamp renders.
- **FIX-INFOCARD-DROPDOWN-EXPAND** (dev-frontend, depends FIX-SIGNALS-STOCK-FULL-DETAIL) — ONE reusable expand-on-click primitive for ALL info cards (/goal#2 generic, no per-card hardcode), expanded panel shows REAL fetched detail only (/goal#1), Vietnamese labels, a11y (aria-expanded+keyboard).
Conservation PASS (backlog 288→291, total +3); idempotency PASS.

## Carry-over (next tick)
- INFOCARD-EXPAND-FETCH (3 tasks) sit in backlog[] P2 — NOT promoted to ready[]. Next dev-team :07 tick: promote FIX-SIGNALS-STOCK-FULL-DETAIL FIRST (blocking the dropdown), then the 2 FE tasks once a coding lane frees (current WIP=2: FIX-CI-RED-STANDING in review, SSC-503 done_verified). FIX-CASCADE-CARD-INVALID-DATE (fast_track) can run FE-parallel — independent of the fetch gap.
- FIX-CI-RED-STANDING-1837A-1352A now in review (router RAW: 1837a+1352a GREEN per-file). PUSH STILL HELD until full CI/tsc green (red pre-push hook strands fleet) — MY deferred out-of-band call from clean checkout; origin diverged ~26 benign cloud-chore commits.
- FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS review — done_verified WITHHELD on LIVE market-open dedup-drain gate. DO NOT flip.
- in_progress ARCH-CRON-SCHEDULER-RELIABILITY = architect track, leave undisturbed.
