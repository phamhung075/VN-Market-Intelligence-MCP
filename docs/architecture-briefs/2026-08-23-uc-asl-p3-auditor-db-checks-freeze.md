<!-- size-justification: umbrella design covering 13 BA FRs + 7 ARCH-RATIFY resolutions + a
     live sequencing dependency discovered mid-design; a shorter brief would force pm/dev to
     re-derive the C-04 collision and the calendar-reuse decisions from raw file reads again. -->
# Architecture Brief — UC-ASL-P3: Freeze Tier-2/3 auditor predicates into `scripts/auditor-db-checks.sh`

**Task:** UC-ASL-P3 | **BA spec:** `docs/handoffs/UC-ASL-P3-BA-spec.md` | **Zone (ratified):** `scripts/` + `docs/agents/system-auditor/flow/` (narrowed from dispatched `cross-service/` — ARCH-RATIFY-6, BA's own recommendation, confirmed: every touched file lives under one of these two trees, no `apps/<service>/` landing) | **BUILD-STANDARD:** not-applicable (bug-fix/refactor class — freezes existing checks verbatim/corrected, no new service, no new domain primitive)

---

## 0. LIVE COLLISION FOUND — sequencing gate, not a design question

`FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` (P2) was claimed by dev-team's supervised-lane sweep at **2026-08-23T12:56:49Z — today, this session** and is now `IN_PROGRESS` with `owner=developer`. Its own deliverable text is explicit: *"SCOPE OF THIS ROW = scripts/ ONLY: create `scripts/auditor-db-checks.sh` ... Do NOT fold in any other C-xx predicate — UC-ASL-P3 stays BACKLOG."* Its own script header (already drafted in `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE-spec.md` §3) says the same: *"computes exactly ONE check today (c04) but is structured ... so a future UC-ASL-P3 pass can add more predicates into the SAME file without a redesign."*

**Consequence:** `scripts/auditor-db-checks.sh` does not exist on disk yet (confirmed, `ls` 2026-08-23), but a peer developer session may create it with only `checks.c04` populated at any point during this design pass or shortly after. UC-ASL-P3's own implementation phase (FR-1/FR-3 through FR-10) is an **extension of that file, not a fresh build** — every one of FR-1's own words already say this ("Starts from the C-04 skeleton already authored... extends it with the remaining 15 checks as sibling `checks.<id>` keys"), but the row-level `depends_on` graph never recorded it. **Gap found and closed in this brief's board update: `UC-ASL-P3.depends_on = [FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE]`.** PM must not hand a developer FR-1 until that row is `DONE`/`DONE_VERIFIED` — editing the same not-yet-existent file from two lanes at once is exactly the two-writer race class this fleet has hit before (`feedback_same_db_tools_diverge_rowcount`, orphaned-worktree class).

`FIX-AUDITOR-C04-FLOWDOC-REPOINT` (agent-father, BACKLOG, `depends_on: [C04]`) is a **narrow, single-row** repoint of `main.md`'s C-04 line only. It does not conflict with FR-11 below — FR-11 is a much larger replacement (whole Tier-2 dup block + B-05/B-09/B-13 + the full Tier-3 C-01..C-16 table) that will supersede the narrow repoint once it lands. No action needed on that row; just sequence FR-11 after it (or let FR-11 absorb it — either order is safe since both converge on the same final text).

---

## 1. ARCH-RATIFY resolutions (per BA's request — architect's call, all confirmed against live code)

**ARCH-RATIFY-1 (DB access = host-bind + `sqlite-wal-guard.sh`, not docker-exec):** RATIFIED. Three independent design passes (C-04 spec, C-12's own fix_spec, this ticket's own title) already converge here; `sqlite-wal-guard.sh`'s `immutable=1`-only-when-WAL-is-0-bytes conditional (2026-08-06) is confirmed live in the C-04 skeleton (`wal_guard_read_uri`/`wal_guard_read_mode`) and closes the exact WAL-blindness the 2026-07-12 RESCOPE note warned about. `main.md`'s C-01..C-16 table stays docker-exec for every check NOT yet ported — this script is the new SSOT going forward, not a retrofit of the old convention.

**ARCH-RATIFY-2 (C-06 calendar reuse) — OVERRULES BA's non-binding SLA-Resolver suggestion.** The SLA Resolver (`main.md:504-529`) is BCTC-earnings-window-specific (`sla.mode=="earnings-window-dependent"`, `trigger_months`/`window_days_after_quarter_end` from `system-map.json .project.data_sources[].sla`) — a different domain than C-06's need (VN trading-calendar + intraday session-hours for `market_messages` freshness). Reusing it here would force-fit an earnings-quarter model onto a daily/hourly cadence check. **Found the correct, already-existing, already-hardened reuse target instead:** `apps/mcp-server/src/domain/services/vnTradingCalendar.ts` (`isVnTradingDay(date)` — weekday + VN public-holiday + half-day aware, `SESSION_STATUSES = [open, holiday, half_day, weekend, unknown]`) composed with `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycle/marketHours.ts` (`isMarketHours(now)` — Mon-Fri 09:00-15:30 ICT, holiday-BLIND by itself). Together: full weekday+session-hours+holiday coverage, exactly what C-06's own `status_note` demands ("gate on a full trading-calendar predicate (weekday AND session hours AND public holidays)"). **Precedent for the reuse mechanism**: `scripts/check-foreign-flow-freshness.sh` `_compute_lcts()` already does this exact thing — a host-side `bun -e` with the JS source built into a shell variable first (NOT inlined `"$(cat <<'EOF'...)"`, which breaks on an odd-apostrophe JS comment, live-verified 2026-07-23), `cd "$MCP_SERVER_DIR"`, dynamic `await import('./src/domain/services/vnTradingCalendar.ts')`. `auditor-db-checks.sh`'s C-06 check must copy this exact idiom, adding `isMarketHours` to the same dynamic import from `marketHours.ts` (or its re-export off `intelligenceCycleJob.ts`, either import path is live). **Do NOT reimplement VN holidays or session-hours in bash** — that would duplicate `vnHolidayData.ts`'s data set, the exact class this ticket's own "extend, never duplicate" constraint forbids, and BA's EC-1 already correctly flags the class of gap a bash reimplementation would silently reopen.

**ARCH-RATIFY-3 (C-11 idiom + off-season severity):** (a) ISO8601 compare — use the `datetime(col) <op> datetime('now', ...)` wrap, consistent with C-08's already-fixed idiom (same file, same script, one convention beats two). (b) `status='done'`→`'success'` — straight port, no new design. (c) Off-season severity: unlike C-06, C-11 **is** in the earnings-window domain (BCTC PDF processing cadence) — this one legitimately reuses the SLA Resolver's `earnings-window-dependent` in-window test (`M ∈ trigger_months AND D ≤ window_days_after_quarter_end`, values from `system-map.json`, never hardcoded). Per FR-8, this arithmetic is simple date math (not a TS-module dependency) and should be ported into a small shared bash function inside `auditor-db-checks.sh` (e.g. `_in_earnings_window()`) that BOTH B-05's Healthy-Idle Gate and C-11's severity policy call — one bash port of the SLA Resolver's earnings-window branch only (its non-earnings generic-threshold branch is unused by either B-05 or C-11 and does not need porting here).

**ARCH-RATIFY-4 (C-12 table-name half):** RE-VERIFIED live this cycle: `market_messages_price_history` has zero hits anywhere in current `.ts`/`.sh` code — only in two doc/handoff files citing the historical (already-resolved) finding. Confirmed non-issue, no code fix needed, matches the 2026-08-08 finding exactly (3rd confirmation).

**ARCH-RATIFY-5 (extend `db-integrity-mount-drift-check.sh` for `PDF_EXTRACTOR_DB_HOST_PATH`):** DEFER. That script currently asserts only the mcp-server container's bind mount; pdf-extractor is a separate container/service and extending the drift-check would need a second `docker inspect` target — real work, not a one-line addition, and the new env var carries no live traffic yet to drift against. Recommend a follow-up backlog row once `PDF_EXTRACTOR_DB_HOST_PATH` has shipped and been in use for a while (mirrors how `MARKET_DB_HOST_PATH`'s own drift-check was added after the fact, not day-one).

