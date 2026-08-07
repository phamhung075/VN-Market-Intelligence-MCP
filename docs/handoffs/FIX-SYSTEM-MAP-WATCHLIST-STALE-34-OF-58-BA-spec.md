# BA Spec — FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58

**Agent:** ba · **Date:** 2026-08-07 · **Task:** FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58 (P1, size M, plan_only, supervised)
**Sprint:** COWORK-RELIABILITY · **Blockers for PO:** ONE verify-first item (§0) — not a business decision, a live-tool re-check only architect/dev-team's gateway grant can perform; does not block architect from starting design.

---

## 0. CRITICAL VERIFICATION FINDING — read first, changes the root-cause framing

**I do not have `mcp__gateway__call_tool` access** (BA's `tools_package` grants Read/Write/Edit/Bash/Grep/Glob/semble only — confirmed by a live attempt to call `get_watchlist` through the gateway, which errored `No such tool available`). I could not place the exact RPC call PO's row cites. What I *could* do — read the exact same underlying data the tool reads, at source, live:

- **Live-verified right now** (`docker exec vn-market-intelligence-mcp-mcp-server-1`, `DB_PATH=/app/data/market.db` — confirmed via container env, the same path `getDb()`/`get_watchlist` use): `SELECT COUNT(*) FROM watchlist` = **34**, and the ticker set is **byte-identical** to `docs/data/system-map.json` `.project.watchlist[].ticker` (34/34, both directions zero-diff), including the one `active:false` row (VEA).
- **All 34 rows share one identical `added_at = "2026-07-31 18:25:37"`.** Since `seedWatchlist()`'s `ON CONFLICT(code) DO UPDATE` never touches `added_at` (only `exchange/domain/thresholds` are updated on conflict — `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts:180-186`), a uniform timestamp across every row means the table was **freshly INSERTed from empty in one event**, not incrementally drifted.
- **`docs/data/coverage-state.json`** (`_updated_at: 2026-07-25T16:14:39Z`, pre-dates the event above) independently holds **57** tickers — system-map's 34 ∪ 23 more, a near-exact match to PO's named "missing 24" list (differs by one ticker: coverage-state has no VEA, PO's list has D2D instead) — corroborating that a fuller ~57–58-ticker roster **did genuinely exist live**, just not *now*.
- **`docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md`** (5th documented `SQLITE_CORRUPT` on this exact file since 2026-04-25) records a restore-from-backup recovery that same day, and states: *"Watchlist + fundamental data: Regenerated via startup backfill on container boot… NO permanent loss: All tables regenerate from live sources automatically."* This is **true only for the 34 rows `seedWatchlist()` derives from `system-map.json`** — it is **false** for any row added through `add_to_watchlist` (`apps/mcp-server/src/interface/mcp/tools/system/watchlist.ts:163-215`, a plain `INSERT … ON CONFLICT`, zero write-through to any file). Those rows have no file-backed source of truth, so a corruption-recovery reseed **cannot** and does not restore them — they are gone.

**Reconstructed timeline (inference, not certainty — flagged as such):** pre-2026-07-30 the live watchlist genuinely held ~57–58 tickers (coverage-state 07-25 snapshot + PO's citations). A corruption/recovery cycle around 2026-07-30→07-31 (this project's 4th–5th documented `SQLITE_CORRUPT` incidents in six days) rebuilt/reseeded the table from `system-map.json` alone, and the 24 `add_to_watchlist`-only tickers — plausibly added deliberately by the user, since 4 of them are top-tier bank blue-chips (ACB/CTG/MBB/VPB) — were never restorable and are gone. PO's board-row note (updated 2026-08-07T22:51:55Z, ~10.5h after the 08-06 12:1xZ incident) most likely reflects the *pre-corruption* evidence (coverage-state.json / an earlier probe), not a fresh post-incident call.

**Why this matters for scope, not just trivia:** if this reconstruction is right, the defect is not "a hand-authored file fell behind a healthy DB" — it is **"the only durable, file-backed watchlist record (`system-map.json`) is missing tickers that were genuinely, deliberately added at runtime, and every one of this project's five recorded DB-corruption recoveries has silently and permanently discarded any watchlist ticker that only ever lived in the DB."** That reframes which of PO's three candidates is safe (see §1a) and is a live, **recurring** risk (5 incidents since 04-25, most recently 6 days apart) — not a one-time historical fact.

**Blocker Q1 (route to whoever holds gateway access — dev-team already RAW-verifies this row's closeout, or PO):** run `get_watchlist` live, right now, before implementation starts. Two outcomes:
- **Confirms 34** (matches my finding) → proceed under the reframed root cause above; the "58, missing ACB/CTG/MBB/VPB/GAS/MWG" figures in the board row are historical, not current — architect should re-derive the actual target set live rather than hardcode the row's named list.
- **Confirms 58** (contradicts my finding) → then my `docker exec` methodology has an error (wrong replica/container) that must be explained before trusting further diagnosis — do not proceed on either data set until reconciled.

**Independent of this dispute, unconditionally true today:** `apps/frontend/app/domain/market.ts` `WATCHLIST_STOCKS` (compile-time, 34 entries, mirrors `system-map.json` exactly) verifiably lacks ACB/CTG/MBB/VPB/GAS/MWG **right now**, regardless of what the DB currently holds. AC-2 (frontend must render the full roster) is real and in-scope either way.

---

## 1. Executive Summary — current architecture (verified at source, not assumed)

```
docs/data/system-map.json .project.watchlist[]  (file, git-tracked, durable)
        │
        │  seedWatchlist.ts: loadWatchlistSeedFromSystemMap() at module load
        │  → WATCHLIST_SEED (derived, 34 entries)
        ▼
seedWatchlist(db): INSERT … ON CONFLICT(code) DO UPDATE   ← runs unconditionally
        │                                                     every non-test DB init
        ▼                                                     (schema.ts) — INSERT/UPDATE
   watchlist table (SQLite, market.db)                        only, NEVER DELETEs
        ▲
        │  add_to_watchlist / remove_from_watchlist MCP tools  ← direct DB write,
        │  (watchlist.ts:163-303) — user-facing, no agent flow calls these           ZERO write-back
        │                                                                             to system-map.json
   [ DB corruption → restore/reseed from system-map.json only → any add_to_watchlist-only
     row is silently, permanently lost — 5 documented occurrences since 2026-04-25 ]
```

This is a **one-way, lossy sync**: `system-map.json → DB` is enforced (via `seedWatchlist()`); `DB → system-map.json` **does not exist at all**. Any ticker added through the (intentionally user-facing) `add_to_watchlist` tool is invisible to the file forever, until either (a) someone hand-edits the file, or (b) the DB is wiped by corruption-recovery, at which point it is invisible to *everything*, permanently. Four consumers read the file *believing* it to be current (CLAUDE.md's own anti-hardcode rule, `system-map-query/SKILL.md`, `fb-market-poster/flow/daily.md:157`, `apps/frontend/app/domain/market.ts`) plus at least two more not named in the board row that assert the mirror as canonical (§6).

Prior art `SPIKE_1946` diagnosed and fixed exactly one instance of this class (PLX) by hand-editing the file — the class itself (one-way sync, no drift detection) was never closed, which is why it recurred, and per §0 the recurrence mechanism is worse than "someone forgot to edit a file": it now includes **DB-corruption-recovery as an active repeat-offender**, independent of anyone forgetting anything.

---

## 1a. Remedy Candidate Trade-off Analysis (informs architect's HOW — BA does not pick)

PO's row sketches three candidates and explicitly reserves the choice for ba/architect. Re-evaluated through the §0 durability finding:

| Candidate | As PO framed it | Reframed given §0 | Verdict for architect |
|---|---|---|---|
| **(i) Generate `system-map.json` FROM the DB** | File becomes derived, cannot drift | **Risky as literally stated**: the DB is proven non-durable (5 corruption events, most recently 6 days apart). Generating the file FROM a source that periodically resets itself would happily bake a post-corruption 34-row wipe into the file too — turning a *recoverable* file-vs-DB gap into an *unrecoverable* one (nothing left to regenerate from). | Only safe **combined with** closing the write-back gap first (see next row) — otherwise this candidate automates the loss instead of fixing it. |
| **(i′) Stronger variant — bidirectional write-through** | not explicitly named by PO, BA addition | `add_to_watchlist` / `remove_from_watchlist` write to `system-map.json` in the same call (or a same-cycle follow-up), making the file a live mirror that is *also* safe to regenerate DB from after any future corruption. Turns the DB into a disposable cache of a durable, git-tracked file. | Best long-term fit for the durability finding — flag to architect as the candidate most likely to satisfy AC-3's negative control *and* prevent recurrence, not just detect it. |
| **(ii) CI/audit check, set-equality, fail loud** | Cheapest, least invasive | Does **not** stop the corruption-recovery loss from happening — it only detects it after the fact. But that is a **real, concrete, non-trivial win**: had this existed, it would have caught the 08-06 incident's silent watchlist loss immediately instead of the incident report certifying "no permanent loss" incorrectly. | Directly satisfies AC-3's literal wording ("failing audit… loud warning"). Recommend as the **minimum mandatory component of whichever remedy ships**, layered on top of (i′) or (iii), not a substitute for closing the write gap. |
| **(iii) Delete the file, repoint consumers at the runtime tool** | Smallest surface, but frontend has no runtime fetch today | Inherits the **same** durability problem in the opposite direction: if the runtime DB is the only source and it periodically resets, deleting the file removes the project's *only* durable (git-tracked, survives every corruption trivially — it's not inside `market.db`) backing store. | Weakest fit given §0. If chosen anyway, the frontend gap is real engineering (§4 NFR-3) — a new api-gateway HTTP route wrapping `get_watchlist` plus a `fetchWatchlist()` client function plus loader-wiring in `dashboard.analysis.tsx` and its 3 child components (`StockSelector`, `WatchlistOverviewGrid`, `SectorPeersBar`), which today import the constant directly rather than receiving it as loader-supplied props. |

**BA recommendation to surface, not mandate:** (ii) is cheap and directly required by AC-3 regardless of which primary candidate wins; pair it with (i′) as the primary mechanism — it is the only option that both prevents recurrence and gives the DB a safe regeneration source. Final HOW call is architect's.

---

## 2. Functional Requirements + DDD Layer Mapping

| ID | Requirement | DDD Layer | Notes |
|---|---|---|---|
| FR-1 | Re-derive the CURRENT authoritative ticker set live (via `get_watchlist`, not this spec's numbers — see §0 Blocker Q1) before finalizing which tickers system-map.json needs. Do not hardcode "58" or the named 24-ticker list from the board row into the implementation — both may already be stale. | **Application** (orchestration of the verify step) | Gate-0 for whichever remedy ships. |
| FR-2 | Close the one-way sync: `add_to_watchlist`/`remove_from_watchlist` (`watchlist.ts:163-303`) must not be able to leave `system-map.json` and the `watchlist` table structurally divergent without a durable trace — either write-through (candidate i′) or an audit that fires within one cycle of the divergence (candidate ii). | **Infrastructure** (DB write adapter) + **Application** (the orchestration deciding write-through vs. audit-only) | This is the row's real load-bearing requirement — everything else is downstream of this decision. |
| FR-3 | Regeneration/audit mechanism: either (a) a script deriving `system-map.json`'s watchlist block from the live table (needs FR-2 landed first per §1a), or (b) a scheduled/CI check comparing the two sets and failing loud, reusing the existing diff primitives already proven in `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts` (`computeWatchlistDiff`, exported, pure, already unit-tested) rather than re-deriving diff logic from scratch. | **Infrastructure** (script) + **Interface** (cron/CI wiring, tool registration if surfaced as an MCP audit tool) | Prior art exists and is directly reusable — do not rewrite the diff algorithm. |
| FR-4 | CLAUDE.md's watchlist line ("query system-map.json for watchlist, never hardcode") — make TRUE (if system-map.json stays the read path under FR-2/FR-3) or repoint at `get_watchlist` as the canonical query (if candidate iii is chosen). Same correction applies verbatim to `.claude/skills/system-map-query/SKILL.md` § Watchlist (4 worked `jq` examples, all reading `.project.watchlist[]` — currently return the stale 34-set). | **Interface** (documentation-as-contract) | Satisfies AC-4 directly. |
| FR-5 | `docs/agents/fb-market-poster/flow/daily.md:157` (NOT `main.md:200` — PO's row cites `main.md`, but the DAILY pipeline was extracted to `daily.md` on 2026-08-06, *after* this row was minted 2026-07-25; `main.md` today is an 88-line thin dispatcher with no watchlist reference at all) — update the `jq '.project.watchlist[]...'` comment-instruction to match whichever remedy ships. | **Interface** (flow-doc-as-contract) | Stale-citation catch — save architect a dead-end file search. |
| FR-6 | Frontend serving gap (AC-2): if system-map.json stays canonical (candidate i′/ii), regenerate `apps/frontend/app/domain/market.ts` `WATCHLIST_STOCKS` from the corrected file at build time (a codegen step, not hand-editing — same anti-drift logic as FR-2/FR-3 applied to the frontend mirror) so the two "stale docstring" problems (file drift, constant drift) are closed by the SAME mechanism, not two separate hand-syncs. If candidate iii is chosen instead, see §1a's NFR-3 cost note (new endpoint + client fetcher + loader threading through 4 components). | **Interface** (frontend build-time codegen) or **Infrastructure** (new HTTP route) depending on candidate | AC-2 is unconditionally required regardless of §0's outcome. |
| FR-7 | Correct the two **additional** stale docstrings PO's `files` list did not name, both asserting the file↔constant mirror as canonical: `docs/architecture/microservice/frontend/domain-model.md` (§ `WATCHLIST_STOCKS`, currently states "33 entries (30 active + 3 inactive)" and lists 30 active tickers omitting PLX — itself already stale against the *current* 34-entry/33-active file, a second, independent drift instance, smaller but same class); `docs/architecture/microservice/technical-analysis/usecases.md:41` + `api-reference.md:101` (assert `system-map.json .project.watchlist` as "the ultimate SSOT" — review for continued accuracy once architect picks the remedy). | **Interface** | PO's row note explicitly says "correct the stale docstrings that assert the mirror is canonical" — these two are in scope under that instruction even though not named in `files`. |
| FR-8 | `apps/technical-analysis` (Go, separate container) resolves its own ticker universe **once at process startup** (`cmd/server/main.go:54-64`, `readWatchlistFromDB`) when `WATCHLIST_TICKERS` env is unset. Prior art (`WATCHLIST-DB-SYSMAP-DRIFT-FIX`, 2026-07-11 round-1 QA `CHANGES_REQUESTED`) already burned one round on exactly this: mcp-server/DB fixed, technical-analysis silently kept serving the stale set until manually restarted. Whichever remedy ships must include a `docker compose restart technical-analysis` step in the rollout checklist, or AC-1/AC-2 will look satisfied on the DB/frontend planes while this Go service still serves the old set. | **Interface** (deployment/rollout step, not code) | Direct repeat-defect precedent — do not let it recur a second time. |

---

## 3. Non-Functional Requirements

- **NFR-1 (no retroactive ticker guessing):** do not hand-type the board row's named 24-ticker list into any implementation artifact — §0 shows it is very likely a historical, not current, set. Whatever ships must re-derive the live target set at implementation time (FR-1).
- **NFR-2 (idempotent, transactional writes):** any DB-side mutation (candidate i/i′'s regeneration path) must reuse `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts`'s pattern — single transaction, parameterized `IN` clause, before/after diff logging, non-zero exit on unmet post-condition — not a new ad-hoc script.
- **NFR-3 (frontend cost is real, not assumed away):** if candidate iii is chosen, `WATCHLIST_STOCKS` today has **zero runtime fetch path** — it is a compile-time TS constant imported directly by 4 files (`market.ts` itself, `StockSelector.tsx`, `WatchlistOverviewGrid.tsx`, `SectorPeersBar.tsx`, `dashboard.analysis.tsx`). Converting to runtime-fetched loader data requires: a new api-gateway HTTP route (none exists today — verified, `grep -rn watchlist apps/api-gateway` = zero hits) wrapping `get_watchlist`, a new `fetchWatchlist()` in `apps/frontend/app/lib/api/client.ts` (following the existing `fetchMacroSnapshot`/`fetchKinhDichMarket` server-loader pattern already proven in `dashboard.analysis.tsx`'s `loader()`), and re-wiring all 4 import sites to receive the data as props instead of a static import. This is feasible (precedent exists) but non-trivial — do not treat it as a drop-in.
- **NFR-4 (journal-mode discipline):** any new or modified script that opens `market.db` directly (`new Database(DB_PATH)`) must NOT set `_journal_mode=WAL` in its connection string or pragma — `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` documents this exact class of re-arm as the confirmed root cause of the 5th corruption occurrence. `resync-watchlist-sysmap-2026-07-11.ts` already documents (and correctly avoids) this; any new script must inherit the same discipline.
- **NFR-5 (rollout completeness):** FR-8's `technical-analysis` restart step is mandatory in the same PR/deploy as any DB-side change — round-1 QA history (§ prior art) proves this is not optional.

---

## 4. Edge Cases

- **EC-1 — §0's Blocker Q1 resolves to "34, not 58":** the remedy still has real work to do (AC-2/AC-4/AC-7-style doc corrections in FR-4/FR-6/FR-7 are true regardless), but FR-1's "re-derive live, don't hardcode 58" becomes the headline instruction — the fix ships with whatever the live count actually is that day, which could be smaller than PO's row implies.
- **EC-2 — §0's Blocker Q1 resolves to "58, contradicting BA's read":** stop and reconcile the `docker exec` methodology error before any further design — do not silently proceed on two disagreeing data sets.
- **EC-3 — a 6th corruption occurs mid-implementation:** given the 5-incident-in-3.5-months history (most recent gap: 6 days), treat this as a *when*, not *if*, risk during this task's own implementation window. Whatever regeneration/audit mechanism ships should be RAW-verified to survive a corruption-recovery cycle without re-losing the fix (i.e., test candidate i′'s write-through against a simulated corruption-recovery reseed, not just against a healthy DB).
- **EC-4 — `add_to_watchlist` is user-facing, not agent-facing:** grep confirms zero agent flow files call it (`docs/agents/tools/list/add_to_watchlist.md` is documentation only). Whatever fix ships must not assume an agent-side call site exists to hook into — the mutation is presumed to originate from a human user session (Claude Desktop or similar), which constrains where a write-through hook can live (inside the tool handler itself, not an agent flow step).
- **EC-5 — negative control (AC-3) must exercise the REAL failure mode:** given §0, the most faithful negative-control test is not "add a ticker, see if system-map.json misses it" in isolation — it should include "add a ticker, THEN simulate/wait for a reseed cycle, confirm the ticker survives or the divergence is caught" — a pure add-then-diff test would pass even under the OLD one-way-sync architecture and not actually prove the drift mechanism is closed.

---

## 5. Adjacent Finding — Explicitly Flagged, Not Folded Into This Row's AC

**Two doc-drift instances beyond the board row's named `files`:** `docs/architecture/microservice/frontend/domain-model.md` and the two `technical-analysis` architecture docs (§2 FR-7) independently assert the file↔constant/file↔DB mirror as canonical and are themselves stale or need re-review post-remedy. Folded INTO this row's scope (FR-7) rather than spun out, since PO's own row note explicitly instructs "correct the stale docstrings that assert the mirror is canonical" — these are exactly that, just not individually named.

**NOT folded in — recommend a follow-up row:** the general DB-corruption-recovery gap this finding surfaces (§0/§1a) is broader than the watchlist table alone — `coverage-state.json` and possibly other file-mirrored-but-DB-authoritative structures could suffer the identical "reseed wipes anything added outside the file" failure mode. This row's scope is watchlist only (per the dispatch instruction's explicit exclusion of the coverage-state MWG gap); recommend PO/architect mint a separate audit row scoped to "which other file↔DB mirrors share this durability gap" once this row ships, rather than scope-creeping it in here.

---

## 6. File-by-File Plan (concrete, for architect)

**Core mechanism (whichever candidate wins):**
- `apps/mcp-server/src/interface/mcp/tools/system/watchlist.ts` (`add_to_watchlist`/`remove_from_watchlist`, L163-303) — write-through or audit-trigger hook, per FR-2.
- `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` — no change expected unless candidate iii (deletion) is chosen; the derive-from-system-map.json direction is already correct post-07-11-fix.
- `scripts/migrations/resync-watchlist-sysmap-2026-07-11.ts` — reuse `computeWatchlistDiff`/`deleteOrphanedWatchlistRows`/`upsertSsotWatchlistRows` (all exported, pure/tested) rather than re-deriving; do NOT re-run this exact script as-is against the current 24-ticker-short file without first resolving §0 Blocker Q1 (running it now, in either direction, could either destroy real data again or overwrite a file that's already correct).

**SSOT file + consumers named in the board row:**
- `docs/data/system-map.json` `.project.watchlist[]`.
- `apps/frontend/app/domain/market.ts` `WATCHLIST_STOCKS` (FR-6) + its 3 importing components (`StockSelector.tsx`, `WatchlistOverviewGrid.tsx`, `SectorPeersBar.tsx`) + `dashboard.analysis.tsx` (all 4 currently import the static constant directly).
- `.claude/skills/system-map-query/SKILL.md` § Watchlist (FR-4).
- `docs/agents/fb-market-poster/flow/daily.md:157` — **not** `main.md` (FR-5, stale-citation correction).
- `CLAUDE.md` § MCP Tools / System Data section (FR-4).

**Additional consumers found this cycle, not in the board row's `files` list:**
- `docs/architecture/microservice/frontend/domain-model.md` § `WATCHLIST_STOCKS` (FR-7).
- `docs/architecture/microservice/technical-analysis/usecases.md:41`, `api-reference.md:101` (FR-7, review-only).
- `apps/technical-analysis/cmd/server/main.go:54-64` — no code change, but a mandatory rollout step (FR-8, restart).

**Incident/durability context (read, do not modify unless architect's remedy touches it):**
- `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` — do not re-litigate; the P0 Go WAL re-armer fix it recommends is a separate, already-tracked concern.
- `docs/data/coverage-state.json` — read-only reference for the pre-corruption 57-ticker snapshot; its own MWG gap is explicitly out of scope here (`FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER`).

---

## 7. Acceptance Criteria Mapping (traceability back to the board row)

| Board AC | Satisfied by | Caveat |
|---|---|---|
| AC-1 (set-equality, not count-match) | FR-1 (re-derive live) + FR-2/FR-3 | Per §0, may already be true today at 34=34 — FR-1 makes the check honest either way. |
| AC-2 (frontend serves ACB/CTG/MBB/VPB in the SERVED page) | FR-6 | Unconditionally true defect today, independent of §0. |
| AC-3 (negative control — add a ticker, prove it's caught) | FR-2/FR-3 (mechanism) + EC-5 (test must exercise the real corruption-recovery failure mode, not just a static add-then-diff) | The weakest test would pass under BOTH the old and new architecture — EC-5 exists specifically to prevent that false pass. |
| AC-4 (CLAUDE.md instruction made true or repointed) | FR-4 | Also closes `system-map-query/SKILL.md`'s matching staleness. |

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-ba.md`, task_id `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58`.

## RETURN
```
DONE: BA spec complete — requirements, DDD mapping, remedy trade-off analysis, file-by-file plan written.
       CRITICAL: §0 verification finding reframes root cause from "stale file" to "recurring DB-corruption-
       recovery silently discards runtime-added watchlist tickers" — architect must resolve Blocker Q1
       (live get_watchlist re-check) before finalizing which of the 3 candidates to implement.
NEXT: architect | brownfield analysis + technical design for FR-1..FR-8 above, gated on Blocker Q1.
HANDOFF: docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md
PIPELINE: continue
```
