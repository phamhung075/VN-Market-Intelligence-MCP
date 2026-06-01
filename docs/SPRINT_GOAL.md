# Sprint FLEET-HOST-SAFETY — On the 16GB host, the full fleet must NEVER be `up`

**Status:** BACKLOG 2026-05-31. **Pri: HIGH (AUD-ND-1, DRAIN-INJECTION-SAFE) / MEDIUM (A-01).** Zone: agents-architect (policy) → agent-father (auditor .md/flow) + cross-service (dev-team drain script). Root: intended runtime = minimal mcp-server + mcp-gateway only; the other 11 compose svcs are dev-zone/Factory-v2, NOT deployed; any path that starts/restarts them (or false-flags their absence) risks host kernel panic (project_host_memory_panic). Three live triggers in two ticks.

## Backlog Items

- 🔄 **AUD-ND-1 (agents-architect → agent-father)** — system-auditor flow MUST be detect/PLAN-ONLY: forbid ALL destructive/runtime-mutating shell ops (docker stop/kill/rm/restart, compose down, kill, rm -rf of live dirs). Any "remediation" emits a signal/DASHBOARD row, never acts. Add explicit "NEVER run destructive docker/kill/rm" invariant to auditor .md + guard/allowlist narrowing effective Bash to read-only probes. AC: simulated ENOSPC false-positive → DASHBOARD/signal row + ZERO infra mutation; invariant present in flow; regression note links incident (9c381ed3 + Telegram report 3016). Trigger: 2026-05-31 21:08Z P0 false-positive A-30-HOST-DISK ENOSPC → auditor `docker stop` mcp-server → ~9–129min outage. Route po→architect→agent-father.

- 🔄 **DRAIN-INJECTION-SAFE (agents-architect → agent-father; cross-service drain script)** — dev-team `drain-signals.md` MUST forbid interpolating signal/agent-authored payload text into a shell command line (a cowork payload held backtick `docker compose up -d` → /bin/sh command-substitution STARTED THE FULL FLEET; router stop+rm 11 in ~2min, host 62% free, no panic). Fix: DB writes via temp-SQL-file `sqlite3 db < file.sql` or bun:sqlite bound-params (no shell); add invariant + guard note; optional host defense blocking `compose up` of non-runtime svcs. AC: a payload containing backticks/$()/quotes drains with docker ps unchanged before/after AND the DB row written correctly (anomaly absent 7 days). Pri HIGH. Route po→architect→agent-father.

- 🔄 **A-01-EXPECTED-SET (agents-architect → agent-father; sibling AC of AUD-ND-1)** — system-auditor A-01 container-check compares live `docker ps` against the FULL compose definition (12 svcs) → false CRITICAL "fleet outage" (retracted row TIER1-…-SERVICES-DOWN 94237862; 2nd auditor false-positive in 2 ticks). Define an intended-runtime-set SSOT (e.g. `docs/data/system-map.json` active-services) and have A-01 check THAT set; defined-but-not-in-runtime = INFO, never CRITICAL. AC: on minimal-stack host, A-01 emits 0 CRITICAL for not-deployed dev-zone svcs for 7 days. Pri MEDIUM. Same architect→agent-father chain — bundle with AUD-ND-1.

- 🔄 **AUDITOR-SLA-CADENCE (agents-architect → agent-father; same wrong-baseline family as A-01-EXPECTED-SET)** — system-auditor `data_stale` checks apply ONE per-minute SLA against sources of wildly different cadence → Tier-2 flagged BCTC "stale 75h" CRITICAL, but BCTC = quarterly filings (normal end-May, market closed). Make data_stale cadence-aware: per-source SLA SSOT (quarterly model for BCTC; gate price/FX/foreign-flow staleness on market-open status). AC: on a weekend/quarterly-gap window, data_stale emits 0 CRITICAL for sources within their own cadence for 7 days; per-source SLA defined in SSOT (e.g. system-map.json). Pri LOW. PLAN-ONLY, NEXT po→architect→agent-father cycle. Bundle with A-01-EXPECTED-SET. Trigger: repair_task_request 2026-06-01 (2d25b663). Source report id 3019-family.

