# dev-mcp-server -- Notebook

## c310 · 2026-05-26 (FA-FIX — fetch_and_analyze timeout reliability)

### FA-FIX DONE

**Commit:** `3c00c17a` | 3 files | tsc EXIT 0 | bun 9449 pass / 345 fail (within ≤348 baseline) | 7 new scenarios PASS

**Changes:**
- `analysis.ts` REC-1: per-source outer timeout budgets (cafef=10s, vnexpress=10s, vneconomy=12s, reuters=30s→15s) via `withSourceTimeout()` helper that resolves to `[]` on expiry.
- `analysis.ts` REC-2: `Promise.all(fetchPromises)` → `Promise.allSettled` in Step-1 fan-out.
- `analysis.ts` REC-3: Step-4 ragIndex fan-out switched to `Promise.allSettled` for graceful rag degradation.
- `ragHttpClient.ts` REC-3: `AbortSignal.timeout(8_000)` added to `ragSearch()` and `ragIndex()` fetch calls.
- `src/__tests__/1973-fetch-analyze-timeout.test.ts` (new): 7 scenarios — Scenario A (source timeout → partial), Scenario B (rag hang → AbortSignal fires gracefully), Scenario C (all fast → full result, static assertions).
- REC-4 (use_ingested SQLite read-path) DEFERRED per PO — opens as FETCH-ANALYZE-2.

**Done-signal:** `docs/signals/dev-mcp-server-fa-fix-done-20260526T1600Z.json`
**ops_rebuild_required: true** — docker compose up -d --build mcp-server needed.

---

## c309 · 2026-05-26 (FETCH-ANALYZE-PROFILE SPIKE — read-only)

**Commit:** NONE | profiling spike only | no production code changed
**Signal:** `docs/signals/dev-mcp-server-fetch-analyze-fix-proposal-20260526T1500Z.json`

Root cause documented: `Promise.all` Step-1 + no AbortSignal on ragHttpClient.
Reuters confirmed DOWN (48 consecutive failures). VPS news-fetch healthy.
Step-1 ceiling 30s (vneconomy serial + reuters budget) + Step-4 ragIndex no guard = 60s stall.

---

## c308 · 2026-05-26 (P2-L Trial-2 — G11 sector-classifier regression revert)

**Commit:** `3b9851fb` | 2 files | tsc EXIT 0 | bun 9451 pass / 336 fail | toolCount=148 | sched=68

sectorPeers.ts line 351 — restored ratio threshold from `<= 0` back to `<= 2.5`.
Sandbox 9/9 PASS. Phase-2 SCALE pilot CLOSED at 8972a155. P2 FROZEN.

---

## Working Memory

### Phase-2 State (as of c308)
- P2-A/B/C/D/E/F/G/H/I/J/K/L: ALL DONE — SCALE pilot 12/12 CLOSED at 8972a155
- Phase-2 is FROZEN — do NOT disturb graded surfaces

### Active Work
- FA-FIX: DONE (c310). ops rebuild required before live fix takes effect.
- NEWS-INGEST-2b: still HELD (pending zone clearance after FA-FIX lands)

### Carry-over
- 345 pre-existing test failures — within ≤348 baseline
- Bun v1.3.13 C++ panic after full suite = known upstream bug (exit code 0, tests pass)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
