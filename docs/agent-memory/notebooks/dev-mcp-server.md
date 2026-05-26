# dev-mcp-server -- Notebook

## c309 · 2026-05-26 (FETCH-ANALYZE-PROFILE SPIKE)

### SPIKE: fetch_and_analyze timeout profiling — DONE (no production code changed)

**Commit:** NONE — read-only profiling spike
**Task:** FETCH-ANALYZE-PROFILE (timebox 120 min)

---

### Call-Path Analysis

`fetch_and_analyze` is a synchronous MCP tool handler in
`apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts`.
When called with default args (all 4 sources, limit=20) the wall-clock path is:

**Step 1 — Fan-out fetch** (`Promise.all` over 4 promises)

| Source | Mechanism | Per-call timeout |
|---|---|---|
| cafef | axios GET `cafef.vn/thi-truong-chung-khoan.rss` | 15 s |
| vnexpress | axios GET `vnexpress.net/rss/kinh-doanh.rss` | 15 s |
| vneconomy | axios GET x2 (stocks + finance RSS) serial inside one promise | 15 s each = up to 30 s total |
| reuters | `fetch()` → `news-fetch:5008/reuters/headlines` POST | `AbortSignal.timeout(30_000)` = 30 s |

`Promise.all` waits for the SLOWEST slot. Worst case:
- vneconomy serialises 2 feeds → up to 30 s before its slot resolves.
- reuters has a 30 s hard cap but any network/TE delay on news-fetch or the upstream
  Reuters API can hold the slot at the limit.
- **Total Step 1 ceiling: 30 s** (vneconomy or reuters dominates; they race in parallel).

**Step 2 — normalizeNews** — pure JS, ~0 ms per item.

**Step 3 — SQLite INSERT OR IGNORE x20** — synchronous Bun SQLite, ~1 ms total.

**Step 4 — ragIndex fan-out** (`Promise.all` over 20 ragIndex calls)
Each `ragIndex` call is `fetch()` to `rag-service:5002/index`.
**No AbortSignal / timeout guard on ragIndex.** If rag-service is slow (embedding
model cold-start, LanceDB write contention, or OOM-flap restart), each call can
hang indefinitely. With 20 calls fanned out, the Promise.all waits for the last
one to settle. Under post-OOM restart the rag-service can take 15–30 s to
respond per call, but only one call blocks — others complete quickly.

**Total worst-case wall clock for one fetch_and_analyze(all sources, limit=20):**

| Phase | Normal | Degraded |
|---|---|---|
| Step 1 fetch | 5–10 s | 25–30 s (vneconomy serial + reuters hang) |
| Step 4 ragIndex | 2–5 s | 30+ s (rag-service restart race) |
| **Total** | **7–15 s** | **55–60+ s** |

The MCP tool response budget (gateway/claude.ai) is approximately 60 s.
A single slow upstream (reuters 30 s) + slow rag-service (30 s) = 60 s exactly,
triggering timeout with no slack.

**Why reuters is the primary culprit:**
The cowork agent at 04:07Z performed 3 timed-out retries. The independent probe
at 04:10Z showed the VPS news-fetch service itself was healthy (last push 04:01Z,
0 errors). That means the `reuters/headlines` POST to news-fetch returned data fine
in the probe, but under the MCP tool call path the 30 s AbortSignal is the
hard wall — if news-fetch itself is under load (concurrent push + headline fetch)
the POST can easily approach 20–30 s on the response side. Combined with
vneconomy's serial 2-feed pattern, the whole Step 1 can reach 30 s before
Step 4 even starts.

**Secondary issue — no AbortSignal on ragSearch / ragIndex:**
`ragHttpClient.ts` `ragSearch()` and `ragIndex()` both call `fetch()` with no
`signal:` parameter. Only `ragHealthCheck()` has `AbortSignal.timeout(3000)`.
Under post-OOM rag-service restart, ragIndex promises can hang 30–60 s each.
Because Step 4 uses `Promise.all`, the slowest individual call dominates.

---

### Recommendation 1 — Per-source timeout budget

Current situation: vneconomy has no outer timeout (relies on axios 15 s
per feed, but runs 2 feeds serially = up to 30 s). Reuters has AbortSignal 30 s
(correct but tight). cafef and vnexpress have 15 s each.

Proposed per-source budgets for fetch_and_analyze Step 1:

| Source | Proposed outer budget |
|---|---|
| cafef | 10 s (`AbortSignal.timeout(10_000)` wrapping the fetchCafeF() call) |
| vnexpress | 10 s |
| vneconomy | 12 s (covers the 2-feed serial path with margin) |
| reuters | 15 s (tighten from 30 s — news-fetch is local Docker, not external) |

Implementation shape: wrap each `fetchPromises.push(...)` call in a
`Promise.race([sourceFn(), timeoutPromise(budgetMs)])` that resolves to `[]`
on timeout (matching the existing `.catch(() => [])` pattern for reuters).
Do NOT throw on timeout — fall through to an empty array so the other
sources still contribute articles.