- 🔄 **VPS-SOCAT-PERSIST (architect → ops, MEDIUM, PLAN-ONLY)** — 2026-06-01 repair_task_request (signal processed/…vps_socat_persist). The 65h VPS /api 502 outage was acutely recovered by ops (06e0b5da) via a MANUAL, UNSUPERVISED `socat :4000→127.0.0.1:3000` bridge (PID 1551). Root cause: CF tunnel (token-mode, on Mac) routes /api/*→localhost:4000 (api-gateway, NEVER deployed here)→502, killing every VPS fetch callback. socat has no launchd plist → a Mac reboot drops it → reopens the multi-day outage SILENTLY. Also read-path still returns `source_tier:2` (full tier-1 restoration unconfirmed). Router raw-verified the recovery + both caveats (06e0b5da context). **Architect decides** durable option: (a) repoint CF tunnel ingress /api/*→http://localhost:3000 directly (removes socat) — cross-refs project_telegram_webhook_cloudflare_routing (repo nginx.conf/config.yml inert in token-mode); OR (b) wrap socat in a launchd KeepAlive plist + document in repo. Then ops re-verifies get_market_snapshot/get_foreign_flow and confirms tier-2-normal vs tier-1-expected semantics. AC: after a simulated reboot (or `kill` of socat PID) VPS /api/* still returns 200 + fresh data with ZERO manual intervention; source_tier semantics documented. DASHBOARD: flip B-01/B-02/B-03/B-06 CRITICAL→RECOVERED-FRAGILE (ref 06e0b5da + this entry). NOTE: NOT acute (data flowing now) — schedulable; do NOT trigger any `compose up` of the never-deployed api-gateway. Pri MEDIUM. Route po→architect→ops.

---

# Sprint VPS-DEPLOY-PLACEHOLDER-GUARD — Make VPS fetch-script deploys placeholder-safe (no more silent unrendered-template outages)

**STATUS 2026-06-01T11:09Z — OPEN (PO self-initiated, triaged from dev-team :07 tick follow-up). Priority: HIGH.** Zone: `dev-vps-crawls` (owns `vps-scripts/`) + cross-service deploy script `scripts/deploy-vps-proxy.sh` + ops (VPS-side render/install). WIP≤2 (0/2 at open). Brief → architect.

## Root cause (PO raw-verified this session — NOT relaying ops badge)
~1h silent news-push outage 2026-06-01 ~09:07–10:09Z: ALL 14 VN news feeds fetched but pushed to literal hostname `__MCP_BASE__` → `http=000` → nothing landed in mcp-server DB. ops stopped the bleeding (53c3d888: rendered creds from `/root/vn-market.env.bak`, raw http=200 received=242, cursor advanced). DURABLE problem remains.

Raw-read confirms the mechanism is a **deploy-process gap, not a one-off**:
- `vps-scripts/fetch-vn-news.sh` L7-8 **hardcode** `API_URL="__MCP_BASE__/api/push-news"` / `API_KEY="__API_KEY__"` — NO env fallback. If a deploy ships the raw template without the render step, the script breaks HARD (curl to literal `__MCP_BASE__`).
- The canonical deployer `scripts/deploy-vps-proxy.sh` **DOES render correctly** (L108-110 `sed -e "s|__MCP_BASE__|…" -e "s|__API_KEY__|…" vps-scripts/fetch-vn-news.sh > $TMP_NEWS` then scp). So the render step EXISTS — the cafef sprint (814088b0) deployed `fetch-vn-news.sh` (+ new `article-body-fetcher.py`) via a path that BYPASSED this renderer, clobbering the live rendered `/root/` script with the raw template. Nothing enforced the render; nothing rejected the placeholder leak.
- **Blast radius is wider than filed:** 6 scripts use the dangerous hardcode-no-fallback form (`fetch-vn-news.sh`, `fetch-gso.sh`, `fetch-sbv.sh`, `fetch-tradingeconomics.sh`, `enrich-bctc-urls.sh`, `fetch-prices.sh`). 9 use the safe `${VAR:-__MCP_BASE__/...}` env-fallback form (incl `fetch-foreign-flow.sh` L32-34) which degrades gracefully if render is skipped. `deploy-vps-proxy.sh` also does NOT deploy `article-body-fetcher.py` at all → confirms the cafef deploy went around the canonical path.

## Vision
One sentence: **A VPS fetch-script can never again silently outage by shipping an unrendered `__PLACEHOLDER__` — enforced by (b) a pre-deploy/post-deploy leak guard that rejects any deployed artifact still containing `__[A-Z_]+__`, AND (c) converting the 6 hardcode-form scripts to the `${VAR:-default}` env-fallback form so an un-rendered deploy degrades to env vars instead of hitting a literal hostname, AND (a) ensuring every deploy of these scripts routes through `scripts/deploy-vps-proxy.sh`'s render step (or an equivalent enforced render) — with `article-body-fetcher.py` + `beautifulsoup4` brought under the same deployer so future cafef-style sprints can't bypass it.**

## Scope (architect refines a/b/c boundary + ownership)
- **PLACEHOLDER-GUARD-1 (guard, b)** — leak guard: any artifact about to land (or just landed) on `/root/` containing `__[A-Z_]+__` is REJECTED (deploy fails loud) / flagged. Belongs in `scripts/deploy-vps-proxy.sh` (pre-scp assert on rendered TMP) + ideally a post-deploy SSH verify (`grep -l '__[A-Z_]\+__' /root/fetch-*.sh` must be empty). Cross-service zone.
- **PLACEHOLDER-GUARD-2 (env-fallback, c)** — convert the 6 hardcode-form scripts to `${VAR:-__MCP_BASE__/...}` form (mirror `fetch-foreign-flow.sh`). dev-vps-crawls zone. Lower blast radius even if render is skipped. (architect: decide whether all 6 in one slice or just the news-push-critical ones first.)
- **PLACEHOLDER-GUARD-3 (deploy coverage, a)** — bring `article-body-fetcher.py` (and `pip3 install beautifulsoup4` — see VPS-BS4-INSTALL below) under `scripts/deploy-vps-proxy.sh` so the cafef artifacts deploy via the rendered/enforced path, not ad-hoc scp. Closes the bypass that caused this. Cross-service + ops.
- **VPS-BS4-INSTALL (bundled, LOW)** — `beautifulsoup4` not installed on VPS (raw: `pip3 show beautifulsoup4` → not found) → `/root/article-body-fetcher.py` silently runs regex fallback (5000-char cap) not bs4 primary (8000-char cap). Fix: `pip3 install beautifulsoup4` (no service restart — per-request invocation). Bundle the *install* into GUARD-3's deploy-coverage (so the deployer owns the dep) + ops runs the immediate one-off pip install to restore extraction quality now. ops zone.

## AC (architect/QA refine)
- A deploy run with an UNRENDERED template (inject a fixture still holding `__MCP_BASE__`) FAILS LOUD before/at the scp step — proven by a deliberate-violation test, not a green badge.
- Post-deploy SSH probe `grep -l '__[A-Z_]\+__' /root/fetch-*.sh /root/article-body-fetcher.py` returns EMPTY.
- The 6 converted scripts: with env UNSET, the script falls back to a documented default form (no literal `__MCP_BASE__` reaches curl) — or fails loud — never silently http=000.
- `pip3 show beautifulsoup4` on VPS returns a version; `/proxy/article-body` uses the 8000-char bs4 path (spot-verify one article body length > 5000 where applicable).
- 14 news feeds land (received>0, cursor advances) for ≥2 cycles after a full redeploy via the enforced path.

## Constraints
PLAN-ONLY for anything touching the 16GB host / Docker (no stop/kill/rm/restart). VPS-side script + pip changes route through dev-vps-crawls + ops via the SSH lane (gateway-independent) — main terminal does not touch the VPS. All work on `main`.

---

# Sprint VPS-NEWS-CAFEF-VNECO — Route cafef.vn + vneconomy.vn Vietnamese info fetching through the Vinahost VPS (recon-first) [CLOSED ✅ 2026-06-01]

**STATUS 2026-06-01T08:43Z — OPEN (PO self-initiated from operator feature request). Priority: MEDIUM.** Zone: VPS-crawler lane → recon `ops-vps-fetch` (`docs/vps-sources/`), impl `dev-vps-crawls` (`docs/vps-crawl-techniques/` + VPS scripts) and/or `apps/mcp-server/` (fetcher rewire to VPS proxy). WIP≤2. Brief → architect (TBD after recon).

## CRITICAL SCOPE CORRECTION (PO raw-source verified — NOT a greenfield "add new source")
The operator asked to "add cafef.vn and vneconomy.vn to fetch Vietnamese info pages on the VPS." Raw-source verification BEFORE planning revealed both sources ALREADY exist in the codebase — this is a ROUTING / COVERAGE sprint, not a new-integration one:
- **`apps/mcp-server/src/infrastructure/fetchers/cafef.ts`** — fetches `https://cafef.vn/thi-truong-chung-khoan.rss` DIRECT via axios (browser-UA), wired into `fetch_and_analyze` (`news-analysis/analysis.ts:177`), tested (`021-rss-cafef.test.ts`). RSS = headline + summary/`description` (+ optional `content:encoded`), NOT full article body pages.
- **`apps/mcp-server/src/infrastructure/fetchers/vneconomy.ts`** — fetches `vneconomy.vn/chung-khoan.rss` + `/tai-chinh.rss` DIRECT via axios, wired at `analysis.ts:214`.
- **A separate VPS news pipeline ALREADY covers both** — source `news-vps` `/proxy/news` in `docs/data/system-map.json`, VPS-side `fetch-vn-news.sh` (NOT in repo, lives on VPS) pushed 14 RSS feeds incl cafef-market/cafef-biz + vneconomy-stocks/-finance → `/api/push-news` (body `{title,url,publishedAt,content,source}`). Recon `docs/vps-sources/vn-news-rss/recon.md` (2026-05-13) confirmed BOTH return 200 with no anti-bot from the VPS. `cafef-index` (`banggia.cafef.vn`) is a separate ACTIVE price source via VPS (`docs/vps-sources/cafef-index/recon.md`).

So the codebase has TWO parallel paths for cafef/vneconomy news: (a) DIRECT axios from the France-based mcp-server host (geo-block-exposed; CafeF sits behind Cloudflare RP and could activate a managed challenge that breaks the direct path first — recon note line 80), and (b) VPS proxy (geo-safe). Per project policy ALL geo-blocked VN sources route through the Vinahost VPS (`project_bctc_vps_proxy`, `reference_vps_setup`).

## Vision
One sentence: **cafef.vn + vneconomy.vn Vietnamese market-news fetching is served reliably through the Vinahost VPS (geo-safe, anti-bot-resilient) into the existing news ingestion path — not via the France-based host's direct axios fetch that the geo-block / Cloudflare-challenge risk exposes — with the minimum-viable first slice being the news article list (headline + body/summary text) feeding the existing news-scout consumer, and the open question of FULL article-body "info pages" (beyond RSS summary) explicitly answered by recon before any dev build.**

## Mandatory sequencing — RECON FIRST (non-negotiable, gateway-independent SSH lane)
Per the VPS-crawler discipline (`docs/agents/ops-vps-fetch/`, `docs/agents/dev-vps-crawls/`): **`ops-vps-fetch` recon runs FIRST** and blocks all dev work. The 2026-05-13 recon exists but is 19 days stale AND predates the operator's "info pages" (full article body) framing. Recon must answer, with LIVE HTTP probes ON THE VPS (SSH lane — works even if the spawned-agent MCP gateway wedge is active):
1. Is the existing DIRECT axios path (cafef.ts/vneconomy.ts from the host) actually geo-failing / Cloudflare-challenged TODAY, or working? (Determines whether a VPS rewire is even needed for the RSS slice, or only a resilience upgrade.)
2. Does the VPS `fetch-vn-news.sh` / `/proxy/news` pipeline ALREADY serve cafef + vneconomy items end-to-end into `/api/push-news` right now (is the push 200, are items landing)? (Determines overlap — we must NOT rebuild an existing working pipeline.)
3. The "info pages" question: does the operator's intent require FULL article BODY text (the article page, not the RSS summary)? Recon documents cafef.vn + vneconomy.vn ARTICLE PAGE structure (HTML body selectors, pagination, any JSON endpoints), anti-bot challenges on the article pages (vs the RSS feed), and a working HTTP-only request recipe (requests/httpx/curl_cffi/cloudscraper — NO Chromium/Playwright on the VPS).
4. Output: refreshed `docs/vps-sources/cafef-news/recon.md` + `docs/vps-sources/vneconomy-news/recon.md` (or update `vn-news-rss/recon.md`) with the working recipe + the overlap verdict + a clear MINIMUM-VIABLE recommendation (RSS-via-VPS resilience-rewire vs full-article-body scrape). Do NOT let dev build against an unverified article-page source.

## Overlap check (PO — fold-or-distinct decision deferred to architect post-recon)
Open backlog **SSC-IBOARD-MIGRATE** (dev-vps-crawls, replacement-source recon for the globally-dead `iboard-query.ssc.vn` PRICE source) is DISTINCT — that is a price/financial-data source for a dead domain; this is news article content for two LIVE sources. Do NOT fold. Both are dev-vps-crawls zone so the router serializes them under WIP≤2.

## Scope
IN:
- **CAFEF-VNECO-RECON (ops-vps-fetch) — runs FIRST, blocks dev.** The 3-question live-VPS probe + refreshed recon doc(s) + minimum-viable recommendation above. SSH lane, gateway-independent.
- **(post-recon, GATED) architect brief** — name the integration point (existing `news-vps` VPS pipeline vs rewiring cafef.ts/vneconomy.ts to call the VPS proxy vs a new article-body scrape), the minimum-viable first slice, and whether the FULL-article-body request is in-scope-now or deferred. Decide fold-vs-distinct with the recon overlap verdict.
- **(post-architect, GATED) ba spec → pm task → dev-vps-crawls impl → qa.** dev-vps-crawls (HTTP-only) implements the VPS-side scraper/recipe; if the mcp-server fetcher must be rewired to the VPS proxy that subtask is `apps/mcp-server/` zone (dev-mcp-server) — architect names the zone explicitly.

OUT:
- Any Chromium/Playwright/headless-browser on the VPS (HTTP-only lane: requests/httpx/curl_cffi/cloudscraper).
- The `cafef-index` price source (`banggia.cafef.vn`) — already active, untouched.
- SSC-IBOARD-MIGRATE (distinct dead-PRICE-source recon).
- Rebuilding the existing working VPS news pipeline if recon proves cafef/vneconomy already land via `/proxy/news` (in that case the sprint collapses to a resilience-confirm + doc-refresh).
- New MCP tools / new tables unless the architect's chosen integration strictly needs them.

## Success Metric
1. Refreshed recon doc(s) under `docs/vps-sources/` answer all 3 questions with LIVE-VPS evidence (status codes, anti-bot verdict, article-page structure, working HTTP-only recipe) + an explicit minimum-viable recommendation.
2. cafef.vn + vneconomy.vn Vietnamese news content reaches the existing news ingestion path THROUGH THE VPS (geo-safe), proven by a live push/fetch with items landing — NOT via the France-host direct axios path (unless recon proves direct is fine and a VPS rewire is unnecessary, in which case the sprint EXITS at recon with that documented verdict).
3. No duplicate/parallel pipeline created if one already works — overlap resolved in the architect brief.
4. If full-article-body "info pages" are in scope, the dev scraper extracts real article body text (≥ a documented char threshold) for both sources, proven live; otherwise the deferral is documented.

## Constraints (non-negotiable)
- RECON FIRST — no dev build against an unverified source (`ops-vps-fetch` SSH lane is gateway-independent).
- WIP≤2 · main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated notebook/handoff/signal changes) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names.
- VPS scrapers HTTP-only (NO headless browser); all geo-blocked VN sources route through the Vinahost VPS.
- ops REBUILDs mcp-server if cafef.ts/vneconomy.ts are rewired (`build --no-cache` + force-recreate, never restart-stale); QA verifies items land RAW (not a badge, `feedback_router_verify_raw_not_badges`).
- All sprint artifacts + agent-to-agent comms in ENGLISH (the fetched VN news CONTENT stays Vietnamese — that is product data, not comms).

---

# Sprint TOOL-SURFACE-HYGIENE — Clean the vn-market MCP tool surface (no live-but-fake oracles, no silent dup writers, no stale tool count)

**STATUS 2026-05-31T10:08Z — OPEN (PO self-initiated, operator-approved 2026-05-31). Priority: MEDIUM (one confirmed defect #1 ships first; rest are diff-before-merge).** Zone: `apps/mcp-server/` (dev-mcp-server) for #1-deregister/#2/#3/#4/#6; possibly kinh-dich-service zone if architect picks "wire" for #1. NOT BCTC. Brief → architect (TBD). Source-verified by PO (raw, not relayed): live registration count = **154** (`grep -ro 'server.tool(' apps/mcp-server/src/interface/mcp/tools/ | wc -l`), corroborated by HC-EXIT container probe `toolCount=154`.

## Vision
One sentence: **Every registered vn-market MCP tool is either truly wired or absent — no live-but-501 oracle, no silent duplicate writers, no stale tool count — so agents can trust the surface they call.**

## Scope
IN:
- **#1 (CONFIRMED — ship FIRST, the only confirmed defect):** `get_market_hexagram` returns runtime 501 "Not implemented - pending B-bucket primitive wiring". Architect decides: (a) wire the downstream endpoint, OR (b) deregister the mcp tool. Default lean (router): deregister unless wiring is cheap — a live-but-fake oracle is the prior CHEF-confabulation footgun (`feedback_chef_kinhdich_confab`). **Scope is THIS ONE tool only**; the other 5 kinhdich tools are wired (they arg-validate, not 501) — do NOT touch them.
- **#2 (SUSPECTED — diff before any merge):** `mark_alert_outcome` (`alerts/alertAccuracy.ts:495`) vs `write_alert_verdict` (`alerts/alertVerdictTools.ts:108`) — both appear to WRITE an alert result. Architect diffs both handlers + DB targets; merge ONLY if truly duplicate, else document the distinction in descriptions.
- **#3 (SUSPECTED — diff before any merge):** macro accuracy trio `get_calibration_report` / `get_label_accuracy_report` / `get_prediction_accuracy` (`macro/`) — diff outputs; consolidate or clarify.
- **#4 (SUSPECTED — diff before any merge):** `get_patterns` vs `get_technical_indicators` (`market-data/`) — diff; clarify or merge.
- **#5 (OPTIONAL / LOW):** 5× `trigger_*_vps_fetch` (bctc/foreign_flow/news/price/sbv, `system/`) → optional single `trigger_vps_fetch(source)`. Thin harmless debug-triggers; do ONLY if architect deems the churn worthwhile.
- **#6 (STAT RECONCILE):** `docs/data/project-stats.json` `toolCount` + `infrastructureStatus.toolCount` 146 → live 154 (PO-verified). system-auditor/PM owns the field; reconcile as the LAST step after #1-#5 churn settles so the final number is accurate.

OUT:
- **Any BCTC / financial-reports tool** — recurring-bug zone, NOT touched this sprint (no conflict: this sprint is not BCTC).
- The 3 EXPLICITLY-CLEARED pairs (probed distinct, KEEP BOTH, do NOT touch): `get_vps_proxy_health` vs `get_vps_service_health`; `get_cron_health` vs `get_pipeline_health`; `get_positions` vs `get_user_positions_for_analysis` (intentional VN-display vs eng-analysis split per language-boundary).
- The other 5 kinhdich tools (wired). No new tools, no behavior changes beyond the 6 items.

## Critical context for the Architect (PO raw-source verification — NOT relayed from the router, per router-verify-raw)
- **The 501 is NOT a mcp-server stub.** `kinhdich/kinhDichTools.ts:510` correctly delegates to `getMarketHexagram()` → `infrastructure/microservices/clients.ts:505` → `GET {kinhDich}/market` on **kinh-dich-service (port 5005)**. The mcp handler surfaces the downstream error honestly. The "pending B-bucket primitive wiring" 501 is emitted by the **kinh-dich-service**, not by mcp-server. Therefore:
  - "Wire it" (#1a) = **kinh-dich-service zone** (different dev owner). "Deregister tool" (#1b) = **`apps/mcp-server/` zone** (dev-mcp-server). The architect MUST name the zone explicitly in the brief, and the resulting task's `zone:` must match.
- **NO double-registration.** `get_market_hexagram` is registered exactly once (`kinhDichTools.ts:510`). `marketTools.ts:64` is the private helper `appendMarketHexagram`, NOT a tool registration — the marketTools registrations are `get_market_snapshot` + `get_patterns` (lines 124/328). (PO flagged a possible dup, then cleared it by reading raw source.)
- **Live registration count = 154** — matches the router probe and the HC-EXIT container `toolCount=154`. The stale `146` is dated 2026-05-20.

## Success Metric
1. **#1:** `get_market_hexagram` is no longer reachable as a live-but-501 oracle — it either returns a real reading OR is absent from the registry (architect's chosen path), verified by QA via the gateway wrapper in-container (raw response, not a badge).
2. **#2/#3/#4:** each pair/trio has a WRITTEN source diff in the brief; true duplicates merged with no caller breakage; non-duplicates disambiguated in their tool descriptions. NO blind merge.
3. **#6:** `toolCount` + `infrastructureStatus.toolCount` reflect the live registration count AFTER this sprint's churn settles.
4. No BCTC tool touched; none of the 3 cleared pairs touched; the other 5 kinhdich tools untouched.
5. mcp-server container REBUILT (`build --no-cache` + force-recreate, never restart-stale) after any dev change (`feedback_rebuild_after_dev_change`); QA verifies the surface in-container.

## Constraints (non-negotiable)
- WIP / sequencing: **#1 ships FIRST** (only confirmed defect). #2/#3/#4 each gate on a written source diff BEFORE merge. #5 optional (architect's discretion). #6 reconciled LAST.
- main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated HCM/handoff/notebook changes) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names.
- ops REBUILDs mcp-server after dev changes (`build --no-cache` + force-recreate, never restart-stale); QA verifies the live tool surface in-container, raw responses not badges (`feedback_router_verify_raw_not_badges`).
- Every removal/merge proven safe: a deregistered tool absent from the gateway list; a merged tool's callers (cron jobs, other tools) re-pointed and tested — "exit 0" is NOT acceptance (`feedback_fence_false_green`).
- All sprint artifacts + agent-to-agent comms in ENGLISH (Vietnamese ONLY for FB posts + MARKET Telegram group). Any kinhdich user-facing Vietnamese strings preserved if #1a is chosen.

---

# Sprint ENV-ISOLATION — Fleet-wide test/prod data isolation via single-stack dev override + physical datastore boundaries

**STATUS 2026-05-31T11:30Z — ENV-ISOLATION-P1 ✅ SIGNED OFF (PO, EI-P1-EXIT). P2 🟢 GATE RELEASED (FU-TRUST-REFRESH FU-4 data-trust SATISFIED at FU-EXIT 11:30Z — see below). P2 now schedulable.**

**Gate release (PO, OD-C/OD-F):** OD-C required P2 schema to wait until FU-TRUST-REFRESH "completes its genuine re-refine of FPT+ACB" so the first real `bctc_refined_units`/`bctc_table_rows` write since the purge stamps `data_env='production'` on clean rows. That re-refine HAPPENED: FU-1 wired the OCR seam, FPT+ACB were genuinely re-refined with REAL scalars (FPT fully serving; ACB scalars correct + balanced — both raw-verified). FU-4's data-trust intent is MET. The residual ACB `get_bctc_full` SERVING block is a consumer-layer bank-awareness theme (split to BANK-AWARE-BCTC) that does NOT touch the schema or the refine write-path P2 depends on — so it does NOT extend the P2 gate. **P2 may proceed**; it should still land AFTER the ACB clean rows exist (they do). NOTE: P2's EI-P2-2 (`data_env` ×5 tables) will rebuild mcp-server; sequence it so it does NOT collide with BANK-AWARE-BCTC's BANK-OPS rebuild — both are `apps/mcp-server/` zone (router serializes the two mcp-server rebuilds).

**(prior status line:) ENV-ISOLATION-P1 ✅ SIGNED OFF (PO, EI-P1-EXIT).** P1 commits 9eab754f (EI-P1-1) · 89e9b5b8 (EI-P1-2) · 0c9bed2a (EI-P1-3); QA cycle-164 APPROVED (`reports/TASK_REPORT_EI-P1.md`). **PO critique-before-approve on RAW source, not the QA badge (`feedback_router_verify_raw_not_badges`):** rendered `docker compose config` shows exactly 9 `APP_ENV: production` on the DB-using services (mcp-server/pdf-extractor/rag-service/technical-analysis/macro-indicators/kinh-dich-service/news-fetch/stock-price/alert-engine), `COORDINATION_DB_PATH: /app/data/coordination.db` on mcp-server, and APP_ENV correctly ABSENT on api-gateway/frontend/flaresolverr; both maintenance scripts carry real guard logic in source (resolved DB path printed before any write + `--force-dev`, with RED-before-GREEN REFUSED stdout captured in the QA report); `docs/protocols/dev-environment.md` (241L) covers start/seed/promote(FK parent-before-child §4.1)/LanceDB/restore/RISK-5 volume-backup warning. Zero regression (HCM-DISAMBIG 0-diff, PEK subtree pristine); all 3 commits scoped per-file on main. **Two NON-BLOCKING pre-existing items (NOT introduced by P1) recorded as ungated backlog `FU-EI-COMPOSE`:** (1) alert-engine missing `DB_PATH=/app/data/market.db` in compose (brief §2.1); (2) `scripts/run-bt7-backfill.ts` ~L20 hardcoded absolute import path. Routed to a SEPARATE backlog item rather than folded into P2 because neither touches schema nor the refine path — so they need not inherit P2's FU-4 gate (consistent with the OD-F rationale that split P1 out precisely to land low-risk ops/scripts work without waiting on the re-refine). SPLIT into two sub-sprints (OD-F). Brief `docs/architecture-briefs/2026-05-31-fleet-env-isolation-architecture.md` (6e8f3d23); predecessor `docs/architecture-briefs/2026-05-31-test-prod-data-isolation.md` (192f6c56). Model: **Single-Stack Dev Override with Physical Datastore Boundaries** (one compose project, `APP_ENV` selector defaulting to `production`, `.dev`-suffixed DB files in the same `market_data` volume, dev mcp-server on port 3099 so the VPS/gateway — both hardwired to port 3000 — are structurally invisible to dev). Zone: multi (ops + `apps/mcp-server/` + `scripts/` cross-service + dev-rag-service compose).

## Why this sprint
The BCTC-TRUST-RED incident (FPT/ACB digit-run fabrication reaching `market.db` + the analyst feed) exposed that the fleet has NO environment dimension: a gateway tool call made during a dev dry-run lands in the exact same DB as production cron output. TRUST-RED shipped the SEMANTIC defense (DT-1/DT-2/DT-3 reject fabricated content). This sprint adds the STRUCTURAL complement — even a write that bypasses the semantic gate (e.g. a legitimate tool carrying non-prod data) lands in the right DB file. The two compose: a row must pass BOTH the semantic gate AND land in the correct physical file. Hard constraint honored: 16GB Mac / Docker 8GB cap means NO full second stack fits — the design replaces prod with dev (sequential), never runs two stacks. SQLite+LanceDB stay local, NO cloud. Default `APP_ENV=production` ⇒ this is a no-op until a dev explicitly opts out.

## Vision
One sentence: **A developer can opt into a dev environment (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up`) where every write lands in `.dev`-suffixed datastores inside the same volume and the mcp-server refuses to start if its `APP_ENV` and `DB_PATH` disagree — while production runs byte-for-byte unchanged because `APP_ENV` defaults to `production` everywhere.**

## Operator-decision adjudication (PO, full autonomy — rationale binding)
- **OD-A — same volume `.dev` suffixes vs separate dev volume → SAME VOLUME (rec. ADOPTED).** Single-user host; the physical filename boundary (`market.db` vs `market.dev.db`) is the real guard, not the volume name. A separate volume adds provisioning + a second `docker volume rm` for cleanup and buys nothing the filename boundary doesn't already give. The `docker volume rm market_data` deletes-both hazard (RISK-5) is mitigated by an SOP backup warning, not by volume splitting. Pure ops decision, zero code impact.
- **OD-B — data_env on 5 tables vs BCTC-only 2 → 5 TABLES (rec. ADOPTED).** `bctc_refined_units`, `bctc_table_rows`, `news_analysis`, `macro_evidence`, `agent_signals`. All five are agent-synthesized (W-2) write targets; `agent_signals` directly feeds MARKET dishes and `news_analysis`/`macro_evidence` feed the intelligence cycle — the same fabrication class as the BCTC tables, just not yet the *proven* one. The column is `TEXT NOT NULL DEFAULT 'production'` (additive, no ALTER risk, existing rows correctly retain 'production'); the marginal migration surface of 3 extra columns is trivial and the forensic coverage is materially better. It is an AUDIT stamp only — NO read-path filter, so zero filter-drift risk.
- **OD-C — confirm timing (P1 now, P2 schema AFTER FU-TRUST-REFRESH) → CONFIRMED.** Phase 1 (compose env tagging, ops-only, zero code/schema) ships immediately. Phase 2 (startup assertion + `data_env` schema) MUST wait until FU-TRUST-REFRESH completes its genuine re-refine of FPT+ACB (currently FU-2 NEXT, then FU-3/FU-4). Reason: the re-refine is the first real `bctc_refined_units`/`bctc_table_rows` write since the purge — it should be the first run that stamps `data_env='production'` on clean rows with the column live. (Both orderings are technically correct via the DEFAULT, but a full cycle with the stamp active is the honest one.) **ENV-ISOLATION P2 MUST NOT jump ahead of FU-TRUST-REFRESH** — this is a hard gate.
- **OD-D — automated promotion script vs manual SOP → MANUAL SOP for this sprint; script DEFERRED.** For a single-user system the promotion path is exercised rarely (only when a dev refine produces data worth keeping). A documented `sqlite3`/`bun` SOP in `docs/protocols/dev-environment.md` (with the mandatory FK parent-before-child order: `financial_reports` row in prod BEFORE `bctc_table_rows` children) is sufficient initially and avoids shipping a bespoke script before the dev workflow has been exercised even once. If repeated manual promotion proves error-prone, register a follow-up to scope `scripts/promote-bctc-to-prod.ts` to `bctc_refined_units`+`bctc_table_rows` only. (Likewise `seed-dev-db.ts` Phase 4b → manual `.dump | sqlite3` SOP this sprint.)
- **OD-E — partial-stack dev variant (mcp-server+pdf-extractor alongside prod) → DEFER (rec. ADOPTED).** It needs Cloudflare/port re-routing to make the production stack call the dev pdf-extractor — genuinely complex and unproven. The full-replace (stop prod → up dev → test → restore prod) model is the initial sprint's workflow. Revisit only if production-downtime windows prove too costly for BCTC dev work. NOT designed now.
- **OD-F — one sprint vs split → SPLIT (rec. ADOPTED).** **ENV-ISOLATION-P1** (Phase 1 compose tagging + the maintenance-script guards from Phase 3b/3c + dev-environment.md SOP) ships NOW — none of it touches schema or the refine path, all of it is structural-prep with zero coupling to FU-TRUST-REFRESH. **ENV-ISOLATION-P2** (startup assertion + `data_env` schema + ENV-GUARD-1 test + `docker-compose.dev.yml`) is GATED behind FU-TRUST-REFRESH. Splitting lets the low-risk ops/scripts work land immediately without waiting on the re-refine, and keeps the schema change as the first thing the re-refine exercises.

## Sub-sprint shape (baked from the OD rulings)

**ENV-ISOLATION-P1 (ships NOW — no FU-TRUST-REFRESH dependency):**
- **EI-P1-1 (ops)** — Add `APP_ENV: production` explicitly to EVERY DB-using service's `environment` block in `docker-compose.yml` (mcp-server, technical-analysis, macro-indicators, kinh-dich-service, news-fetch, stock-price, alert-engine, pdf-extractor, rag-service). Add `COORDINATION_DB_PATH: /app/data/coordination.db` explicitly to mcp-server (currently derived; making it explicit prevents a dev-override accident). Both changes additive + backward-compatible + zero-behavior-change. Rolling `docker compose up -d`. **Acceptance: `docker compose exec mcp-server env | grep APP_ENV` → `APP_ENV=production`; all services healthy; zero behavioral change.** (api-gateway/frontend/flaresolverr have no DB → no APP_ENV needed.)
- **EI-P1-2 (developer, cross-service zone `scripts/`)** — Harden the two host-side maintenance scripts. `scripts/run-bt7-backfill.ts`: replace the hardcoded absolute path (`apps/mcp-server/data/market.db` w/ `readwrite:true`) with `process.env.DB_PATH ?? resolve(PROJECT_ROOT, "data", "market.db")` + require a `--force-dev` flag if `DB_PATH` does not contain `market.db`. `scripts/purge-phantom-reports.ts`: add an `APP_ENV` check — refuse unless `APP_ENV === 'production'` OR `--force-dev` is passed. BOTH must print the resolved DB path to stdout before any write (fail-loud, `docs/protocols/fail-loud-protocol.md`). **Acceptance: a deliberate test/run proving each script refuses (or warns + requires the flag) when pointed at a non-prod path; resolved path printed before any write.**
- **EI-P1-3 (developer or ops, `docs/`)** — Write `docs/protocols/dev-environment.md`: the dev-session SOP (stop prod → up dev override → seed → test at port 3099 → restore prod), the manual seed recipe (`.dump financial_reports + pdf_extracted_text | sqlite3 market.dev.db`), the manual BCTC promotion recipe (FK parent-before-child order, transaction-wrapped), the LanceDB `lancedb.dev` seeding note, and PROMINENT RISK-5 warning (`docker volume rm market_data` deletes prod+dev — back up `market.db` first). **Acceptance: SOP covers all of: start, seed, promote (manual, with FK order), LanceDB, restore, and the volume-deletion backup warning.**

**ENV-ISOLATION-P2 (🟢 GATE RELEASED 2026-05-31T11:30Z — FU-TRUST-REFRESH FU-4 data-trust satisfied at FU-EXIT; P2 now schedulable):**
- **EI-P2-1 (dev-mcp-server, `apps/mcp-server/`)** — Startup assertion in `apps/mcp-server/src/index.ts`: log `[startup] APP_ENV=${APP_ENV} DB_PATH=${DB_PATH} LANCEDB_PATH=${LANCEDB_PATH}`; if `APP_ENV=production` and `DB_PATH` ends `.dev.db` → WARN telegram(WORK) + refuse to start; symmetrically if `APP_ENV=dev` and `DB_PATH` ends `market.db` → same; `APP_ENV=test` is explicitly exempt (skips the check). Add `Bun.env["APP_ENV"]="test"` to `apps/mcp-server/src/__tests__/setup.ts` preload (one line, additive — preserves the `:memory:` pattern untouched). **Acceptance: ENV-GUARD-1 — a deliberate-violation test (prod APP_ENV + .dev.db path) proves refuse-to-start; the test-mode-exempt path proves tests still run; the `:memory:` isolation suite is unaffected.**
- **EI-P2-2 (dev-mcp-server, `apps/mcp-server/`)** — Add `data_env TEXT NOT NULL DEFAULT 'production'` to the OD-B five tables (`bctc_refined_units`, `bctc_table_rows`, `news_analysis`, `macro_evidence`, `agent_signals`). Stamp `data_env = Bun.env["APP_ENV"] ?? 'production'` on every INSERT into those tables. AUDIT column only — NO read-path filter, NO `WHERE data_env=` anywhere. **Acceptance: a test (`APP_ENV=test` preload) proves a `push_bctc_refined_unit` INSERT stamps `data_env='test'` (queried via the `:memory:` DB), and an `agent_signals` INSERT likewise; existing rows verified DEFAULT 'production'.** ops rebuilds mcp-server (`build --no-cache` + force-recreate, never restart-stale) after this lands; startup log visible in-container.
- **EI-P2-3 (ops + dev-rag-service compose only)** — Create `docker-compose.dev.yml` (new file, per brief §7.2): `APP_ENV=dev` + `.dev`-suffixed `DB_PATH`/`COORDINATION_DB_PATH`/`STOCK_PRICE_DB_PATH`/`ALERT_ENGINE_DB_PATH`/`MARKET_DB_PATH`/`LANCEDB_PATH=/app/data/lancedb.dev` on every DB-using service, and mcp-server `ports: "3099:3000"`. dev-rag-service confirms rag-service already reads `LANCEDB_PATH` from env (`apps/rag-service/infrastructure/config.py`) — NO rag-service code change, the compose override suffices. **Acceptance: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` → mcp-server log shows `APP_ENV=dev DB_PATH=/app/data/market.dev.db`; prod `market.db` untouched; rag-service writes `lancedb.dev`.**
- **EI-P2-QA (qa) — ENV-GUARD-1 sweep** — Run the full mcp-server suite (prove 0 regression vs parent), verify the startup-assertion deliberate-violation is RED-without/GREEN-with (fence-false-green discipline — exit-0 is NOT acceptance), verify `data_env` stamp on all 5 tables in test mode, and dry-run the dev compose override observing the `APP_ENV=dev DB_PATH=...dev.db` startup log. **Acceptance: every new guard proven by deliberate-violation; suite 0-regression; dev-override startup log observed.**

## Success Metric
- **P1:** `APP_ENV=production` visible in `docker inspect` for every DB-using container; both maintenance scripts refuse/guard a non-prod path and print the resolved path before any write; `docs/protocols/dev-environment.md` exists and covers start/seed/promote(FK-ordered)/LanceDB/restore/volume-backup-warning. Zero production behavioral change.
- **P2:** ENV-GUARD-1 deliberate-violation proves the startup assertion refuses a prod/dev DB mismatch and is test-exempt; `data_env` stamped correctly per `APP_ENV` on all 5 OD-B tables (proven in test mode, not by badge); `docker-compose.dev.yml` brings up a dev stack on port 3099 writing `.dev` datastores with prod files untouched; mcp-server suite 0-regression.
- **Gate:** 🟢 RELEASED 2026-05-31T11:30Z — FU-TRUST-REFRESH FU-4 data-trust satisfied at FU-EXIT (genuine re-refine landed real FPT+ACB scalars). EI-P2-* may proceed; serialize its mcp-server rebuild against BANK-AWARE-BCTC's BANK-OPS (both `apps/mcp-server/` zone).

## Constraints (non-negotiable)
- **Sequencing gate:** 🟢 RELEASED 2026-05-31T11:30Z (FU-TRUST-REFRESH FU-4 data-trust satisfied at FU-EXIT). ENV-ISOLATION-P2 may now start; serialize its mcp-server rebuild against BANK-AWARE-BCTC BANK-OPS. P1 already shipped.
- 16GB Mac / Docker 8GB cap: NO second simultaneous stack — dev REPLACES prod (sequential model). SQLite+LanceDB stay LOCAL, NO cloud.
- main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated HCM/handoff/notebook changes) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names.
- Additive ONLY: `APP_ENV` defaults to `production` everywhere (no-op until opt-out); `data_env` columns are `NOT NULL DEFAULT 'production'` (no ALTER risk, existing rows correct); NO read-path filter (audit-only, zero filter-drift); `:memory:` test pattern UNTOUCHED (one additive preload line).
- ops REBUILDs mcp-server after EI-P2-2 (`build --no-cache` + force-recreate, never restart-stale); verify startup log + `data_env` stamp in-container.
- Every new guard (startup assertion, script guard, ENV-GUARD-1) proven by deliberate-violation per `feedback_fence_false_green` — "exit 0" is NOT acceptance.
- All sprint artifacts + agent-to-agent comms in ENGLISH (Vietnamese ONLY for FB posts + MARKET Telegram group).

---

# Sprint BANK-AWARE-BCTC — Make EVERY BCTC consumer bank-form (B02-TCTD) aware in ONE root-caused pass

**STATUS 2026-05-31 — ✅ PO-EXIT / CLOSED (cycle BANK-AWARE-BCTC). All gates GREEN + router-raw-verified. Priority was HIGH.** Zone: `apps/mcp-server/`. Brief `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md`. Discriminator SSOT `apps/mcp-server/src/.../bctcFormType.ts` (`isBankFormFromRows`/`isBankFormFromDb`). FINAL commit 941bf552 (BANK-DEV-4 HYBRID), QA APPROVED 040409f9, live image 7f413304.

**PO-EXIT SIGN-OFF (router-raw-verify, NOT relayed badges — `feedback_router_verify_raw_not_badges`):** I opened live `get_bctc_full` via gateway myself:
- ACB (bank B02-TCTD): SERVES RAW, NO "no decomposition / forced-zero" refusal. Balance reconciles TA 1.030.900,7 = Liab 932.149,7 + Eq 98.751,1. Gross Profit absent (NULL-legal bank), Current Ratio "N/A (bank — no current assets concept)". The FU-EXIT serving block is GONE.
- FPT (corporate B01-DN): 0-REGRESSION. Gross Profit 4.244,9 (34.0%) RESTORED, Current Ratio 1.00x back, balance reconciles TA 68.586,1 = Liab 28.464,1 + Eq 40.122, conf 81%.
- Discriminator source grep-confirmed = brief design (ROMAN_SECTION anchored Roman/section regex AND `^[0-9]{3}` corporate-balance veto at L76–78). Live toolCount 154, health ok.

**Process win (both standing rules held):** recurring-bug-escalation forced architect root-cause after the 3rd touch on `bctcFormType.ts` (4 iterations: domain-keyed → "no-3-digit=bank" → "any-letter=bank" → HYBRID). router-verify-raw-not-badges caught the BANK-DEV-3 FPT regression that was INVISIBLE to the green test suite (FPT real VAS codes 411a/420a/420b/26b contain letters → architect's "corporate codes purely numeric" premise was empirically false). The DV test is now seeded with FPT's REAL codes so iteration #5 cannot regress silently.

**Follow-ups seeded (architect-flagged, do NOT block EXIT):** FU-BANK-CODECOL (label text leaking into `code` column of bctc_table_rows — markdown→rows column-alignment defect; hybrid discriminator is immune, anchored regex won't match prose, but real data-quality bug). NOT this sprint (pre-existing, unrelated): VCB refine_status=PENDING/0-rows placeholder; FPT YoY 2025-Q4 gross-margin-100% prior-period contamination (FU-TRUST-REFRESH #16 caveat); 135 pre-existing full-suite failures (macro/diacritics/carry/yield-spread).

## Why this sprint
ACB is a BANK and files form **B02-TCTD**, which does NOT use the corporate balance-sheet code scheme (100–440) or corporate-only concepts (gross_profit, the corporate decomposition guard). ACB's balance lines DO exist in `bctc_table_rows` (tagged `statement_section='general'`, with bank labels/codes) and the scalar aggregator already resolves them CORRECTLY via labels — that is why ACB's scalars + balance identity are correct and trustworthy. BUT the corporate-centric DOWNSTREAM consumers cannot find them: PUB-3 publishability scans for codes 100–440, and eval stage-6 balance extraction assumes corporate structure → ACB is blocked at `get_bctc_full` and red at eval stage-6 despite correct underlying data. Three prior point-fixes each patched ONE consumer for ONE case (and PUB-3's B-3 only fixed the corporate case). The fleet has banks beyond ACB (the watchlist spans financials) so this WILL recur per consumer per bank until enumerated and fixed in one pass.

## Vision
One sentence: **Every BCTC consumer that today assumes corporate balance-sheet structure (codes 100–440, gross_profit, the decomposition guard, eval stage-6 balance extraction, PUB-1..4, and any others the architect enumerates) is made aware of bank form B02-TCTD in a SINGLE architect-root-caused pass, so `get_bctc_full(ACB)` serves real bank data, ACB eval is not-red, and no future bank report surfaces a new corporate-only consumer one rebuild at a time.**

## Mandatory sequencing — ARCHITECT ROOT-CAUSE FIRST (recurring-bug escalation, non-negotiable)
- **BANK-ARCH (architect) — runs FIRST, blocks all dev work.** Per `feedback_recurring_bug_escalation` + `feedback_silent_swallow_serial_bugs`: NO further point-fix is permitted until the architect ENUMERATES, in one brief, EVERY consumer of `bctc_refined_units` / `bctc_table_rows` / the scalar set that assumes corporate structure or corporate-only concepts, and designs bank-aware (B02-TCTD) handling for ALL of them in one pass. The brief MUST cover at minimum: PUB-1, PUB-2, PUB-3 (codes 100–440 scan — fix bank case, not just corporate), PUB-4; the `get_bctc_full` "balance sheet has no decomposition — forced-zero pass suspected" decomposition guard; eval stage-6 balance extraction; the gross_profit-mandatory assumption (banks legitimately NULL); and any other site found by a fail-loud one-pass grep (e.g. hardcoded `'100'..'440'`, `gross_profit` non-null asserts, decomposition-presence checks). The design must key off the report's form/domain (bank vs corporate) — e.g. a `is_bank_form` / B02-TCTD discriminator the consumers branch on — NOT a per-site special-case. Explicitly state whether the discriminator already exists (statement_section / domain on financial_reports) or must be derived. **The architect must NOT let dev point-fix PUB-3-for-banks alone.**

## Scope
IN:
- **BANK-ARCH (architect):** the one-pass enumeration + bank-aware design brief above. Output: `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md` listing every corporate-assuming consumer + the single discriminator-based handling.
- **BANK-DEV (dev-mcp-server, GATED on BANK-ARCH):** implement the architect's bank-aware handling across ALL enumerated consumers in one change set. RED-before-GREEN per consumer (a deliberate-violation test proving each consumer was corporate-blind before + bank-aware after). Includes the `get_bctc_full(ACB)` decomposition guard recognizing bank balance lines, PUB-3 bank-code path, eval stage-6 bank balance extraction, gross_profit-NULL-legal for banks.
- **BANK-OPS (ops, GATED on BANK-DEV):** rebuild mcp-server (`build --no-cache` + force-recreate, never restart-stale); re-finalize/re-eval ACB (`fea19bae`) so the live container serves the new logic.
- **BANK-QA (qa, GATED on BANK-OPS):** `get_bctc_full(ACB)` serves real bank data (NO "no decomposition" refusal) — verified RAW via gateway in-container, not a badge; ACB bctc-eval stage-6 not-red; FPT (corporate path) UNCHANGED 0-regression; the enumerated-consumer deliberate-violation tests all RED-before-GREEN.

OUT:
- FPT / corporate-path behavior changes beyond what bank-awareness requires (corporate path must stay byte-identical — 0-regression).
- The TR-2 / BCTC-LAYOUT-FIRST opex/EBITDA/OCF items (FPT Operating Profit / EBITDA / Cash = 0) — separate sprint, NOT bank-awareness.
- New MCP tools, new tables, new schema enums beyond what the architect's discriminator design strictly needs (prefer reusing existing domain/statement_section).
- PER-SITE special-casing — the whole point is ONE discriminator-based pass, not another point-fix.

## Success Metric
1. `get_bctc_full(ACB)` serves real bank financial data (total_assets 1,030,900,741 / equity 98,751,052 / liabilities 932,149,689 / PBT 5,368,138 / net_profit 4,320,388; gross_profit NULL-legal) with NO "balance sheet has no decomposition" refusal — proven RAW live via gateway in-container.
2. ACB bctc-eval stage-6 not-red.
3. The architect brief enumerates EVERY corporate-assuming consumer; BANK-DEV fixes ALL of them in one change set (no consumer left for a future rebuild to discover).
4. FPT corporate path 0-regression (live `get_bctc_full(FPT)` identical to FU-EXIT snapshot above).
5. Every bank-aware consumer ships with a deliberate-violation test (RED-before-GREEN) per `feedback_fence_false_green`.

## Constraints (non-negotiable)
- **Architect root-cause FIRST — hard gate.** NO dev point-fix before BANK-ARCH enumerates all consumers (recurring-bug escalation).
- main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated HCM/handoff/notebook changes) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names.
- ops REBUILDs mcp-server after BANK-DEV (`build --no-cache` + force-recreate, never restart-stale); QA verifies ACB serving RAW in-container, not a badge (`feedback_router_verify_raw_not_badges`).
- 0-regression on the corporate path (FPT) — proven, not assumed.
- All sprint artifacts + agent-to-agent comms in ENGLISH (Vietnamese ONLY for FB posts + MARKET Telegram group). (BCTC user-facing Vietnamese strings in `get_bctc_full` output preserved.)

---

# Sprint FU-TRUST-REFRESH — Wire the dead OCR seam, then genuinely re-refine FPT + ACB

**STATUS 2026-05-31T11:30Z — ✅ EXIT-WITH-CAVEAT (PO, FU-EXIT). CORE GOAL MET, SPRINT CLOSED. Residual bank-path block SPLIT to new sprint BANK-AWARE-BCTC (below).** Priority was HIGH. Follow-up to BCTC-TRUST-RED (CLOSED e0c900d0). Brief `docs/architecture-briefs/2026-05-31-bctc-trust-remediation-investigation.md` (aa753e5e). Zone: dev-pdf-extractor (`apps/pdf-extractor/`) + ops (docker-compose) + qa + (scalar-aggregator follow-on) dev-mcp-server.

**FU-EXIT sign-off (PO, critique-before-approve on RAW live values via gateway, NOT relayed badges — `feedback_router_verify_raw_not_badges`):**
- **Mock data is GONE.** The TRUST-RED digit-run placeholders (`12345678901234`/`8901234567890`, single shared `refined_at`) no longer exist. FPT + ACB were genuinely re-refined through the wired OCR seam (FU-1, af50d67a).
- **FPT FULLY consumable (live-verified).** `get_bctc_full(FPT)` serves real numbers: Total Assets 68.586,1 tỷ / Equity 40.122 / Total Liab 28.464,1 (balances) / Net Revenue 12.480 / Gross 4.244,9 (≠Net) / Net Profit 2.476,8; confidence 81%. Operating Profit / EBITDA / Cash = 0 are the KNOWN TR-2 / BCTC-LAYOUT-FIRST opex+OCF items (NOT regressions, NOT in this sprint's goal). bctc-analyst can consume FPT.
- **ACB scalars CORRECT + balanced (verified by QA via direct bun:sqlite; scalar correctness re-confirmed by PO from the live aggregator output).** total_assets 1,030,900,741 / equity 98,751,052 / liabilities 932,149,689 / PBT 5,368,138 / net_profit 4,320,388; gross_profit correctly NULL (banks have none). The DATA is trustworthy.
- **CAVEAT (explicit, NOT a hidden false-green):** `get_bctc_full(ACB)` STILL returns "balance sheet has no decomposition — forced-zero pass suspected" (PO live-verified, 11:30Z) and ACB bctc-eval stage-6 is RED. **ACB DATA is trustworthy; ACB get_bctc_full SERVING is BLOCKED** — not by bad data, but because the corporate-centric consumers (PUB-3 publishability scanning codes 100–440, eval stage-6 balance extraction) cannot read ACB's bank-form (B02-TCTD) label/code scheme even though the aggregator resolves it correctly via labels. This is a DISTINCT cross-cutting "bank-awareness across BCTC consumers" theme → SPLIT to **BANK-AWARE-BCTC**, with a MANDATORY architect root-cause before any further point-fix (recurring-bug escalation: this class was patched 3× this sprint — FU-6d aggregator, FU-6f B-1 eval anchors, FU-6f B-3 PUB-3 corporate-only — and keeps surfacing one consumer at a time, the `feedback_silent_swallow_serial_bugs` pattern).

**Shipped (RED-before-GREEN tested, ~9 commits):** FU-1 OCR seam (af50d67a), FU-5 scalar backfill (6cc75437), FU-5b VN parens-negative parser, FU-6c label-canonical + fail-loud balance-identity invariant, FU-6d generalized bank-path label resolution + reused-Roman-code labelHints, FU-6e not-applicable null-clear, FU-6f domain-aware eval anchors + blob sync + PUB-3 general-section codes (corporate case only).

**Sprint goal was achieved on its own terms:** kill mock data → restore real verified scalars for FPT + ACB (Success Metric #1 page-text seam ✅; #2 real numbers + COUNT>0 + DONE — MET for FPT serving end-to-end + MET for ACB at the data/scalar layer; ACB SERVING block is a consumer-layer theme outside this sprint's OCR-seam/re-refine scope). FU-4 data-trust GATE is therefore SATISFIED → ENV-ISOLATION-P2 gate is RELEASED (see ENV-ISOLATION §).

## Why this sprint
BCTC-TRUST-RED shipped gates that BLOCK fabricated data and refuse to publish; FPT (`e8ea3df5`) and ACB (`fea19bae`) were purged → `refine_status=PENDING`, 0 units, 0 rows. The gates stop bad data but do NOT produce good data. The architect root-caused the fabrication (binding): the Haiku refine agent fabricated digit-run placeholders when it received EMPTY OCR text. Root cause is an unwired dependency-injection seam — `/page-text` handler (`apps/pdf-extractor/interface/handlers.py:728`) returns `{"text":""}` permanently because `main.py create_app()` never constructs/passes `ocr_text_source` to `register_routes()`. Real OCR text EXISTS in `pdf_extracted_text` (FPT 35 pages, ACB 27 pages, real Vietnamese financial text) but never reaches the agent. **A re-refine TODAY would re-fabricate.** The seam (Gap R-1) must be fixed and proven returning real text BEFORE any re-refine.

## Vision
One sentence: **The `/page-text` endpoint returns the real per-page OCR text that already lives in the DB, so a genuine off-HOSE re-refine of FPT + ACB produces real extracted financial values (not digit-runs) that pass the TRUST-RED gates and restore `get_bctc_full` to honest data.**

## Operator-decision adjudication (PO, full autonomy — rationale binding)
- **OD-1 — open FU-TRUST-REFRESH? → YES (APPROVED).** The seam fix is the gating prerequisite for ever restoring real BCTC data; the gates alone leave the product showing "Chưa có dữ liệu" indefinitely. Bounded 4-task sprint (5th optional).
- **OD-2 — dev-pdf-extractor owns FU-1 (seam wiring)? → YES (CONFIRMED).** `apps/pdf-extractor/main.py` + `infrastructure/config.py` + `interface/handlers.py` are all the dev-pdf-extractor zone. Zone-clean, no cross-service code edit.
- **OD-3 — include FU-5 (EBITDA `operating_profit→ebitda` parser mapping, `apps/mcp-server/` zone) here, or defer? → DEFER to BCTC-LAYOUT-FIRST.** Rationale: FU-5 is a `apps/mcp-server/` change — a DIFFERENT zone from FU-1's `apps/pdf-extractor/`. Folding it in makes this a multi-zone sprint and risks an mcp-server rebuild colliding with the focused pdf-extractor rebuild. EBITDA=0 is already a TR-2 / BCTC-LAYOUT-FIRST LF-QA acceptance criterion. Keep FU-TRUST-REFRESH single-zone (pdf-extractor) for a clean fast unblock. (Architect recommended include; PO overrides on zone-discipline grounds — the recurring-bug history of cross-zone rebuild collisions outweighs the ~10-line convenience.)
- **OD-4 — FPT pages 11–15 absent from OCR (likely opex codes 11/24/25/26); accept re-refine may not recover them, route residual to BCTC-LAYOUT-FIRST? → ACCEPT + CONDITIONAL ROUTE.** Re-refine proceeds with the pages that DO exist (30/35 FPT, all 27 ACB); the agent receives an honest `text=""` for 11–15 and degrades gracefully (`image_unavailable`) — it will NOT fabricate (DT-1 gate + honest-empty signal). FU-4 QA explicitly evaluates whether opex codes 11/24/25/26 appear post-refine. If still absent, escalate to BCTC-LAYOUT-FIRST for targeted re-OCR of those 5 pages (do NOT trigger PEK for 5 pages inside this sprint — over-engineering).
- **OD-5 — approve mounting market.db READ-ONLY into pdf-extractor? → FLAGGED BACK TO ARCHITECT (design re-pick required; do NOT force a mount).** Two findings change the picture: **(1)** the architect's brief states the `market_data` volume is "currently only mounted in mcp-server" — this is FACTUALLY WRONG. `docker-compose.yml` already mounts `market_data:/app/data` (read-write) in BOTH services; pdf-extractor already has the volume. So no NEW mount is needed — only `MARKET_DB_PATH` wiring (and ideally tightening to `:ro`, but the shared named volume can't be split per-service read-only without restructuring). **(2)** the codebase ALREADY contains an HTTP alternative the brief did not weigh: `infrastructure/ocr_text_fetch_client.py` (`OcrTextFetchClient` → `GET /api/bctc-inspect/ocr/{report_id}?page=N` on mcp-server) — exactly the "pdf-extractor calls an mcp-server endpoint for page text" alternative OD-5 asks about. It is the looser-coupled option but is NOT currently wired into the `/page-text` factory (factory only offers sqlite|mistral). **PO decision:** the choice between (a) direct SqliteOcrTextSource read of the shared volume vs (b) HTTP-fetch via the existing OcrTextFetchClient is a genuine design trade-off (coupling vs. an extra network hop on the refine hot path) that the architect must adjudicate with the corrected volume facts in hand. Architect runs FU-0 (design pick) FIRST; FU-1 implements whichever seam the architect picks.

## Scope
IN:
- **FU-0 (architect)** — Re-decide the OCR seam approach with corrected facts: (a) direct `SqliteOcrTextSource(MARKET_DB_PATH)` on the already-mounted `market_data` volume, OR (b) wire the existing `OcrTextFetchClient` (HTTP → mcp-server `/api/bctc-inspect/ocr`). Output: a 1-page addendum picking one, with the env/config + factory changes named. Note volume is already mounted (no new mount); decide read-only feasibility.
- **FU-1 (dev-pdf-extractor)** — Implement the architect's chosen seam so `/page-text` returns real OCR text. If (a): add `market_db_path` to `config.py` (env `MARKET_DB_PATH`, default `/app/data/market.db`), construct source in `main.py create_app()`, pass `ocr_text_source=` to `register_routes()`. If (b): extend the factory to offer the fetch-client backend and wire it. Add a fail-loud startup check (RISK-1: log a one-time ERROR if the source is unreachable, not a silent per-call `""`). **Acceptance: live `get_bctc_page_text(FPT, page=7)` via gateway returns real Vietnamese text (≥100 chars), NOT `""`.**
- **FU-2 (ops)** — After FU-1 ships: rebuild pdf-extractor (`build --no-cache` + `force-recreate`, not restart-stale); confirm the seam live; rasterize all FPT (46) + ACB (27) pages via `/rasterize` so the agent has image context for every window (Option C coverage). Verify images in `/data/bctc-page-images/{id}/`.
- **FU-3 (ops, AFTER FU-1+FU-2, off-HOSE only)** — Confirm FPT+ACB still PENDING; run the refine cron off-HOSE (permitted now: Sat 2026-05-31; on weekdays only 09:00–01:59 UTC). Monitor per-window results via `get_bctc_refined`.
- **FU-4 (qa)** — `get_bctc_full(FPT)` + `get_bctc_full(ACB)` return real financial data (not digit-runs); `bctc_table_rows COUNT > 0`; `refine_status=DONE`; DT-1/DT-2/DT-3 did not falsely block (check push/finalize return values per RISK-2/RISK-4). Evaluate OD-4: did opex codes 11/24/25/26 appear? Verdict feeds BCTC-LAYOUT-FIRST.

OUT:
- **FU-5 (EBITDA mapping)** — DEFERRED to BCTC-LAYOUT-FIRST (OD-3, zone discipline).
- Re-OCR of FPT pages 11–15 via PEK — DEFERRED to BCTC-LAYOUT-FIRST (OD-4) if opex still missing post-refine.
- All TR-2 sub-flow enrichments (equity decomposition, CF continuation, prior-period column) — stay in BCTC-LAYOUT-FIRST.
- Any new MCP tool, new SQLite table, new schema enum. Purely additive DI wiring + ops rasterize + verify.

## Success Metric
1. `get_bctc_page_text(FPT, page=7)` returns real text (≥100 chars), proven live via gateway (the binding acceptance — "HTTP 200 with empty string" is NOT pass).
2. Post-refine: `get_bctc_full(FPT)` and `get_bctc_full(ACB)` show real financial numbers; `bctc_table_rows COUNT > 0`; `refine_status=DONE`; zero `REJECTED_SANITY` units from genuine fabrication (a DT-3 cross-stmt block on REAL inconsistent data is a separate evaluate-don't-clear path per RISK-2).
3. OD-4 verdict recorded: opex codes 11/24/25/26 present or routed to BCTC-LAYOUT-FIRST.
4. FU-1 ships with a fail-loud startup DB-reachability check (RISK-1 mitigation), proven by a deliberate-violation that an unreachable source ERRORs at startup rather than returning silent `""`.

## Constraints (non-negotiable)
- WIP-aware ordering: **FU-0 (if architect needed for OD-5) → FU-1 → FU-2 → FU-3 → FU-4**, strictly sequential (FU-1 blocks FU-2 blocks FU-3 blocks FU-4). FU-3 off-HOSE-gated.
- main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated HCM/handoff/notebook changes — do NOT touch HCM-DISAMBIG or unrelated files) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names.
- ops REBUILDs pdf-extractor after FU-1 (`build --no-cache` + `force-recreate`, never restart-stale); verify seam live in-container BEFORE FU-3.
- off-HOSE: no live extraction 02:00–08:59 UTC Mon–Fri. FU-3 only runs in the permitted window (today Sat 2026-05-31 = permitted).
- Fail-loud, not silent (RISK-1): never re-introduce a path where `/page-text` returns `""` on a misconfig without an ERROR.
- All sprint artifacts + agent-to-agent comms in ENGLISH (Vietnamese ONLY for FB posts + MARKET Telegram group).

---

# Sprint BCTC-TRUST-RED — Trust layer green-stamps fabricated data

**BUILD STATUS 2026-05-30 — ✅ SIGNED OFF (PO, TRUST-EXIT). Sprint CLOSED.** Brief `docs/architecture-briefs/2026-05-30-bctc-trust-red.md` (4c8cfaf7), spec `docs/REQ_BCTC-TRUST-RED.md` (dde8fbcd). Data-integrity RED: refine trust layer reported `refine_status=DONE` + `confidence=0.80-0.85` on FABRICATED data (FPT Q1-2026 report `e8ea3df5…` carried ordered digit-run values `12345678901234`/`8901234567890` pushed via `push_bctc_refined_unit`; all 15 units shared one `refined_at`; ACB `get_bctc_full` showed `gross_profit=net_revenue` + zeroed equity/liab/cash passing a forced-zero balance check). The structured feed (`get_bctc_full`) surfaced this to analyst + market dishes.

**Three seams shipped (dev-mcp-server, zone `apps/mcp-server/` only):**
- **TR-0 ingest gate + publish guard + purge** — `pushBctcRefinedUnitTool.ts` calls `validateBctcUnit` pre-insert; BLOCK → `window_status='REJECTED_SANITY'` + `{ok:false, rejected_reason}` (never DONE). `bctcFullTools.ts` `checkPublishability` PUB-1..4 fires after `latestRow` query → refuses with "Chưa có dữ liệu BCTC" when refine_status not DONE/PARTIAL, no value_current rows, balance sheet has no non-summary child, or REJECTED_SANITY units present. FPT + ACB seeded rows purged → `refine_status=PENDING`, empty units. Commits 4278b61a · ebbdabbf · b08ab73a.
- **TR-1 semantic validators** (DDD-pure, domain layer, no I/O) — `bctcSanityValidator.ts` DT-1 monotonic/cyclic digit-run detector (≥2 distinct digit-run values → BLOCK); `bctcMagnitudeValidator.ts` DT-2 gross≥net + balance-forced-zero, DT-3 cross-statement revenue contradiction (>20% divergence), DT-4 identical-timestamp WARN. Wired into finalize. Commit 04fc08db. `REJECTED_SANITY` added to `financial_reports.refine_status` + `bctc_refined_units.window_status` enums (TEXT column, no ALTER).
- **TR-2 coverage** (opex codes 11/24/25/26, equity/liab decomposition, CF fragmentation, prior-period column drift) — ROUTED to BCTC-LAYOUT-FIRST as LF-QA acceptance criteria; NOT this sprint (extraction-layer fixes need dev-pdf-extractor + agent-father, would create zone conflict).

**Critique-before-approve verified LIVE on main (not trusted from ledger):** all 6 dev/test commits present on main (4278b61a · ebbdabbf · 04fc08db · b08ab73a · 15dfc434 · caf6865d); QA re-sweep a3f83b88 APPROVED (`bun test` exit 0; authoritative per-suite counts sanity-gate 8 / sanityValidator 18 / magnitudeValidator 17 / 240-bctc-full 5 / idempotency 13 / AIT-DEV-1 59 / HCM-DISAMBIG 19 @ 0-diff). Live gateway spot-check by PO: `get_bctc_full(FPT)` → "Chưa có dữ liệu BCTC" (zero financial numbers); `get_bctc_full(ACB)` → same refusal; `get_bctc_refined(e8ea3df5…)` → "no refined units found" (purged). Publish guard holds end-to-end. ops rebuilt mcp-server (`--no-cache` fresh image, force-recreate not restart), container healthy.

**Plain-language verdict — the anomaly CANNOT recur silently:** a future push of ordered-digit / fabricated values is REJECTED_SANITY at ingest (never DONE), and the structured feed refuses to publish any report whose decomposition is absent or whose units are REJECTED_SANITY. "Placeholder data carrying confidence, fed to analysis" is now gated at both the write seam and the serve seam.

**KNOWN-OPEN follow-ups (honest):**
- **FU-TRUST-REFRESH** — FPT + ACB are now PENDING/empty; they need a genuine re-refine (real OCR run, off-HOSE 02:00-08:59 UTC Mon-Fri) to restore real data. NOT part of this sprint.
- **TR-2** — folded into BCTC-LAYOUT-FIRST (LF-QA gates: non-zero opex codes, non-zero equity/liab, non-zero EBITDA, OCF from page 9/10/16).
- **DWF tsc debt (NOT ours, tracked)** — QA flagged 19 pre-existing tsc errors in `DWF-routing-policy-fence.test.ts` introduced by DYN-WF-FOUNDATION commit 8105f8fd (`lastRule` possibly undefined); confirmed pre-existing at `caf6865d~1`; belongs to DWF, log only.

---

# Sprint DYN-WF-FOUNDATION — Make fleet orchestration multi-session-safe, then SSOT-instrument it for demand-driven cadence

**STATUS 2026-05-31 — ✅ SIGNED OFF (PO, DWF-EXIT). Phase 0 + Phase 2 SHIPPED. Phase 1 GREENLIT as next sprint (Phase 2 cutover QA-stable → 0→2→1 ordering satisfied). Phases 3/4/5 DEFERRED.** Brief `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md` (Sections 1-7 + agents-architect Review 2026-05-30, CONDITIONAL ADOPT). Constraints settled by brief + review — do NOT relitigate the phase cut, the 0→2→1 ordering, or the deterministic-router constraint.
**DWF-EXIT sign-off (PO, critique-before-approve on live container, not trusted from QA ledger):** QA report `reports/TASK_REPORT_DWF-QA.md` APPROVED all FR-P0-1..4 + FR-P2-5/6/7. PO live spot-check via gateway wrapper in-container — `is_trading_day(2025-01-27)`→`{is_trading_day:false, session_status:"holiday"}` (Tết), `is_trading_day(2025-01-06)`→`{is_trading_day:true, session_status:"open"}`; TTL-cap fix proven live: `task_claim(ttl_seconds=691200)`→`claimed:true` (the Zod-schema silent 86400 cap ops found is gone in-container); `routing-policy.json` `.routing_policy` = 8 rules w/ catch-all `*/*/*/*`→po; cowork-schedule enabled slots = 14; `pressure-state.json` 9 fields present. Both BLOCKING ACs re-proven (R3 suffix-free `cowork-slot:<slot_id>`, R1 explicit `ttl_seconds:180`); R2 ops runbook present; all DV suites RED→GREEN. **Two NON-BLOCKING findings accepted-with-conditions:** (1) 19 TS18048 test-only errors in `DWF-routing-policy-fence.test.ts` → fixer task **DWF-TSC-DEBT** spun now (already tracked in TASKS.md, promoted to active FIX); (2) `pressure-state.json` seed `calendar_status:"unknown"` → ACCEPTED, initial-state-only, populates on next live tick. Neither blocks cutover.

## Why this sprint, why these two phases
The fleet is a static cron-tick machine on two clocks; the tick is the only clock and most ticks are SILENT empty-matches that still burn scheduling + git-commit churn, while a single session-scoped master cron is a SPOF and retries-under-launch-lag have caused real duplicate publishes (4× chef-morning, 2026-05-29). The brief proposes a 6-phase migration to demand-driven orchestration. The agents-architect review confirms a CONDITIONAL ADOPT of phases **0 + 2 + 1** with the mandatory implementation sequence **0 → 2 → 1**, deferring 3/4/5.

This sprint greenlights ONLY the self-contained, reversible, never-worse-than-today pair:
- **Phase 0** — instrument + SSOT cleanup. Zero behavior change. NOT purely zero-risk: includes the one new dev task the review surfaced — a VN exchange trading-day tool (`is_trading_day`) that does NOT exist today (`get_macro_calendar` covers macro events only, NOT HOSE/HNX open/holiday/half-day). That tool is the Phase 0 prerequisite.
- **Phase 2** — idempotent spawn token + leader lock. Closes the duplicate-publish class AND the session-scoped SPOF, reusing the already-implemented `task_claim`/`task_heartbeat`/`task_release` (no new tool, no new `kind` — `cowork-slot` covers both leader and per-work-item locks). MUST ship before Phase 1.

**Phase 1 (adaptive cadence) is NOT in this sprint's build scope** — it is registered as a blocked follow-up because Phase 1 without Phase 2's leader lock is strictly worse than today (adaptive cadence raises market-hours fire rates → more collision windows for un-deduped sessions). Phase 1 unblocks only after Phase 2 cutover is QA-proven stable.

## Vision
One sentence: **The fleet's master dispatch becomes provably single-leader and idempotent across concurrent CLI sessions (no duplicate publishes, no SPOF), and the read-only SSOTs that a later adaptive-cadence engine will consume — `routing-policy.json`, a per-tick `pressure-state.json`, and a real `is_trading_day` tool — exist and are populated while changing zero current behavior.**

## Scope
IN:
- **Phase 0 (instrument + SSOT, zero behavior change):**
  1. Prune dead/disabled schedule slots from the cowork schedule table (the ~26-slot, ~12-enabled JSON) so the slot table reflects reality. No live cadence change.
  2. Stand up `routing-policy.json` as a read-only SSOT that NOTHING consumes yet (envelope `(type, severity, zone, ticker)` → target agent(s) + channel + severity; deterministic table, PO as ambiguity fallback — per OQ-6 the router is deterministic-only, an LLM/semantic router is forbidden by CLAUDE.md §3).
  3. Add the new `is_trading_day` (VN exchange open/holiday/half-day) tool to mcp-server as a read-only SSOT (OQ-5 ANSWERED: no such tool exists; `get_macro_calendar` is macro-events only). Replaces the hardcoded `02:00-08:59 UTC` window duplicated across cron strings + E2 guards (as a source-of-truth only this phase — guards keep their hardcoded behavior until a later phase consumes the tool).
  4. Emit a single-row rolling `docs/data/pressure-state.json` each tick (signal backlog, last regime/volatility from the reused snapshot, calendar status via the new tool, dev-queue depth, host headroom) — WITHOUT acting on it (OQ-3: a single atomically-written JSON file, NOT a new always-growing SQLite table — disk-bloat + write-wedge history argue against it; stale hazard bounded to one tick).
- **Phase 2 (leader lock + idempotent per-work-item token):**
  5. **Leader lock** — before the master dispatch body, `task_claim(kind="cowork-slot", key="cowork-leader", ttl≈2×heartbeat)`; win→lead+renew each firing, lose→silent exit; dead leader→TTL expiry→standby wins next tick. Fixes double-dispatch AND the session-scoped SPOF (any live session can lead). The master cron firing IS the heartbeat renewal — no estimate needed.
  6. **Per-work-item idempotent token** — `task_claim(kind="cowork-slot", key="cowork-slot:<slot_id>")` BEFORE spawn/publish, key derived from **work identity alone** (e.g. `cowork-slot:chef-morning`).
  7. **Belt for publish** — server-side `published:<work-id>` marker checked before `send_telegram`.

**Three review corrections that are BLOCKING for Phase 2 (must be in the spec, proven by deliberate-violation tests):**
- **R3 (BLOCKING):** the per-work-item key MUST be `cowork-slot:<slot_id>` with **NO nominal-tick / time-bucket suffix**. A tick suffix changes the key every 15-min boundary and lets a peer launch a second instance of a still-running job — it recreates the original bug subtly. Hold-through-duration is handled by **TTL + renewal**, never by the key.
- **R1 (BLOCKING):** every per-work-item `task_claim` MUST pass an **explicit short TTL (~180s, ≈one flow step)**. The tool default is `ttl_seconds=3600` — relying on the default holds the lock a full hour after a 30s crash (a false-green starvation surface). Renewal at natural flow checkpoints; release on completion. `TTL > renewal interval`, NEVER `TTL ≈ job duration`.
- **R2 (NON-BLOCKING, must be documented):** `SERVER_SESSION_ID = pid-<pid>-ts-<startupMs>` is process-level. A Docker `force-recreate` of mcp-server (the standard wedge-recovery) resets the PID so the new process cannot renew the old leader lock; the stale row holds until its TTL elapses → a leader-lock dark window equal to the leader TTL (≈30 min at 2×15-min heartbeat). Ship a Phase 2 ops runbook documenting this; do NOT shorten the TTL by guessing.

OUT (explicitly deferred / not this sprint):
- **Phase 1** (heartbeat consults Cadence Policy / adaptive cadence) — registered as a blocked follow-up below; unblocks ONLY after Phase 2 cutover is QA-stable.
- **Phase 3** (content-addressed router actually consuming `routing-policy.json` / replacing "everything → PO") — DEFERRED; needs shadow-mode proof the table is deterministic + exhaustive (CLAUDE.md §3). `routing-policy.json` is built read-only in Phase 0 but nothing routes through it yet.
- **Phase 4** (persistent workgraph DAG) — DEFERRED; `pipeline-state.json` stale-state analogy + crashed-agent-never-signals dead-edge hazard. Storage decision (`signals.db` vs JSON) deferred to Phase 4 onset.
- **Phase 5** (backpressure governor + per-zone commit lanes) — DEFERRED; needs Phase 0 pressure data first, and `commit-mutex:main` stays the single default mutex (most history-scarred mechanism).
- Shortening the `*/15` heartbeat floor to `*/5` — OUT this sprint; OQ-1 says feasible on CronCreate (no API_MIN_INTERVAL on that plane, unlike RemoteTrigger) but validate empirically AFTER Phase 2 is stable, not as a Phase 1 change.
- A persistent always-on leader daemon — OUT; OQ-2 / kernel-panic history → opportunistic leader (whatever live session wins), bounded dark windows accepted.

## Success Metric
- **Phase 0:** dead slots pruned (slot table == live reality); `routing-policy.json` exists as valid deterministic SSOT consumed by nothing (a fence/lint proves it parses + covers the documented envelope axes); `is_trading_day` tool live in mcp-server returning correct open/holiday/half-day for known VN dates (incl. a known holiday + a Saturday) verified via the gateway wrapper in-container; `pressure-state.json` is emitted each tick and never read by a decision path (instrument-only). Zero current-behavior change — existing cowork/dev-team ticks fire exactly as before.
- **Phase 2:** under TWO simulated concurrent leaders, exactly ONE wins per tick and the loser silent-exits (deliberate-violation test: two claimers, assert single winner); a retry of an un-confirmed per-work-item spawn re-computes the SAME `cowork-slot:<slot_id>` key and is rejected (R3 proof — and a deliberate test that a tick-suffixed key would let a duplicate through, proving the suffix-free key closes it); a per-work-item claim crashing before first heartbeat frees the lock within the short TTL, NOT 3600s (R1 proof — a test asserting the explicit-TTL path, and that omitting TTL would starve for an hour); `published:<work-id>` marker blocks a second `send_telegram` for the same work id. R2 ops runbook committed. Every new lock/policy ships with a deliberate-violation proof per `feedback_fence_false_green` — "exit 0" is NOT acceptance.
- **Sequencing gate:** Phase 1 build work does NOT start until Phase 2 cutover is QA-signed-off stable.

## Constraints (non-negotiable)
- main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` (tree carries many unrelated changes) · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper, bare tool names · ops REBUILDs mcp-server after dev changes (`build --no-cache` + `force-recreate`, never restart-stale) · all structural data via `docs/data/system-map.json` (never hardcode services/agents/zones) · every new lock/policy/fence proven by deliberate-violation, NOT "exit 0" · no new SQLite audit-growth table for PressureState (single-row JSON) · `commit-mutex:main` stays the single default mutex · no new `task_claim` kind (use `cowork-slot`) · after any agent `.md` change invoke `agent-md-factory` skill first then give operator a paste-ready Cowork refresh prompt · all sprint artifacts + agent-to-agent comms in ENGLISH.

