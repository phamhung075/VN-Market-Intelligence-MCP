# PO Notebook

## 2026-06-01 — sprint kickoff VPS-NEWS-CAFEF-VNECO (operator feature request)

**Request:** "Add cafef.vn and vneconomy.vn to fetch Vietnamese info pages on the VPS."

**CRITICAL SCOPE CORRECTION (raw-source verified BEFORE planning — not greenfield):**
- `cafef.ts` + `vneconomy.ts` ALREADY exist as DIRECT axios RSS fetchers in `apps/mcp-server/src/infrastructure/fetchers/`, wired into `fetch_and_analyze` (`news-analysis/analysis.ts:177/214`), tested (`021-rss-cafef.test.ts`).
- A VPS news pipeline ALREADY covers both: source `news-vps` `/proxy/news` in system-map, VPS `fetch-vn-news.sh` (not in repo) pushed 14 RSS feeds incl cafef + vneconomy → `/api/push-news`. Recon `docs/vps-sources/vn-news-rss/recon.md` (2026-05-13) = both 200, no anti-bot from VPS.
- `cafef-index` (`banggia.cafef.vn`) is a separate ACTIVE PRICE source via VPS — untouched.
- So TWO parallel paths exist: (a) DIRECT axios from France host (geo/CF-challenge exposed) vs (b) VPS proxy (geo-safe). RSS = headline+summary, NOT full article body — operator said "info pages" (body?).

**Decision:** ROUTING/COVERAGE sprint, NOT new integration. RECON-FIRST mandatory (ops-vps-fetch SSH lane, gateway-independent). Recon answers 3 Qs: (1) direct path geo-failing today? (2) does VPS pipeline already serve cafef/vneco end-to-end NOW (overlap — don't rebuild)? (3) "info pages" = full article BODY → document article-page structure + HTTP-only recipe. SPRINT_GOAL + TASKS written; sprint lock claimed.

**Sequence (WIP≤2):** CAFEF-VNECO-RECON (ops-vps-fetch) → architect (integration point + minimum-viable + fold-vs-distinct) → ba → pm → dev-vps-crawls (+dev-mcp-server if rewire) → qa.

**Overlap:** SSC-IBOARD-MIGRATE is DISTINCT (dead PRICE source) — do NOT fold; same dev-vps-crawls zone so router serializes.

**Carry-over:**
- Recon may EXIT the sprint early if it proves the VPS pipeline already serves both AND direct path is fine — then sprint collapses to resilience-confirm + doc-refresh. Watch for that verdict.
- The "full article body vs RSS summary" question is the real ambiguity — architect decides in-scope-now vs deferred after recon documents article-page anti-bot.
- TASKS.md growing (~95L) — migrate a closed sprint to archive next triage.