**ARCH-RATIFY-6 (zone):** RATIFIED narrower zone per BA's own recommendation — see header.

**ARCH-RATIFY-7 (C-12 connection reuse):** Reuse the already-open `market.db`/`pdf_extractor.db` connections for C-12's entries on those two ids (avoid a redundant second `PRAGMA integrity_check` connection where one is already open in the same invocation); open a fresh short-lived connection per remaining `system-map.json`-listed sqlite DB in C-12's own loop. Lowest-risk default, no new failure mode, matches `db-integrity-counts.sh`'s "one invocation, all counts per DB" discipline as closely as a 7-DB fan-out allows.

**Opportunistic, NOT mandatory (flag for PM, do not fold into this task's scope):** once C-06 pulls in the `bun -e` + `vnTradingCalendar.ts` dependency, C-01/C-02/C-14's hand-rolled Sat/Sun-only `DOW` window guard (BA's EC-1, deliberately scoped out — holiday-blind) could be upgraded to `mostRecentTradingDayOnOrBefore()` at near-zero marginal cost (the runtime dependency is already present in the same script). Leaving this as a candidate follow-up, not touching it here — EC-1's scope-out stands as BA wrote it.

---

## 2. File-by-file design

### `scripts/auditor-db-checks.sh` (extends the C-04 skeleton, does not replace it)

- **Do not rewrite the file from scratch once C-04 lands.** Add `checks.<id>` keys to the existing single `sqlite3` invocation per DB, exactly as the C-04 header comment instructs ("extend the SELECT list + the IFS read, do not add a second process").
- Two `sqlite3` invocations (one per DB: `market.db` for C-01/02/03/05/06/07/08/09/13/14/15/16 + B-05/B-09/B-13; `pdf_extractor.db` for C-10/C-11), plus C-12's own N-way loop (ARCH-RATIFY-7).
- C-06's calendar gate runs BEFORE the `sqlite3` query decides severity (not inside SQL — `isVnTradingDay`/`isMarketHours` are JS, called once via the `bun -e` idiom, result captured into a bash var, then used to pick which threshold/verdict branch applies).
- `_in_earnings_window()` shared bash function (ARCH-RATIFY-3c) reads `sla.earnings_window.trigger_months[]`/`window_days_after_quarter_end` via `jq` from `system-map.json .project.data_sources[] | select(.id=="bctc-discover") .sla` — never hardcoded, per Hard Constraint 3.
- FR-8's NULL-guard (`datetime('now','<modifier>') IS NULL` preflight) and weekend/holiday WINDOW (C-01/02/14's existing Sat/Sun DOW branch, EC-1 unchanged) both port as bash functions, one instance each, called by every check that needs them — not re-derived per check.
- JSON contract (FR-10): one object, `checks.<id>` map, `{actual, expected, verdict: PASS|FAIL|SKIP-invalid, ...diagnostic fields}` — extend the C-04 skeleton's existing top-level shape (`scan_ts`, `source`, `read_mode`, `checks`), do not introduce a second shape.
- Bash 3.2-safe (Hard Constraint 6) — the C-04 skeleton already complies (no associative arrays, no `mapfile`); every new check must follow the same discipline.

### `scripts/auditor-db-checks.test.sh` (new)

Mirrors `db-integrity-counts.test.sh`'s fixture-DB convention (already the model the C-04 spec's own test plan uses). Needs fixture coverage for: AC-2 (C-04, already specified), AC-3 (C-06 off-market Saturday PASS + genuine market-hours outage still WARN — requires a stubbed/mocked `bun -e` calendar call or a real fixture date chosen to be a known past VN holiday/weekend so the test is deterministic without needing to freeze `Date.now()`), AC-4 (C-11 status='success' PASS + stale/failed negative control), AC-5 (C-12 loop coverage + 0-byte skip + WAL-mid-restart non-blindness, reusing `sqlite-wal-guard.test.sh`'s existing held-open-reader repro per BA's own instruction — do not reinvent), plus one PASS-path assertion per FR-3/FR-9 verbatim-frozen check.