---

# Sprint BCTC-AI-INPUT-TAB — A 7th viewer tab showing the exact per-page input bundle the refine agent ingested

**BUILD STATUS 2026-05-30 — ✅ SIGNED OFF (PO, AIT-EXIT).** Sprint CLOSED. Additive-only 7th tab "Đầu vào AI" on `/api/bctc-inspect`. QA cycle-157 APPROVED all 7 gates @ b4ed9266 + path-fix cbe96137; container healthy (built after commits), repo==live image. **Critique-before-approve verified on main (not trusted from ledger):** both commits present on main; live routes probed in-container — `page-image/{rid}?page=6` → HTTP 200 `image/png` 336KB with real PNG magic bytes `89 50 4e 47` (not echo); miss `page=99` → honest HTTP 404 `png_not_found`; `page-window/{rid}?page=6` → real `bctc_refined_units` data (`unit-0003`, page_numbers [6]). Real PNGs exist for FPT (report `e8ea3df5…`, pages 6-11) in the `/data/bctc-page-images` volume. FPT `financial_reports` row UNTOUCHED (`confirm_status=PENDING`, `refine_status=DONE` via in-container bun:sqlite read) — additive viewer-only, no DB writes. Additive-only confirmed: HEAD HTML AND live-served HTML both expose all 7 tabs (6 prior `bang/danhgia/md/ocr/soluyen/suatay` intact + new `aiinput`); path-fix is exactly 1 file / 1 line. **ALL sprint artifacts + agent-to-agent comms in ENGLISH** per the language-boundary rule (Vietnamese ONLY for FB posts + MARKET Telegram group). The ONE Vietnamese exception is the new tab's user-facing LABEL, because the viewer is an existing all-Vietnamese operator tool.

