# Sprint HCM-DISAMBIG — Harden HCM ticker vs TP.HCM city disambiguation across extraction + narrative layers

**Status:** OPEN — kicked off 2026-05-28T21:20Z by PO from EXPLICIT USER bug report (content accuracy / non-technical user MARKET dish trust).
**Priority:** HIGH — affects MARKET/WORK dish accuracy; HCM is a real watchlist ticker (Securities sector, peer of SSI/VND/VCI/VIX per `docs/data/stock-classification.json:112`), so false-positives mislabel articles AND a regression that suppresses legitimate HCM mentions silently kills coverage.
**Zone:** multi (architect must split) — `apps/mcp-server/` (newsNormalizer + chef prompt) primary; `apps/news-fetch/` ingestion path needs verification it does not have its own ticker extractor.
**Sprint size:** SPRINT-S (hardening + prompt update + tests; no new microservice; no schema change).
**NOT a scale pilot** — does NOT consume WIP fleet cap; does NOT touch `pilot-status-*.json`.

## Vision

A non-technical Vietnamese user reading the MARKET Telegram channel must never see "HCM" used ambiguously: the ticker (HCM = Hồ Chí Minh City Securities Corporation, HOSE-listed) and the city abbreviation (TP.HCM / TPHCM = Thành Phố Hồ Chí Minh) are completely different entities. The system must extract one without ever firing the other, and the chef dish narrative must disambiguate explicitly when both could be meant in the same sentence.

## Scope

**IN:**
1. **Extraction hardening — `apps/mcp-server/src/domain/services/newsNormalizer.ts`**
   - Verify Task 1788 GEOGRAPHIC_CONTEXT_MAP covers ALL agreed surface forms (audit + extend if needed):
     - `TPHCM` (no separator) — already covered
     - `TP HCM` (space) — already covered
     - `TP.HCM` (dot) — already covered
     - `TP. HCM` (dot + space) — verify
     - `Tp.HCM` / `Tp HCM` / `TpHCM` (mixed case) — verify (look-behind already toLowerCase())
     - `TP-HCM` (hyphen) — NEW
     - `TPHCM-Phuket` compound (hyphen on the RIGHT side of HCM) — this is the exact #4144 case; HCM is at position N, the "TP" / "TPHCM" boundary is at N-? — verify the 10-char look-behind window actually catches `TPHCM-` when the matched token is the trailing `HCM` (regex `\bHCM\b` will NOT split `TPHCM` so this may already be a non-issue, but a test must PROVE it)
     - `HCM,` `HCM)` `HCM ` (trailing punctuation/space) — these are legitimate ticker positions, MUST still extract
     - Bare `Hồ Chí Minh` (no `TP` prefix) in geographic context — currently `thành phố hồ chí minh` is in map; bare `hồ chí minh` is NOT — assess whether to add (risk: would also block legitimate "Chứng khoán Hồ Chí Minh" alias which is the company name — likely we keep current behavior and the alias path wins)
   - Confirm Pattern 1 (parenthetical `(HCM)`) and Pattern 3 (alias `chứng khoán hồ chí minh` / `hcm securities`) still fire on legitimate ticker mentions — these MUST NOT regress.

2. **Narrative disambiguation — `docs/agents/unified-agent/flow/chef.md` Block A spec**
   - Add a Block-A format rule: when "HCM" appears as a ticker in the dish, render it as `HCM (mã)` or `HCM (cổ phiếu)` on first mention so the non-technical reader cannot confuse it with the city. The city, if mentioned in the same dish, must always be rendered as `TP. HCM`. Add to "Format rules" list near the existing Hán-Việt rule.
   - Extend Block B (WORK / TNB-auditable) with the same disambiguation since tran-ngoc-bau also reads HCM in audit text — but Block B can rely on explicit ticker context (signal IDs cite affected_stocks) so this is documentation-only there.

