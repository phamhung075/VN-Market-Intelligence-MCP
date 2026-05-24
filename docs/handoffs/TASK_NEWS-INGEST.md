# TASK NEWS-INGEST-1 — News ingest silently rejects entire feed as duplicates

**Opened:** 2026-05-24T21:49Z (PO, from ops live-diagnosis handoff via main terminal)
**Type:** TRACKED BUG FIX (production reliability — top of PO priority order)
**Severity:** HIGH — near-total data loss on the news pipeline; `rag_analyses` ~empty (~1 row); sentiment/impact/RAG retrieval all starved.
**Zone:** UNDECIDED until confirmation step lands (see Zone Decision). Confirmation step zone = `apps/mcp-server/` (dev-mcp-server). Fix zone = whichever owns the broken URL source (mcp-server ingest / news-fetch / VPS push script).

---

## Bug Report (ops evidence — DO NOT re-run from scratch, build on it)

Live container logs show EVERY `pollNews` cycle ending:
```
fetched:160 inserted:0 duplicates:160
```
VPS push delivers ~160 articles → mcp-server tries to insert → ALL dropped as duplicates → 0 stored. Silent because the insert uses `INSERT OR IGNORE`.

Consequences:
- `rag_analyses` near-empty (~1 row). Dashboard honestly shows the empty table — this is NOT a dashboard bug and NOT a service outage.
- Ops PROVED the mechanism: real VN articles with DISTINCT `source_url` (cafef, vnexpress) inserted fine; generic / shared / empty-URL articles got rejected.

### Two candidate root causes (developer must CONFIRM which — do NOT guess-fix)
- **(a) Shared/empty `source_url`:** VPS push payload sends NULL / empty / SHARED `source_url` across all articles → unique index drops all-but-first.
- **(b) Title-dedup over-match:** `isTitleDuplicate` in `tryInsertEntry` over-matches and rejects distinct articles.

### PO code-read corroboration (narrows, does NOT decide — confirmation still mandatory)
Read on 2026-05-24, paths confirmed present:
- `apps/mcp-server/src/application/usecases/pollNews.ts`
  - L809: `fetched = allItems.length`. Persist loop L915 iterates `relevantItems`; `inserted + duplicates = 160 = fetched` ⇒ all 160 reached `tryInsertEntry` and ALL returned `false` (no relevance-filter drop in play).
  - L511–566 `tryInsertEntry`: title-dedup at **L528** runs ONLY when `entry.sourceUrl` is non-empty; then `INSERT OR IGNORE` at L533 with `entry.sourceUrl || null` at L546.
