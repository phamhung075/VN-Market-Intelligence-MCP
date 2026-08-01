# FB Post Source-Link / Re-Check Affordance — SPIKE Findings

**Task:** SPIKE-FB-SOURCE-LINK-RECHECK-AFFORDANCE (P3, type=SPIKE, mode=spike, timebox=120min)
**Zone:** multi (cross-cutting; routed to developer per Tier-3 fallback)
**Author:** developer | **Date:** 2026-08-01
**Scope:** Findings + recommendation only. No implementation this cycle (spike mode).
**Detail ref:** `docs/data/orch/archive/backlog-detail.json#SPIKE-FB-SOURCE-LINK-RECHECK-AFFORDANCE`
**Standing goal extended:** `project_all_info_source_link_dropdown_recheck` (set 2026-06-16, frontend-originated)

---

## 0. Premise re-verification (RAW, this cycle — not trusted from the 2026-06-24 audit blind)

- Read `docs/agents/fb-market-poster/flow/main.md` in full (995 lines): STEP 5 ("Write deliverable"), the STEP 3 post template, the hashtag-block rule, and all 16 STEP 4 pre-write validation checks. **Zero** reference anywhere in the file to a source URL, a named-tool citation, or a re-check pointer. The written file format is exactly: title → timestamp line → post body → disclaimer (`---` ... `---`) → hashtag block. Nothing else.
- Sampled `docs/social/fb-post-2026-07-31.md` (most recent) in full and grepped `docs/social/fb-post-2026-07-{28,29,30}.md` for `http|nguon|nguồn|dashboard|link|source` — 0 real hits. The single "nguồn dữ liệu" token in the 07-28 post is prose contrasting "hai nguồn dữ liệu" (TA indicator vs. sentiment/prediction model disagreeing on ACB) — not a citation or link, confirmed by reading the surrounding sentence.
- Extended the check to **every** published post: `grep -lE "https?://" docs/social/fb-post-*.md` across all 53 files on disk (2026-06-xx through 2026-07-31) → **0 matches**. The 2026-06-24 audit's "0 of 27" has widened to **0 of 53** as of today — the premise is CONFIRMED, and the absolute gap is larger now than at audit time, not smaller.
- Confirmed both weekend sub-flows (`weekly-recap.md`, `weekly-prediction.md`) share the same disclaimer+hashtag-only tail structure — the gap is flow-wide, not DAILY-mode-only.

**Conclusion: the 0/27 (now 0/53) premise stands. No source-link/re-check affordance exists anywhere in the FB post pipeline today.**

---

## 1. Medium constraint (confirmed, not assumed)

STEP 5 writes plain Markdown/prose to `docs/social/fb-post-{DATE}.md`; STEP 7's own Telegram notification says the file is "ready for copy-paste to Facebook Page." A native Facebook text post body is plain text — it has no interactive dropdown/expand affordance. A bare URL will auto-unfurl into a link-preview card; anything else (a named tool, a footnote) is inert text. This confirms the task's own framing: **per-number provenance via a rich dropdown, as built for the frontend under the parent standing goal, is not reproducible in the FB body itself.** This is a hard medium ceiling, not a flow-design choice.

---

## 2. New finding not in the original task framing: no public dashboard URL exists to link to

This matters directly for options (a)'s "dashboard verify URL" clause and (b)'s "companion dashboard card" — both assume a reachable public dashboard. Checked, not assumed:

- `nginx.conf` (the project's live public reverse proxy, fronting `zenmidi.com` — confirmed via `docs/ARCHITECTURE.md`'s "zenmidi.com bridge" note and live route grep hits for `zenmidi.com/mcp`, `/gateway`, `/vn-market`, `/cowork`, `/api/*`) has **zero `location` block for the frontend service**. The only public routes are `/`, `/mcp/`, `/vn-market/`, `/gateway/`, `/webhook`, `/health` — all resolve to `api_gateway` or `mcp_backend`, never `frontend`.
- `docker-compose.yml`: the `frontend` service publishes `3001:3001` on the **host** only (`docker-compose.yml:421-422`); it is never referenced in `nginx.conf`, so it is not reachable at any `zenmidi.com` path.
- **Consequence:** there is currently no live public dashboard URL a Facebook reader could click. Adding one to the footer would either (a) be a dead/unreachable link, or (b) require a separately-scoped infra/FE decision (expose `apps/frontend` publicly via `nginx.conf`, decide the security/auth posture for what is today a local-only app) before it could be added truthfully. This is a real cost the original task text did not surface, and it directly rules out shipping (a)'s dashboard-URL clause or (b) as-is in this pass.

---

## 3. Where real per-item source detail already exists vs. where it doesn't

- fb-market-poster's STEP 1 sources (`unified-agent.md`, `news-scout.md`, `market-watcher.md` notebooks) store **synthesized prose summaries** of news impact — verified by reading live `docs/agent-memory/notebooks/news-scout.md` cycles c221-c224. No raw article URL field survives into the notebook text the poster actually reads for its "Sự kiện chính" named-news items.
- Elsewhere in the system, live news-fetch tooling does carry a `source_url` per article at the tool-call layer (cf. `docs/architecture-briefs/2026-06-22-provenance-calibration-local-arch.md`'s `finding_data.source_url` pattern for the cascade-signal endpoint) — but fb-market-poster's own STEP 1b tool list (`get_market_snapshot`, `get_market_context`, `get_market_foreign_flow`, `get_macro_snapshot`, `get_technical_indicators`, `get_legal_risk_signals`, `get_sentiment_trend`, `get_earnings_calendar`) does **not** include a raw-news-with-URL call. The named news items in the post trace back to pre-digested notebook prose, not a live per-article tool call made this cycle.
- **Implication:** a genuine per-news-item clickable citation is NOT a trivial footer add. It requires either a new live tool call in STEP 1b returning article URLs, or restructuring STEP 1 to consume a structured (URL-bearing) feed instead of notebook prose. Both are beyond a footer-scoped fix and beyond this spike's timebox.

---

## 4. Options evaluated

**(a) Compact "Nguồn dữ liệu" footer naming live tools/feeds + dashboard verify URL** — the tool-naming half is **feasible now**; the dashboard-URL half is **blocked** (§2, no reachable public route exists). A static footer listing the concrete MCP tool names actually invoked this cycle (the STEP 1b hard-required-live set: `get_market_snapshot`, `get_market_context`, `get_market_foreign_flow`, `get_macro_snapshot`, `get_technical_indicators`) directly satisfies the audit's own stated bar — *"0 of 27 posts contained any URL, **named tool/source citation**, or re-check pointer"* — without any new infra or new tool calls (reuses STEP 1b working-memory results already gathered every cycle). Low cost, low risk.

**(b) Companion dashboard card per post, linked from the FB post** — **not feasible** without first shipping a separate infra/FE task (§2). Even after that, it requires building a per-post detail-expansion endpoint/page keyed to that day's data — a multi-file FEATURE (backend endpoint + frontend route + auth/exposure decision), an order of magnitude larger than this spike and larger than option (a). Not recommended for near-term closure of this gap.

**(c) Explicit NO-GO scope boundary** — too pessimistic. (a)'s tool-citation footer is concretely achievable now, at low cost, and directly closes the specific gap the audit measured (named source citation). Declaring NO-GO would leave 0/N unresolved when a cheap partial fix is available and in-scope for the FB surface.

---

## 5. Recommendation: **(a)**, narrowly scoped to what is actually deployable today

Ship a static "Nguồn dữ liệu" footer inside the post template (STEP 5 / weekly equivalents), placed as the final line of the post body before the hashtag block, naming the live tools/feeds actually called this cycle (pulled from STEP 1b working memory — no new tool calls required). Example rendering:

> Nguồn dữ liệu: HOSE/HNX/UPCOM (get_market_snapshot), khối ngoại (get_market_foreign_flow), tỷ giá & hàng hoá (get_macro_snapshot), chỉ báo kỹ thuật (get_technical_indicators) — dữ liệu phiên {DATE}, tổng hợp bởi bot AI.

**Explicitly deferred (NOT part of the recommended fix, called out so they are not silently dropped):**
- The "+ dashboard verify URL" clause of option (a) — blocked on §2. Needs a distinct infra/FE decision to publicly expose `apps/frontend` (or build a lightweight public verify page) before a truthful URL can be added.
- True per-number/per-news-item clickable provenance (the intent behind option (b)) — blocked on §3. Needs a new live tool call or a structured news feed, a separate scope.

---

## 6. Scoped follow-on task proposal (for PO to mint — not built in this spike)

**FIX-FB-SOURCE-TOOL-FOOTER** (type=FIX, size=S, zone=`docs/agents/fb-market-poster/`)

- **Scope:** `docs/agents/fb-market-poster/flow/main.md` STEP 3 template + STEP 5 write step + STEP 4 validation checks; same footer addition mirrored into `weekly-recap.md` and `weekly-prediction.md`'s equivalent compose/write/validation steps (GENERIC across all 3 modes, not DAILY-only — per §0's confirmation the gap is flow-wide).
- **AC-1:** Post template gains a "Nguồn dữ liệu" line listing the tool names actually invoked this cycle, sourced from STEP 1b (DAILY) / STEP 1b (weekly) working memory already gathered every cycle — no new tool calls.
- **AC-2:** New STEP 4 structural check (e.g. check 17, same severity class as existing checks 1-2/4-8): footer present, non-empty, dated with the session date; failing → fix inline before write.
- **AC-3:** Applies to all 3 modes (DAILY + WEEKLY_RECAP + WEEKLY_PREDICTION) — same footer contract in all three flow files.
- **AC-4:** Footer text does **not** include a dashboard URL or any other unreachable link (out of scope per §5 — do not silently add a URL that doesn't resolve; that requires the separate infra decision below).
- **AC-5:** Regression: run `scripts/fb-jargon-gate.sh` / `scripts/fb-data-integrity-gate.sh` / claim-truth-gate against a sample post carrying the new footer — the footer is a static tool-name list, not a data claim, and must not trip any gate.
- **Depends on:** none. Touches only `docs/agents/fb-market-poster/flow/*.md` — no `apps/` code, no rebuild.

**Optional, separate, lower-priority follow-on (only pursue if PO wants it):** a SPIKE/FIX to publicly expose `apps/frontend` via `nginx.conf` (with an explicit security/auth posture decision, since it is currently local-only by design) would then unblock adding a real dashboard-verify-URL line to the footer above. Not proposed as mandatory here — the audit's own bar (named source citation) is already met by the tool-footer alone, at a fraction of the cost.

---

## Files read this cycle (evidence trail)

- `docs/agents/fb-market-poster/flow/main.md` (995L, full read)
- `docs/agents/fb-market-poster/flow/weekly-recap.md`, `weekly-prediction.md` (STEP grep + disclaimer/hashtag sections)
- `docs/social/fb-post-2026-07-31.md` (full read), `-30`, `-29`, `-28` (grepped)
- `docs/social/fb-post-*.md` — all 53 files, URL-pattern grep
- `docs/agent-memory/notebooks/news-scout.md` (recent cycles c221-c224)
- `nginx.conf` (full route table)
- `docker-compose.yml` (frontend service port mapping)
- `docs/ARCHITECTURE.md` (zenmidi.com bridge reference)
- `~/.claude/.../memory/project_all_info_source_link_dropdown_recheck.md` (standing goal origin)
- `docs/data/orch/archive/backlog-detail.json` (task detail_ref)
