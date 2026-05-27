# PO Notebook

## Cycle 2026-05-27T~20:50Z — dev-team :07 TRIAGE (peer session on mcp-server+PEK)

**Main terminal ran Step-0 channel audit (gateway call_tool unavailable to PO subagent).** Reconciled
state trusted over stale pipeline-state 20:36Z. Constraints honored: pdf-extractor + ALL PEK-* OFF-LIMITS;
serialize mcp-server (peer holds PEK-RENDER-MCP locks); SMALL batch (host-panic risk).

**BATCH(2) emitted:**
- **MACRO-LIVE-PRICES** (FIX→SPRINT-S, zone `apps/macro-indicators`, ba-first) — #3003 4-cycle macro
  staleness ESCALATED. Root cause confirmed at source: `HTTPCommodityFetcher` (repositories.go L37-60) is
  PERMANENT fixture mode `{OIL:82.5,GOLD:2350,USDVND:24500}`, ZERO network calls (deliberate sandbox
  contract); `resolveMarketPrices` fixture-fallback never fires (fetcher always succeeds w/ seed). VN-Index
  already live-wired (SQLiteMarketIndexRepository) but oil/gold/usdvnd left "post-pilot deferred" (L45).
  Needs ba→architect (data-source decision: VPS geo-block policy / DB table like VN-Index / FX feed; preserve
  sandbox fixture mode behind env gate)→pm→dev→qa. False-green guard 3bd9e6ae = verify END-TO-END through
  mcp-server, NOT direct curl. ZERO peer collision (different zone).
- **RECAP-BA** (existing RECAP-CMD row, zone `apps/mcp-server`, → ba) — the ONE mcp-server item. SAFE under
  peer-lock skip: next owner=ba, deliverable=spec DOC `docs/REQ_RECAP-CMD.md`, touches NO mcp-server source
  (no `bctcInspectHandler.ts` contention w/ PEK-RENDER-MCP). If execute-tier skips on a coarse zone-lock →
  harmless retry next tick. Chose RECAP over NEWS-FULLDAY (its spec is DONE@PO-review-gate = a PO action not
  a dev dispatch) and over SIG-IMPL-GATE (at pm → enters dev-mcp-server SERIAL code = max collision+host risk).

**Did NOT dispatch:** NEWS-FULLDAY (advance at PO spec-review gate, not dev batch), SIG-IMPL-GATE (peer
collision + host load), NEWS-CMD (DONE@20:52:50Z, no re-dispatch), PEK-* / pdf-extractor (OFF-LIMITS),
janitor-lane signal noise (nothing new). NEXT: dev-team routes batch (MACRO→Step2 planning, RECAP-BA→ba).

## Cycle 2026-05-27T21:41:17Z — NEWS-FULLDAY kickoff (user `/news` refinement → BA)

**Input:** User (non-technical, FR) sent a 4-item request: (1) refine `/news` to ALL important news
of the DAY (deduped, importance-ranked, not just latest); (2) `/recap` day; (3) `/recapw` week;
(4) `/recapm` month. **Items 2/3/4 are ALREADY owned by sibling Sprint RECAP-CMD (opened 21:34Z, at
BA gate) — did NOT duplicate.** Only item #1 is new → opened Sprint NEWS-FULLDAY.

**PO decisions (autonomous):**
- **REVISED the RECAP-CMD "`/news` stays as-is" ruling — on the record.** Day-SYNTHESIS gap is still
  `/recap`'s (unchanged). But user's separate signal about `/news`'s OWN job is legit: `/news` stays a
  news LIST but must be COMPLETE + deduped + importance-ranked. `/news` ≠ `/recap`, both single-purpose.
- **Traced live `handleNews` (telegramCommands.ts L510-600):** date window is ALREADY correct
  (today-since-VN-midnight, `ORDER BY impact_score DESC`). Gap = 3 defects: (1) silent cap 20
  (DEFAULT_LIMIT=20/MAX=50, no "more exist" signal) → full-day coverage; (2) NO dedup (multi-feed dupes
  pad list + push distinct stories off cap) → dedup on title/url, keep highest-impact copy; (3) raw HTML
  in `summary` (`<a href>`/`<img>`) → strip at render. Defect (3) FOLDS IN backlogged NEWS-CMD-HTML-STRIP.
- **Single zone apps/mcp-server, no new infra.** All 3 fixes inside `handleNews`. Render-time HTML strip
  (NOT upstream news-fetch — would split zone). Dedup = pure in-handler transform. No DB table / tool /
  cron / microservice / compose change. Sync read-only ~1s pull, same contract as `/news` today.

**Deliverables (UNSTAGED — main terminal commits):**
- `docs/SPRINT_GOAL_NEWS-FULLDAY.md` (separate file — SPRINT_GOAL.md=SELF-IMPROVE-GATE, SPRINT_GOAL_RECAP-CMD.md=recap cmds)
- `docs/TASKS.md` — new Sprint NEWS-FULLDAY section (NEWS-FD-BA pending, NEWS-FD-EXIT blocked) above RECAP-CMD; NEWS-CMD-HTML-STRIP row marked FOLDED
- `docs/handoffs/TASK_NEWS-FULLDAY.md`
- this notebook

**NEXT: ba** — write `docs/REQ_NEWS-FULLDAY.md`. **PIPELINE: continue.**

## Carry-over
- **NEWS-FULLDAY goal ARMED until QA live + user G9.** Chain: ba (REQ_NEWS-FULLDAY.md: full-day-coverage
  mechanism + dedup key/tie-break + HTML-strip rule + T-NEWS test matrix) → architect (confirm coverage
  mechanism + dedup/strip are pure in-handler transforms; small scope) → pm → dev-mcp-server (refine
  handleNews + extend T-NEWS suite + HELP_TEXT touch) → ops REBUILD+force-recreate → qa LIVE on
  zenmidi.com/vn-market/webhook (full deduped day, no HTML) → NEWS-FD-EXIT. Zone apps/mcp-server. Reuse
  handleNews/chunkStories/texts[]. No jargon, no impact_score number, no raw HTML.
- **RECAP-CMD goal ARMED until QA live G9** (sibling, item 2/3/4). Chain at BA gate: ba (REQ_RECAP-CMD.md)
  → architect (VN section labels from EveningSummary + PeriodicSummary) → pm → dev-mcp-server (3 handlers
  + router + chunkStories + HELP_TEXT + VN empty-states + tests) → ops REBUILD → qa LIVE → RECAP-EXIT.
  Render from TYPED objects only (NOT summaryText/buildSummaryText = English+jargon).
- **SELF-IMPROVE-GATE Phase 2:** SIG-IMPL-GATE spec APPROVED → pm. SIG-G-T1..T5 (dev-mcp-server serial)
  → SIG-G-REBUILD (ops) → SIG-G-T6 (qa GATE-PROOF subject-code inject, AC-T6-5 false-green firewall).
  C-4 per-path-default-false = HARD QA gate. Human-reserved: GLOBAL auto-dispatch flip, gate self-edit,
  un-pause 1948 OBSERVE, comprehensibility (lane-C). Carry HN-1 (cron `2 9 * * *`) + HN-2 (anti-runaway order).
- **PEK-RENDER goal ARMED until USER G9.** Round 6+ — QA RED on render seam → escalate architect, no blind
  patch. PDF-Extract-Kit/ pristine; CPU-only/8GB; DB verify = in-container bun readonly COUNT.
- Channel audit (MARKET/WORK/BUG via gateway) owed → main terminal next cron tick (PO subagent has no call_tool).
- All files UNSTAGED except PO doc edits — main terminal commits (serialized, no -A, no push, main branch).
