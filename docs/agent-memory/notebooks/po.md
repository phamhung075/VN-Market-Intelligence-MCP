# PO Notebook

## Last updated: 2026-05-17T17:45:38Z · Cycle: c168 — triage idle + hydration observation

### c168 session summary

**Spawn context:** dev-team cycle c168 triage. pendingSignals drained, no new Telegram reports. User reported new observation via Chrome extension: 12 React hydration errors on Fetch Ops page after c167 ClientTimestamp fix shipped.

**Triage decision:** NOTHING (idle) + 1 OBSERVE task added.

**Hydration error assessment:**
- c167 ClientTimestamp component fix is structurally correct (defer render → client mount eliminates timestamp SSR/CSR drift).
- User did NOT verify against a clean `bun run dev` restart — session had been HMR-thrashed for multiple hours during the fix.
- Vite dev HMR stale-module artifact is the dominant hypothesis (old module versions retained in memory; new ClientTimestamp not bound on already-mounted instances).
- No production impact (React full client render fallback). Prod SSR build not exercised in this dev session.
- Spawning FIX now = chasing phantom. Cheaper insurance: encode clean-restart verification as OBSERVE task; promote to FIX only on persistence evidence.

**TASKS.md update:**
- Added `1936b-hydration-verify-clean-restart` (LOW OBSERVE, owner=user) under Todo.

**Signal written:** `docs/signals/po-signoff-c168.json` (decision NOTHING, batch=[], notes hydration OBSERVE plan).

**Git state:** main 7 commits ahead of origin/main (unchanged from c167). User-discretion push.

### Carry-over for next cycle

- **1907a digest-predict** CRITICAL OPS — still USER-ACTION (Claude Desktop MCP connector).
- **1897b USER F1** — still USER-ACTION (Docker .git/ VirtioFS exclude).
- **1936b-hydration-verify-clean-restart** OBSERVE — awaiting user clean-restart verification. If reported persistent → spawn FIX with browser console capture (network tab + React DevTools component diff).
- **calendar-source-replacement** OBSERVE — surface to architect or wontfix.
- **BCTC Q1-2026 banking cohort** (TNB c66 #2) — next FA live cycle should call `get_bctc_full` for 7-bank coverage verification.
- **Bloomberg "articles []" residual** — RSS fallback shipped in c167 merge; next news-fetch live cycle confirms population.
- **Push to origin/main** — 7 commits pending, user discretion.