## User intent (verbatim)
> "add tab for see what ai receive of each page bctc"

A new tab in the `/api/bctc-inspect` right pane that shows, for the CURRENTLY SELECTED PAGE, the exact input bundle the `refine_bctc_md` agent received for that page. Purpose: let the operator debug/understand WHY a page extracted the way it did.

## Vision
One sentence: **The operator opens the BCTC viewer, switches to a new "Đầu vào AI" (AI input) tab, and for whatever page is selected sees the exact bundle the refine agent ingested — the rasterized page PNG the agent's vision actually saw, the OCR text passed for that page, and which adjacent pages were co-loaded — so they can reason about the extraction.**

## Per-page bundle to surface (page nav is MASTER — content replays on `navigateToPage` like every other tab)
1. **Rasterized page IMAGE the agent's vision saw** — the PNG at `data/bctc-page-images/{report_id}/page_{N}.png` (the `get_bctc_page_image` / rasterize path). This is the AGENT-input PNG, which may differ from the left-pane PDF.js render. Show the actual PNG bytes, NOT a re-render. If no PNG exists yet for a page, show an honest "chưa có ảnh trang này" empty state — never a placeholder pretending it exists.
2. **OCR TEXT passed for that page** — `get_bctc_page_text` (filename+page lookup; `pdf_extracted_text` has NO report_id). The existing "Văn bản OCR" tab already shows OCR text alone; this tab's added value is the COMPLETE bundle (image + text + window) as the agent ingested it.
3. **PAGE-WINDOW context** — if this page belonged to a multi-page refined unit (`bctc_refined_units.page_numbers_json`), show which adjacent pages were also loaded into the agent's context for this page.
4. **Architect's call (optional)** — the static refine contract/instructions the agent operated under (numbers←text; structure←image; disagreement→FLAG never guess), shown read-only for transparency.