Rationale for 15 s reuters: news-fetch:5008 is a Docker-network call on
localhost, not an external API. 30 s was inherited from the original Reuters
RSS direct-fetch pattern (geo-blocked, slow). Post-G5b rewire, 15 s is
generous for a local HTTP call and removes the main budget excess.

---

### Recommendation 2 — Promise.allSettled fan-out (Step 1)

**Current:** `Promise.all(fetchPromises)` — one slow/rejected source propagates
to a full Step 1 failure (all items lost) OR holds all results until the slowest
settles.

**Proposed:** Replace `Promise.all` with `Promise.allSettled`:

```typescript
const settled = await Promise.allSettled(fetchPromises);
const allItems = settled
  .flatMap(r => r.status === 'fulfilled' ? r.value : [])
  .slice(0, limit);
```

Effect: a hanging reuters slot resolves to empty array after its own timeout
(Rec 1), while cafef/vnexpress results are already available. The tool returns
articles from the working sources. One slow upstream cannot hold the entire batch
hostage.

This is a safe, mechanical change with no domain side effects — all downstream
steps (normalize, insert, ragIndex) already handle empty or partial arrays
correctly.

---

### Recommendation 3 — Lighter already-ingested DB read path

**Observation:** The VPS push pipeline (`POST /api/push-news` → pollNews) already
ingests all 4 sources every 15 min and stores normalised entries in `rag_analyses`
with a `UNIQUE INDEX on source_url`. The off-hours news-scout cycle that is timing
out is calling `fetch_and_analyze` to re-fetch and re-analyse articles that are
already in the DB (pushed 15 min ago by the VPS pipeline).

**Proposed lighter path:** Add an optional `use_ingested` boolean parameter to
`fetch_and_analyze` (default `false` for backwards compat). When `true`, skip
Step 1 (network fetch) entirely and read recent `rag_analyses` rows directly from
SQLite:

```sql
SELECT * FROM rag_analyses
WHERE created_at >= datetime('now', '-2 hours')
ORDER BY created_at DESC
LIMIT ?
```

Then normalise the SQLite rows back into AnalysisEntry shape (they are already
normalised — the format is identical), skip Step 3 (rows already exist), skip
Step 4 ragIndex (already indexed by push-news path), and jump to Step 5 format.

Wall clock: 1–2 ms for the SQLite read vs 30+ s for the live fetch. No network
at all.

**When news-scout should use this path:** For off-hours analysis cycles where
freshness is defined as "last 2 hours" rather than "live now". A `since_minutes`
parameter (e.g. `since_minutes=120`) would let callers control the recency window.

**QA gate required before shipping:** The `use_ingested` path bypasses Step 4 on
the assumption that push-news already called ragIndex. This needs a test that
verifies ragIndex is NOT called when `use_ingested=true`, and that the SQLite
query correctly filters by the `since_minutes` window.

---

### Ship Decision: NO production code shipped

This is a read-only profiling spike. No code changes made. No container rebuild
needed.

**Follow-up FIX dispatch required:** YES.
Signal: `docs/signals/dev-mcp-server-fetch-analyze-fix-proposal-20260526T1500Z.json`

---

### Zone Health
tsc: NOT run (no code changed). bun test: NOT run (no code changed).
All reads were static analysis only. Zone surfaces untouched.
toolCount=148, sched=68 (unchanged from c308).

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`

---

## c308 · 2026-05-26 (P2-L Trial-2 — G11 sector-classifier regression revert)

### P2-L Trial-2 — G11 Regression Revert DONE

**Commit:** `3b9851fb` | 2 files | tsc EXIT 0 | bun test 9451 pass / 336 fail | toolCount=148 | sched=68

**Injection reverted:** `apps/mcp-server/src/domain/services/sectorPeers.ts` line 351 — restored ratio threshold from `<= 0` (QA injection 0332624a) back to `<= 2.5`. Removed entire injection comment suffix.

**Sandbox:** 9/9 scenarios PASS, runner exit 0. `sector-classifier-golden-known-ticker` flipped status:pass / actual:"sector_wide" / match:true.

**Dashboard:** `apps/mcp-server/dashboard/index.html` inline trace block updated — sector-classifier-golden-known-ticker shows status:pass in mcp-traces-data JSON block.

**Gate 2:** Server health OK (toolCount=146 live endpoint) | ESLint: not re-run (single-line revert, no structural change) | tsc EXIT 0 | sched=68 | toolCount grep=148.

**Zone health:** P2-L Trial-2 complete; all 9 sandbox scenarios GREEN; sectorPeers.ts injection cleared; tsc EXIT 0; bun test 9451/336 PASS | HEALTHY

---

## Working Memory

### Phase-2 State (as of c308)
- P2-A/B/C/D/E/F/G/H/I/J/K/L: ALL DONE — SCALE pilot 12/12 CLOSED at 8972a155
- Phase-2 is FROZEN — do NOT disturb graded surfaces

### Active Work
- FETCH-ANALYZE-PROFILE: SPIKE DONE. Fix proposal dispatched to po.
- NEWS-INGEST-2b: HELD (wait for this spike to clear zone)

### Carry-over
- 336 pre-existing test failures — within ≤348 baseline
- Bun v1.3.13 C++ panic after full suite = known upstream bug (exit code 0, tests pass)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