3. **Audit other free-text emitters** (verification only — fix only if a leak is proven):
   - `alert-commander` dish writer
   - `financial-analyst` BCTC narrative
   - `market-watcher` price-anomaly text
   - `news-scout` signal `summary` and `analysis` fields (signal #4144 was already CORRECT — `affected_stocks: ["HVN"]` only — but the human-written `summary` says "TPHCM - Phuket" verbatim; that is FINE because it is geographic context; the rule is "do not put HCM in `affected_stocks` unless the article is about the ticker", which extraction already enforces)

**OUT:**
- New microservice, new MCP tool, new cron, schema change, DB migration.
- Touching `apps/news-fetch/` ingestion if `newsNormalizer.ts` is the sole extractor (architect to confirm).
- Re-litigating Task 1788 design — only extending its coverage if gaps proven.
- Block B / WORK channel narrative rewrites beyond the one-line disambiguation note (TNB audit is technical, expects context).
- Adding a per-ticker disambiguation map for every geographic-clash ticker (out of scope; HCM-only this sprint; backlog ticket if other tickers surface).
- Changing pre-existing signals already on disk (#4144 etc.) — purely going-forward.

## Success Metric

1. New `apps/mcp-server/src/__tests__/HCM-DISAMBIG-*.test.ts` adds AT LEAST the following cases ALL GREEN:
   - "Vietnam Airlines TPHCM-Phuket strategic expansion" → `affectedActions` MUST NOT contain `HCM` (this is THE #4144 regression case)
   - "Giá vàng tại TP. HCM hôm nay" → MUST NOT contain `HCM`
   - "Tp.HCM mở rộng metro line 3" → MUST NOT contain `HCM`
   - "TP-HCM họp về quy hoạch" → MUST NOT contain `HCM`
   - "Cổ phiếu HCM đóng cửa tăng 2%" → MUST contain `HCM` (positive case — ticker context)
   - "HCM (mã CK) công bố LNST quý 1" → MUST contain `HCM` (parenthetical positive case)
   - "Chứng khoán Hồ Chí Minh báo lãi" → MUST contain `HCM` (alias positive case — regression guard for Task 1788 AC-6)
   - "Mua HCM, bán SSI" → MUST contain `HCM` (trailing comma)
   - "Đề xuất mua HCM)" → MUST contain `HCM` (trailing paren — legitimate ticker)
2. Existing Task 1788 test suite (`1788-hcm-geographic-false-positive.test.ts`) STAYS GREEN — zero regressions.
3. Existing Task 1198 VND currency guard, Task 1206 false-match guards, Task 1322 alias tests STAY GREEN — zero regressions to other tickers.
4. `docs/agents/unified-agent/flow/chef.md` Block A "Format rules" list contains the explicit "HCM (mã) vs TP. HCM" disambiguation line.
5. QA gate (per QA acceptance below) replays the #4144 exact headline + 3 additional adversarial headlines through the LIVE `newsNormalizer` and confirms `affectedActions` is clean.
6. After ops rebuild of mcp-server, next news-scout cycle emits at least one signal with HCM-adjacent text (organic or injected fixture) and shows correct extraction in the actual `docs/signals/news_impact_*.json` file.

## Acceptance Criteria (PO sign-off gates)

- `qa` cannot pass without ALL Success Metric items.
- `qa` must inject the #4144 exact headline string ("Vietnam Airlines TPHCM-Phuket strategic expansion") AND a "Tp.HCM" mixed-case form AND a "TP-HCM" hyphen form AND verify NO HCM ticker emission for any of the three.
- `qa` must also inject one POSITIVE ticker case ("Chứng khoán HCM (HCM) báo lãi quý 1") and confirm HCM IS extracted — the guard MUST NOT over-block.
- `dev` MUST update related docs (`docs/agents/unified-agent/flow/chef.md` change is in-sprint; `docs/architecture/microservice/mcp-server/` if architect briefs a doc change there per `dev-* doc-ownership` rule).
- `developer` agent type must NOT be used — route to `dev-mcp-server` zone specialist for extraction code AND chef.md prompt (chef.md is owned by `dev-mcp-server`-adjacent or by the cowork-refactory expert; pm to confirm in atomization).
- All work on `main` — NO branches.
- Commit messages follow `docs/policies/commit-convention.md`.
- After fix: run `/graphify docs --update --no-viz` per `feedback_dev_doc_graphify`.

## Day-0 constraints (PO autonomous decisions — BA/architect must NOT re-litigate)

- HCM stays on the watchlist; do NOT propose removing it just because of the clash (memory `user_watchlist` — 30 tickers, Securities sector needs HCM peer alongside SSI/VND/VCI/VIX).
- Look-behind window stays at 10 chars unless architect proves a real headline pattern requires a wider one (cite the failing case).
- Do NOT introduce a separate "city-blocklist" module — extend the existing `GEOGRAPHIC_CONTEXT_MAP` in `newsNormalizer.ts`. The pattern is proven; we are reinforcing, not refactoring.
- Block A spec change is a PROMPT-ONLY edit (chef.md is a flow doc, no Go/TS code). No microservice rebuild required for the chef.md change to take effect — next unified-agent cron tick reads the file fresh.
- Extraction code change DOES require ops to FORCE-RECREATE mcp-server (not restart — stale image — memory `feedback_rebuild_after_dev_change`).

## Risk + non-goals

- **R-1 Over-block.** If the look-behind window is widened too far, "HPG đặt nhà máy tại TP.HCM nhưng HCM hôm nay..." (legitimate ticker mention in same sentence as geographic ref) could be over-blocked. Mitigation: look-behind is 10 chars and immediately-before only; the second `HCM` would not see `tp.` in its window.
- **R-2 Alias path bypass.** Pattern 3 (alias-based) calls `detectStocksInText()` which is in a separate file (`stockAliases.ts`); its `HCM` aliases are `chứng khoán hồ chí minh` / `hcm securities` — neither of those phrases overlaps with the city abbreviation, so the alias path is structurally safe. Architect MUST confirm by reading `stockAliases.ts` HCM entry; if a city-like alias exists, that is the actual bug.
- **R-3 mcp-server write-wedge** (memory `project_mcp_server_write_wedge`). After ops rebuild, QA must read a fresh `docs/signals/news_impact_*.json` produced AFTER rebuild and confirm the extractor change is live — not just trust container "healthy".
- **R-4 Fence false-green** (memory `feedback_fence_false_green`). QA must inject the #4144 headline; running `bun test` alone proves nothing if the new test file is not picked up — verify the test FILE NAME is matched by the test runner glob.

---

> Lazy-loaded by: `po/review-ba-spec.md` after BA returns spec; `pm` during task atomization.