## Grounding (already shipped — read, do NOT rebuild)
- **Viewer home**: `apps/mcp-server/src/interface/bctc-inspector.html` (2603L, embedded JS) served at `/api/bctc-inspect`. NOT Remix — this is mcp-server's own served HTML. Tab pattern is `rtab-btn[data-tab]` buttons + `tab-panel[data-tab-panel]` panels toggled by `switchTab(tabId)` (line ~2578); `navigateToPage(pageNum)` (line ~1249) is the MASTER orchestrator that replays per-page content for every tab on each page change.
- **Existing 6 tabs (do NOT break)**: `ocr` (Văn bản OCR), `bang` (Bảng), `md` (Bảng Markdown), `soluyen` (Số liệu), `danhgia` (Đánh giá 6 cổng), `suatay` (Sửa tay). New tab is the 7th, e.g. `data-tab="aiinput"`.
- **Browser↔server contract**: the viewer talks REST, NOT MCP tools. Per-page OCR today = `GET /api/bctc-inspect/ocr/{docId}?page={page}` (line ~1280). `docId` in the viewer === `report_id` (the image tool's key).
- **Tools that already produce the data (MCP-tool surface, not yet HTTP routes for the `<img>`)**:
  - `get_bctc_page_image` (#FR-4): keyed by `report_id`; builds `data/bctc-page-images/{reportId}/page_{paddedPage}.png`; rasterizes on miss. Source: `tools/financial-reports/getBctcPageImageTool.ts`.
  - `get_bctc_page_text`: `report_id`→`pdf_path`→`basename`→pdf-extractor `/api/page-text`. Source: `getBctcPageTextTool.ts`.
- **Page-window source**: `bctc_refined_units.page_numbers_json` (report_id, unit_id, page_numbers_json, ...).

## Scope
IN:
1. **New 7th tab** following the existing `switchTab`/`rtab-*`/`tab-panel` pattern. Vietnamese LABEL (architect/dev decide exact wording, e.g. "Đầu vào AI"). Per-page replay hooked into `navigateToPage`.
2. **Per-page agent-input PNG** rendered in the new tab. Architect decides the browser-reachable serving seam — most likely a SMALL additive HTTP route (e.g. `GET /api/bctc-inspect/page-image/{docId}?page=N`) returning REAL PNG bytes (Content-Type image/png), reusing the existing `get_bctc_page_image` resolve/rasterize logic. Honest empty state when no PNG.
3. **Per-page OCR text** shown inside the same bundle (architect decides: reuse existing ocr endpoint vs page-text path).
4. **Page-window** indicator from `page_numbers_json` for the selected page's unit.
5. **(Optional) read-only refine contract** text block.

OUT:
- The existing 6 tabs, 50/50 split, MD→table view, agent/debug toggle, has_pek, all 25 legacy pane IDs — UNTOUCHED.
- Remix frontend; PDF-Extract-Kit subtree (pristine); `text_table_extractor.py` (frozen 0-diff).
- Fabricating per-page data the system does not have (no live extraction to backfill during QA; honest empty states only).
- Any change to the refine pipeline or its determinism (that is AR-FU-DETERMINISM, separate).

## Success Metric
1. Viewer shows a 7th Vietnamese-labelled tab; clicking it shows the selected page's bundle; `navigateToPage` replays the bundle on every page change.
2. The PNG shown is the ACTUAL agent-input file bytes (verified the serving route returns real `image/png` bytes, not an echo/placeholder); pages with no PNG show the honest empty state.
3. OCR text + page-window for the selected page render correctly.
4. **Anti-false-green:** a DV test (RED-before / GREEN-after) lands in the SAME commit as production. If a new HTTP route serves the PNG, a test proves it returns real image bytes for a present file and the honest 404/empty path for a missing one. Balance badge FORBIDDEN as a gate (N/A here).
5. Zero regression: all 6 existing tabs, the 50/50 split, MD→table, agent toggle, and the 25 legacy pane IDs still pass their existing tests (HC-DEV-6/HC-DEV-7/page-nav suites green).
6. mcp-server rebuilt `--no-cache` + force-recreate; container healthy; toolCount unchanged (no new MCP tool unless architect adds one — additive HTTP route preferred); PNG verified served in-container.

## Constraints (non-negotiable — carried from operator)
- Additive ONLY. main branch only, NO branches. Scoped `git add <file>` per file, NEVER `-A` (tree has many unrelated changes). PDF-Extract-Kit pristine; `text_table_extractor.py` frozen 0-diff.
- MCP via gateway wrapper only. Rebuild via `docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server`. Verify persistence/serving via direct in-container read.
- off-HOSE: no live extraction 02:00–08:59 UTC Mon–Fri (today Sat 2026-05-30 → permitted). Leave FPT/ACB report state untouched during QA (read-only).
- After any agent `.md` change (if architect routes one): invoke `agent-md-factory` skill first, then give operator a paste-ready Cowork refresh prompt.

---

# Sprint BCTC-HUMAN-CONFIRM — Human-in-the-loop correction layer for flagged BCTC cells (the final trust gate)

**BUILD STATUS 2026-05-30 — ✅ SIGNED OFF (PO, HC-EXIT).** QA HC-QA-3 cycle-156 APPROVED all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154 healthy. Critique-before-approve verified on main: transaction ordering sound (DELETE-old-pinned BEFORE reAnchorCorrections per HC-ARCH-2 canonical order, single db.transaction); DV-HC-8 false-green closed (asserts anchor_status='ok' + COUNT==1); DV-HC-14 genuine-ambiguous safe-fail closed (anchor_ambiguous + COUNT==2). Recurring-bug-escalation honored (architect HC-ARCH-2 root-caused at round 2 before HC-FIX-2). Sprint CLOSED. Optional follow-up: AR-FU-DETERMINISM (upstream refine non-determinism affects HOW MANY cells get flagged — not a blocker; correction layer handles whatever is flagged). Previous sprint BCTC-AGENTIC-REFINE ✅ SIGNED OFF 2026-05-30.

## User intent (verbatim)
> "I need one other layer, manual fix, user can fix where đánh dấu cảnh báo (đỏ/vàng) for make bctc more correct for final confirmed."

A HUMAN-IN-THE-LOOP correction layer sitting on top of the agent-refine output. The refine step already FLAGS cells it is unsure about with Vietnamese trust prefixes embedded in the markdown: red `[ĐỘ TIN CẬY THẤP — OCR <x> vs image <y>]` (numeric disagreement → source_confidence 0.2) and yellow `[độ tin cậy thấp]` (low confidence → source_confidence 0.4). The user now wants to review, hand-correct, and lock a report as human-verified — so the corrected figures (not the flagged ones) feed `get_bctc_full` + the 6 `bctc-analyst` expert passes.

## Vision
One sentence: **A non-technical user can open the existing BCTC viewer, see every red/yellow flagged cell with both the OCR value and the image-read value side by side, hand-correct each one, mark the whole report "ĐÃ XÁC NHẬN" (final confirmed), and have those human-verified numbers flow back into `bctc_table_rows` — surviving any later automated refine re-run.**

## Grounding (already shipped — read, do NOT rebuild)
- **Refine output**: table `bctc_refined_units` (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, refined_at). Trust prefixes live IN the markdown; `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` is the SINGLE point of correctness that maps red→0.2 / yellow→0.4 / none→1.0 into `source_confidence` + a flag string on each `bctc_table_rows` row.
- **UI home**: the EXISTING mcp-server-served viewer at `http://localhost:3000/api/bctc-inspect` (`apps/mcp-server/src/interface/bctc-inspector.html` + `routes/bctcInspectHandler.ts` + `routes/bctcInspectMdHandler.ts`). Last sprint added a MD→table view + a "Người dùng | Agent (debug)" toggle. The "Sửa tay / Xác nhận cuối" mode is the ADDITIVE extension — do NOT touch the Remix frontend.
- **Status dimension**: `financial_reports` has `refine_status` (PENDING/IN_PROGRESS/DONE/PARTIAL/FAILED). A SEPARATE human-confirm dimension is needed (architect decides: `confirm_status` / `final_confirmed_at` / corrections table) — do NOT collapse it into `refine_status`.
- **Tools**: `get_bctc_refined`, `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine` (#141-144). A NEW persist path for manual corrections is needed (architect's call: new tool + corrections table, or edit-in-place with audit trail).

## Scope
IN:
1. **Review surface** — in `/api/bctc-inspect`, list every red/yellow flagged cell for a report: OCR value, image-read value, page number, surrounding label/context, current value. Plain Vietnamese.
2. **Manual correction** — user picks OCR vs image, or types the true value, per cell.
3. **Final-confirm lock** — mark report "ĐÃ XÁC NHẬN" (human-verified) on its own status dimension.
4. **Flow-back** — corrected figures re-enter `bctc_table_rows` (prefer re-parse with overrides through the existing parser — keep it the single point of correctness). ESC-5 (confidence<0.50) clears for human-confirmed cells.
5. **Survival invariant** — a later cron refine re-run (`0 9,14,20 UTC`) does NOT silently clobber a human confirmation. Architect decides precedence (confirmed cell pinned/immutable, or cron re-flags only unconfirmed cells).
6. **Audit trail** — who/when/old→new for every correction.

OUT:
- Rebuilding/retuning the refine pipeline (that is AR-FU-DETERMINISM, separate).
- Remix frontend changes; PDF-Extract-Kit subtree (pristine); `text_table_extractor.py` (frozen).
- Multi-user auth/RBAC (single-user product).
- Mistral OCR swap (user-locked future).

## Success Metric
On a report with known red/yellow flags (FPT or ACB), a user: (1) sees all flags listed with OCR/image values + page + label; (2) corrects ≥1 cell by hand; (3) marks the report ĐÃ XÁC NHẬN; (4) direct in-container `market.db` read (bun:sqlite `new Database(path)`) shows the corrected value in `bctc_table_rows` with source_confidence cleared above 0.50 and an audit row for the change; (5) a simulated refine re-run leaves the confirmed cell intact per the chosen precedence rule. Verified by QA via DV tests RED-before/GREEN-after in the SAME commit as production, NOT by balance badge.

## Non-negotiables (carried into every handoff)
main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` · additive only (do not break `/api/bctc-inspect`, MD→table view, agent/debug toggle, `has_pek`) · PEK subtree pristine · `text_table_extractor.py` frozen · DV tests RED-before/GREEN-after in SAME commit as production · verify persistence via direct in-container `market.db` read with bun:sqlite plain `new Database(path)` · balance badge FORBIDDEN as sole QA gate · Vietnamese trust-prefix convention preserved · all user-facing viewer copy in PLAIN Vietnamese · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper (bare tool names) · never ask user to run code (spawn ops/developer/qa) · after any agent .md update give a paste-ready Cowork refresh prompt · ops REBUILDs container after dev changes (build --no-cache + force-recreate, never restart-stale) · off-HOSE no extraction 02:00-08:59 UTC Mon-Fri (manual UI edits are not extraction; triggered re-parse respects the same data-write discipline).