- `apps/mcp-server/src/domain/services/newsNormalizer.ts:960` → `sourceUrl: item.url ?? ""` (missing `url` becomes EMPTY STRING, not null).
- `apps/mcp-server/src/infrastructure/db/schema-news.ts:49–51` — the unique index is **PARTIAL**:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
    ON rag_analyses(source_url)
    WHERE source_url IS NOT NULL AND source_url != '';
  ```
  So EMPTY-STRING and NULL URLs are EXEMPT from the index (they would NOT collide). And empty-URL items skip title-dedup (L528 guard). ⇒ A purely empty-URL feed would INSERT, not drop. The observed all-drop with `inserted:0` therefore implies EITHER (a') the 160 share an identical NON-empty `source_url` (1 wins index, 159 collide) OR (b) title-dedup over-matches on distinct non-empty-URL articles. **Disk read cannot distinguish (a') from (b) — only per-article live logging can.** This is exactly why the confirmation step is mandatory before any fix.
- `apps/mcp-server/src/interface/mcp/routes/pushNewsHandler.ts` — VPS push receiver. Items typed `{title,url,publishedAt,content,source}` (L42–48); grouped by `source`, injected into `pollNews` as fetchers (L79–87). The `url` per item is the value that becomes `sourceUrl`.
- `apps/news-fetch/` (port 5008) — produces articles/URLs the VPS pushes.
- VPS-side push script (Vinahost) — may flatten/share URLs.

---

## Chain (PO-owned routing)

### Step 1 — CONFIRM root cause (ROUTE FIRST) — `dev-mcp-server`, zone `apps/mcp-server/`
Add **temporary** debug logging to `tryInsertEntry` (and/or the persist loop) to log, for ONE real push/poll cycle, per article:
```
{ id, source_url, sourceTitle(≤60 chars), isTitleDup: boolean, insertChanges: result.changes }
```
Goal: see whether across the 160 the `source_url`s are **empty / shared-identical / distinct**, and whether `isTitleDup` is firing. Output the per-article table (or a histogram: distinct-URL count, empty-URL count, max-duplicate-URL count, title-dup-true count) into this handoff.
**Decision rule:**
- Many articles share ONE identical non-empty `source_url` ⇒ root cause (a') — URL flattening UPSTREAM. Trace to `pushNewsHandler` payload → `news-fetch` → VPS script; fix in whichever ZONE flattens it.
- `isTitleDup:true` dominating on distinct-URL articles ⇒ root cause (b) — fix the title-dedup logic in `pollNews.ts` (mcp-server zone).
- URLs are empty across the board ⇒ contradicts current logic (empty is exempt + insertable); re-examine the index state on the live DB and the actual inserted/duplicate accounting.
Debug logging is REMOVED (or downgraded to a guarded `logger.debug`) before the fix commit — do not ship verbose per-article logs to prod.

### Step 2 — FIX (route by Step-1 verdict)
- Root cause (a') upstream URL flattening → `developer` (news-fetch, zone `apps/news-fetch/`) OR ops/dev-vps-crawls (VPS push script) — PO routes after verdict.
- Root cause (b) title-dedup → `dev-mcp-server`, zone `apps/mcp-server/`.
Fix must NOT weaken GENUINE dedup (real duplicate URLs / real repeated titles must still be blocked).

### Step 3 — QA GATE — `qa`
Acceptance criteria (binding):
1. A real fetch/poll cycle now inserts **>0** rows with **DISTINCT** `source_url`s (honest count, on real or realistic feed).
2. No regression: existing tests stay green (baseline 9277 pass / 34 known fail — no new fails).
3. Dedup STILL correctly blocks GENUINE duplicates (same `source_url` twice ⇒ second dropped; same title within 24h window for URL-bearing items ⇒ dropped). Provide a positive-and-negative test.
4. Emit `docs/signals/qa-news-ingest-<UTC>.json`.

### Step 4 — fixer (only if QA CHANGES_REQUESTED) — `fixer`

### Step 5 — PO close — `po`
Sign off vs the 3 ACs; record verdict; main terminal commits in-tree work (commit-mutex enum defect — dev agents can't acquire).

### Step 6 — ops PROVE LIVE — `ops`
Rebuild mcp-server container, run/await a real `pollNews` cycle, show `inserted` > 0 in the live log AND `rag_analyses` row count rising with DISTINCT `source_url`s. Paste the live log line + before/after row count here. This is the FINAL truth gate — disk-green is not enough.

---

## Recurring-bug guard (binding)
Per `feedback_recurring_bug_escalation.md`: if this reaches **≥2 fix commits on the same module without resolution**, PO BLOCKS the task and calls `architect` for a root-cause rethink before any new fix. Note: news ingest / BCTC write-chain has a recent recurring-bug history (1953b/c/f, 1954a) — treat the dedup write path with the same discipline.

## Constraints (binding, Day-0, every agent)
- Explicit-file staging (`git add <path>`, NEVER `-A` / `.`); sequential commits; one logical change per commit.
- NO `--force` / `--no-verify` / `--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches).
- `git show --stat HEAD` must show ZERO foreign files (heavy fleet commit-race).
- Do NOT touch any `pilot-status-*.json` (all frozen 12/12).
- Never ask the user to deploy — ops does rebuilds.
- HONEST counts only — no fabricated inserted/row numbers.

---