### `docs/agents/system-auditor/flow/main.md` (agent-father zone, NOT architect's/developer's — flag for PM)

Current live line numbers (re-verified this cycle, file is now 1425L, BA's cited `:899-976`/`:953-970` are stale by ~230L from the 2026-07-12 dispatch text):
- SLA Resolver: `:504-529`
- BCTC Healthy-Idle Gate (B-05): `:532-560`
- Tier-2 DB Freshness Spot Checks (C-06, C-07 duplicate): `:562-583`
- BCTC URL Shape (B-09): `:584-596`
- Stale Pending BCTC (B-13): `:597-610`
- Tier-2 Emit block: `:611-651`
- Tier-3 DB Write Integrity (C-01..C-16 table + all guard prose): `:890-968`
- Tier-3 Emit block: `:969-1002`

Replacement per FR-11: all of the above collapse to one `bash scripts/auditor-db-checks.sh` call, a `RAW-CHECKS:` fenced paste of its JSON stdout, then per-FAIL/WARN-row calls into the existing (unmodified) `scripts/emit-audit-signal.sh`/`scripts/emit-dashboard-row.sh` — same emit plumbing, only the check computation moves. **Zone note for PM:** this file edit is `docs/agents/system-auditor/flow/` — same zone as `FIX-AUDITOR-C04-FLOWDOC-REPOINT`, i.e. agent-father, not developer. FR-1/FR-3..FR-10 (the script) is developer's zone (`scripts/`). This is the SAME two-owner split shape as the sibling `FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT` row being designed in this same session — PM should decompose into (developer: script + test) → (agent-father: flow-doc repoint, depends on the script existing) tracks, mirroring the C-04/C04-FLOWDOC-REPOINT precedent already live on the board.

---

## 3. DDD Layer Map (per BA's own table — ratified unchanged)

| Requirement | File(s) | DDD Layer |
|---|---|---|
| FR-1, FR-10 | `scripts/auditor-db-checks.sh` (JSON contract) | Interface |
| FR-2 | `scripts/lib/sqlite-wal-guard.sh` (reused) | Infrastructure |
| FR-3, FR-9 | `scripts/auditor-db-checks.sh` (frozen SQL) | Infrastructure |
| FR-4, FR-5, FR-6 | `scripts/auditor-db-checks.sh` (corrected predicates) | Infrastructure + Application |
| FR-7 | `scripts/auditor-db-checks.sh` (C-12 loop) | Infrastructure |
| FR-8 | `scripts/auditor-db-checks.sh` (WINDOW/NULL-guard/`_in_earnings_window`) | Application |
| FR-11 | `docs/agents/system-auditor/flow/main.md` | Interface (agent-father zone) |
| FR-12, FR-13 | `docs/data/orch/orch-state.json` task rows | n/a |

---

## 4. Test Strategy

Unit: `scripts/auditor-db-checks.test.sh` per §2 above, fixture-DB driven, no live docker/network dependency (mirrors `db-integrity-counts.test.sh`). Integration/AC verification: run against `data/live/market.db` + `data/live/pdf_extractor.db` read-only, confirm today's live verdicts match the BA spec's stated expectations (C-04 PASS at extracted_total_window below floor, etc. — re-verify at ship time, values drift). E2E: `main.md`'s FR-11 replacement verified by `git diff` (Write-tool-only, per Hard Constraint 5 — known multiline-Edit-tool strip bug) plus one live Tier-2/Tier-3 dry-run confirming `RAW-CHECKS:` paste + emit call sites still fire correctly through the unmodified `emit-audit-signal.sh`/`emit-dashboard-row.sh`.

---

## 5. Risk Flags

- **Two-writer race on `scripts/auditor-db-checks.sh`** (§0) — the only hard blocker; closed by the `depends_on` edge, not by any code change.
- **`bun -e` dynamic import adds a runtime dependency** (`bun` on PATH, `apps/mcp-server` checked out) to a script that was previously pure-bash/sqlite3 — same dependency `check-foreign-flow-freshness.sh` already carries and fails loud (`CALENDAR_ERROR`) rather than silently degrading; propagate that same fail-loud contract, never a bash-side holiday fallback.
- **C-06/C-11 fixture determinism** — calendar-gated tests must pin a fixture date rather than depend on "today," or the negative control will flap seasonally (same class BA's own AC-3/AC-4 negative controls already anticipate).
- **DDD violation avoided:** the earnings-window arithmetic stays inside the auditor's own script (Application layer, its own domain), not reached into `apps/mcp-server`'s domain layer for a second time — only the VN-calendar read (a pure, side-effect-free query) crosses that boundary, via the same `bun -e` read-only pattern already established, not a new coupling.

---

## 6. Task-board disposition (FR-12/FR-13)

Applied via `orch-apply.sh` in the same write as this brief:
- `UC-ASL-P3`: `architect_design_complete=true`, `architect_handoff` → this file, `depends_on=["FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE"]` (new, closes the gap in §0), `zone="scripts/ + docs/agents/system-auditor/flow/"`, `next_agent=pm`.
- `FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE`, `FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE`, `FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME`: REPOINTED (not closed — FR-11 has not landed yet) — `next_agent` cleared, `status` unchanged (BACKLOG, correctly non-dispatchable now that no independent action remains outside UC-ASL-P3), note added pointing at this brief + UC-ASL-P3 as the shipping vehicle. PO/PM should close these three once UC-ASL-P3's FR-4/5/6/7 land and the corrected predicates are confirmed live in `auditor-db-checks.sh`.
- `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE`: unchanged (already correctly scoped and in flight) — no edit.
- FR-13's two carve-outs (`FIX-AUDITOR-TASKBOARD-OVERFLOW-PREDICATE-WIP-ONLY`, `FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE`): no board action, confirmed out of scope, unchanged.

## NEXT

**pm** — decompose into the two-owner track (developer: FR-1..FR-10 script+test, gated on C-04 landing; agent-father: FR-11 flow-doc repoint, gated on the script existing) per §2's `main.md` note, same shape as the live C-04/C04-FLOWDOC-REPOINT precedent.
