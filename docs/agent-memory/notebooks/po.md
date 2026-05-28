# PO Notebook

## Cycle 2026-05-28T21:23Z — Sprint HCM-DISAMBIG kickoff (USER bug report, content-accuracy tier)

User reported a HIGH-priority MARKET/WORK content bug: agents could conflate `HCM` (Securities ticker, HOSE-listed, peer of SSI/VND/VCI/VIX per `stock-classification.json:112`) with `TP.HCM` / `TPHCM` (Vietnamese abbreviation for Thành Phố Hồ Chí Minh = the city). The non-technical user must never read an ambiguous HCM in a dish. Concrete pointer: news-scout 20:00Z cycle + signal #4144 (`docs/signals/news_impact_4144_hvn_expansion.json` headline "Vietnam Airlines TPHCM-Phuket strategic expansion").

**Recon (independent, before kickoff):**
- Existing guard: Task 1788 `GEOGRAPHIC_CONTEXT_MAP` in `apps/mcp-server/src/domain/services/newsNormalizer.ts:547` + test `1788-hcm-geographic-false-positive.test.ts`. Covers `TPHCM` / `TP HCM` / `TP.HCM` / `thành phố hồ chí minh` via 10-char look-behind on Pattern 2; alias path (Pattern 3) is structurally safe (HCM aliases are `chứng khoán hồ chí minh` + `hcm securities`, neither matches city abbreviation).
- PROOF guard worked in prod: signal #4144 has `affected_stocks: ["HVN"]` only — NO HCM leak — despite the headline saying TPHCM-Phuket. User's concern is forward-looking/coverage, not a confirmed runtime leak.
- GAPS identified: (a) `TP-HCM` hyphen / `TP. HCM` dot+space / `Tp.HCM` mixed-case NOT tested explicitly (likely work — toLowerCase() normalizes — but unproven); (b) chef.md Block A "Format rules" list has NO HCM-vs-TP.HCM disambiguation guidance — the dish writer could narrate "HCM tăng 2%" without telling the non-technical reader it is a ticker.

**Sprint scope (autonomous PO decisions — BA/architect MUST NOT re-litigate):** SPRINT-S; multi-zone (extraction + chef prompt); HCM stays on watchlist; extend `GEOGRAPHIC_CONTEXT_MAP` IN PLACE (no new module); 10-char look-behind stays unless architect cites a real failing headline; chef.md change is prompt-only (no microservice rebuild); extraction code change DOES require ops force-recreate (memory `feedback_rebuild_after_dev_change`); NO branches; commit per convention; post-fix `/graphify docs --update --no-viz`.

**Atomization dispatched (per memory `project_no_pm_ba_agent`: PM/BA both spawnable — use full chain, do NOT collapse):** HCM-BA → HCM-ARCH → HCM-PM → HCM-D1 (extraction + tests, `dev-mcp-server`) + HCM-D2 (chef.md prompt, `dev-mcp-server`) → HCM-OPS (force-recreate, ONLY after HCM-D1) → HCM-QA (injects #4144 exact headline + 3 adversarial + 1 positive, reads post-rebuild `news_impact_*.json` per `project_mcp_server_write_wedge`; verifies new test file actually picked up per `feedback_fence_false_green`) → HCM-EXIT (PO).

**SSOT:** `docs/SPRINT_GOAL_HCM-DISAMBIG.md` (9 acceptance cases + R-1..R-4 risks + day-0 constraints). TASKS.md row added at top (above MACRO-LIVE-PRICES sprint).

**NEXT:** ba | write `docs/REQ_HCM-DISAMBIG.md` for vision in `docs/SPRINT_GOAL_HCM-DISAMBIG.md`. PIPELINE: continue.

## Carry-over
- HCM stays on watchlist (Securities sector needs the peer; do NOT drop). `user_watchlist` memory unchanged.
- Backlog ticket if a 2nd ticker shows similar geographic clash (sprint scope is HCM-only by PO decision).
- If architect proves `apps/news-fetch/` has a parallel ticker extractor, re-size flag → SPRINT-M (otherwise stays SPRINT-S).