## NEWS-INGEST-1 Histogram (dev-mcp-server, 2026-05-24T21:57Z)

### Real VPS push cycle captured: 2026-05-24T21:57:17Z

Trigger: VPS push received (`items_count: 160`). Debug logging active in container rebuilt from
`apps/mcp-server/src/application/usecases/pollNews.ts` (`tryInsertEntry` + pre/post-loop).

#### URL histogram (pre-loop, over `relevantItems` after VN relevance filter):
| metric | value |
|---|---|
| total articles (relevant) | 160 |
| empty/NULL `source_url` | **0** |
| distinct non-empty `source_url` | **160** |
| max dup count for any single URL | **1** (all URLs distinct) |

#### Per-article dedup breakdown (inside `tryInsertEntry`):
| metric | value |
|---|---|
| `isTitleDup=true` (dropped before INSERT) | **50** |
| `isTitleDup=false` (reached INSERT OR IGNORE) | **110** |
| INSERT `changes=1` (actually inserted) | **0** |
| INSERT `changes=0` (UNIQUE index collision) | **110** |

#### Cycle summary:
```
relevant:160  inserted:0  duplicates:160
```

### Root cause verdict: **(c) VPS re-push of already-stored articles**

**Neither (a) shared URL nor (b) title-dedup over-match is the primary cause.**

The actual cause is **upstream**: the VPS/news-fetch service re-pushes the same 160 articles on
EVERY cycle. A batch query of all 160 source_urls against `rag_analyses` confirms:
```
already_in_db: 160  not_in_db: 0
```
All 160 articles pushed in this cycle already exist in the DB (they were inserted in previous
sessions: as far back as 2026-05-22). The dedup layers (title-dedup + UNIQUE index) are both
working correctly — they are correctly blocking re-insertion of known articles. The problem is
that the VPS sends the same stale batch every cycle instead of only NEW articles.

The 50 `isTitleDup=true` drops are legitimate (article titles matching within 24h window for
items already stored in the same session or nearby session).
The 110 INSERT OR IGNORE drops are also legitimate (URL collision = already stored previously).

### Secondary observation: no URL flattening, no shared single URL
PO hypothesis (a') — all 160 articles share ONE single `source_url` — is **RULED OUT**.
Every one of the 160 articles has a distinct, full, canonical URL (cafef.vn, vnexpress.net,
vneconomy.vn with unique article slugs/IDs). No URL flattening detected.

### Zone ownership for NEWS-INGEST-2 (the fix):
**`apps/news-fetch/` — dev-news-fetch** (or the VPS push script on Vinahost, whichever is
responsible for the push payload selection).

The fix must change the news source selection logic so the VPS only pushes articles NEWER
than the last push (`publishedAt` cutoff, or a "since" cursor). Possible fix locations:
1. **VPS push script** (Vinahost, outside the monorepo) — if it uses a naive "always push last N articles" approach, change to a "push since last_seen_timestamp" cursor.
2. **`apps/news-fetch/`** — if the news-fetch service feeds the VPS script, it must emit only articles published after the last known push timestamp.
3. The fix MUST NOT weaken genuine dedup — `rag_analyses` UNIQUE index + title-dedup both stay; the fix is at the *source* (VPS push script / news-fetch), not inside mcp-server.

### Debug logging status:
All `[NEWS-INGEST-1 DEBUG]` lines REMOVED from `pollNews.ts` before commit. tsc clean.

---

## Worklog (agents append below)
- 2026-05-24T21:49Z [po] Task opened. Bug report captured from ops live-diagnosis. Confirmation step routed FIRST to dev-mcp-server (per-article debug logging) before any fix. Zone-of-fix deferred to Step-1 verdict.
- 2026-05-24T21:58Z [dev-mcp-server] NEWS-INGEST-1 COMPLETE. Root cause confirmed: VPS re-pushes 160 already-stored articles every cycle. Debug logging added, real cycle captured (21:57:17Z), histogram recorded, debug removed. Fix zone = apps/news-fetch/ (or VPS push script). See histogram above.
