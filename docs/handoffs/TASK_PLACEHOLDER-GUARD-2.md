# TASK — PLACEHOLDER-GUARD-2: Env-Fallback Conversion (6 VPS Crawler Scripts)

**Task ID:** PLACEHOLDER-GUARD-2  
**Sprint:** VPS-DEPLOY-PLACEHOLDER-GUARD  
**Owner:** dev-vps-crawls  
**Estimated:** ≤2h  
**Status:** READY  
**Baseline:** All 6 scripts renderable by `scripts/deploy-vps-proxy.sh` sed rules post-conversion.

---

## Scope

Convert all 6 hardcode-form VPS crawler scripts to the safe `${VAR:-default}` shell expansion form. Mirrored from the proven pattern in `vps-scripts/fetch-foreign-flow.sh` L32–34.

### Files to modify (all in `vps-scripts/`)

1. `fetch-vn-news.sh` — L7, L8
2. `fetch-gso.sh` — L8, L9
3. `fetch-sbv.sh` — L7, L8
4. `fetch-tradingeconomics.sh` — L7, L8, L9 (special case: L9 uses empty fallback)
5. `fetch-prices.sh` — L15, L16, L17, L18
6. `enrich-bctc-urls.sh` — L8, L9, L10

---

## Acceptance Criteria

**AC-1:** After conversion, grep for `__[A-Z_]*__` shows placeholders ONLY inside shell expansions as fallback defaults (e.g., `${VN_NEWS_API_URL:-__MCP_BASE__/api/push-news}`), NOT as bare assignments (e.g., `API_URL="__MCP_BASE__/api/push-news"`). Confirmed for all 6 scripts.

**AC-2:** For `fetch-tradingeconomics.sh` L9 specifically: `grep 'TE_API_KEY' vps-scripts/fetch-tradingeconomics.sh` shows `${TRADING_ECONOMICS_API_KEY:-}` (empty string fallback, NOT `__TE_API_KEY__`). This avoids GUARD-1's pre-scp assert false-blocking the TE script (which has no sed rule for `__TE_API_KEY__`).

**AC-3:** All 6 scripts remain valid shell syntax after conversion (no syntax errors when linted locally).

**AC-4:** Baseline preserved: after `sed -e "s|__MCP_BASE__|https://zenmidi.com|g" -e "s|__API_KEY__|real_key|g"` render, all 6 produce valid rendered output with no `__...__` tokens remaining (proven locally for each).

---

## Conversion Table (from BA spec)

| File | Line | Current hardcode | Converted form | Env var |
|---|---|---|---|---|
| fetch-vn-news.sh | L7 | `API_URL="__MCP_BASE__/api/push-news"` | `API_URL="${VN_NEWS_API_URL:-__MCP_BASE__/api/push-news}"` | `VN_NEWS_API_URL` |
| fetch-vn-news.sh | L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |
| fetch-gso.sh | L8 | `API_URL="__MCP_BASE__/api/push-gso"` | `API_URL="${GSO_API_URL:-__MCP_BASE__/api/push-gso}"` | `GSO_API_URL` |
| fetch-gso.sh | L9 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |
| fetch-sbv.sh | L7 | `API_URL="__MCP_BASE__/api/push-sbv-rates"` | `API_URL="${SBV_API_URL:-__MCP_BASE__/api/push-sbv-rates}"` | `SBV_API_URL` |
| fetch-sbv.sh | L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |
| fetch-tradingeconomics.sh | L7 | `API_URL="__MCP_BASE__/api/push-tradingeconomics"` | `API_URL="${TE_PUSH_URL:-__MCP_BASE__/api/push-tradingeconomics}"` | `TE_PUSH_URL` |
| fetch-tradingeconomics.sh | L8 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |
| fetch-tradingeconomics.sh | L9 | `TE_API_KEY="__TE_API_KEY__"` | `TE_API_KEY="${TRADING_ECONOMICS_API_KEY:-}"` | `TRADING_ECONOMICS_API_KEY` |
| fetch-prices.sh | L15 | `API_URL="__MCP_BASE__/api/push-prices"` | `API_URL="${PRICES_API_URL:-__MCP_BASE__/api/push-prices}"` | `PRICES_API_URL` |
| fetch-prices.sh | L16 | `FOREIGN_FLOW_URL="__MCP_BASE__/api/push-foreign-flow"` | `FOREIGN_FLOW_URL="${PRICES_FF_URL:-__MCP_BASE__/api/push-foreign-flow}"` | `PRICES_FF_URL` |
| fetch-prices.sh | L17 | `WATCHLIST_URL="__MCP_BASE__/api/watchlist"` | `WATCHLIST_URL="${PRICES_WATCHLIST_URL:-__MCP_BASE__/api/watchlist}"` | `PRICES_WATCHLIST_URL` |
| fetch-prices.sh | L18 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |
| enrich-bctc-urls.sh | L8 | `API_ENRICH_URL="__MCP_BASE__/api/enrich-queue-item"` | `API_ENRICH_URL="${BCTC_ENRICH_URL:-__MCP_BASE__/api/enrich-queue-item}"` | `BCTC_ENRICH_URL` |
| enrich-bctc-urls.sh | L9 | `QUEUE_URL="__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true"` | `QUEUE_URL="${BCTC_QUEUE_URL:-__MCP_BASE__/api/bctc-fetch-queue?skip_enrichment=true}"` | `BCTC_QUEUE_URL` |
| enrich-bctc-urls.sh | L10 | `API_KEY="__API_KEY__"` | `API_KEY="${API_KEY:-__API_KEY__}"` | `API_KEY` |

---

## Notes

- **Line numbers are advisory.** Before editing, verify with `grep -n` on each file to confirm the exact line containing the hardcode.
- **The `fetch-tradingeconomics.sh` L9 case is critical.** Use empty-string fallback `${TRADING_ECONOMICS_API_KEY:-}`, NOT `${TRADING_ECONOMICS_API_KEY:-__TE_API_KEY__}`. This avoids the GUARD-1 regex false-blocking when the deployer has no sed rule for `__TE_API_KEY__`.
- **Existing guards preserved.** `fetch-tradingeconomics.sh` L13–17 already has a `__TE_API_KEY__` self-guard that exits cleanly when the key is empty or still a literal placeholder. That guard remains active and correctly handles the empty-string fallback.
- **Mirror reference:** Consult `vps-scripts/fetch-foreign-flow.sh` L32–34 for the exact expansion syntax and spacing.

---

## Handoff References

- **BA spec:** `docs/handoffs/TASK_VPS-PLACEHOLDER-GUARD.md` (§GUARD-2, lines 89–126)
- **Architect brief:** `docs/architecture-briefs/2026-06-01-vps-deploy-placeholder-guard.md` (§3.2, conversion table + rationale)
- **Safe reference:** `vps-scripts/fetch-foreign-flow.sh` L32–34
- **Existing dangerous form:** `vps-scripts/fetch-vn-news.sh` L7–8

---

## Dependencies

- **Blocks:** PLACEHOLDER-GUARD-1 (optimal order: convert scripts first, then guard validates safe form survives render).
- **Blocked by:** None (VPS-BS4-INSTALL independent).

---

## DDD Layer

Infrastructure (VPS crawler scripts). No domain layer, no application layer, no interface layer.

---

## Ship Criteria

1. All 6 files edited, syntax valid, rendered correctly (proven locally via sed).
2. All 4 acceptance criteria met.
3. One commit per file (scoped `git add <file>`) on `main`.
4. No Docker rebuild required.
