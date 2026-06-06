# Architecture Brief — Headroom Context Compression Integration

**Date:** 2026-06-06
**Author:** agents-architect
**Status:** PROPOSAL — pending PO sprint triage
**Owner zone:** dev-mcp-server (primary), dev-api-gateway (secondary, read-only)
**Signal:** `docs/signals/headroom-context-compression-20260606T184634Z.json` → po

---

## 1. Problem Statement

The VN-Market-Intelligence-MCP system runs a continuous fleet of cowork agents (15-min dispatcher, 3×/day chef, market-watcher, news-scout, alert-commander, tran-ngoc-bau) and a dev-team hourly tick, all consuming large vn-market tool outputs through the `claude.ai gateway` call_tool proxy. The heaviest tool payloads are:

| Tool | Estimated payload | Consumers |
|---|---|---|
| `get_cycle_bootstrap` | ~8–15k tokens (30-ticker snapshot + macro + news batch) | cowork dispatcher, every 15min |
| `get_bctc_full` / `get_bctc_refined` | ~4–12k tokens per ticker, up to 10 tickers/run | financial-analyst, tran-ngoc-bau |
| `get_market_snapshot` | ~3–6k tokens (HOSE/HNX/UPCOM 30-ticker quote block) | market-watcher, alert-commander |
| `fetch_news_batch` | ~4–8k tokens (Reuters + Bloomberg + VN domestic) | news-scout, unified-agent |
| `get_portfolio_conviction` | ~2–4k tokens | unified-agent, alert-commander |

The existing token-economy skill (ULTRA/FULL/LITE 3-tier prose compression) operates on **agent-to-agent message passing** — it does not touch raw tool output payloads arriving from vn-market before they enter agent context. This is the gap Headroom addresses: compressing the tool response payload layer before it becomes context tokens.

At the cowork dispatcher frequency (15min × ~12k tokens = ~800k+ tokens/day before any analysis), even a conservative 50% reduction on bootstrap payloads would cut context costs materially.

---

## 2. Architecture Evaluation

### 2.1 Candidate Integration Points

#### (a) Gateway-side compression — SELECTED AS PRIMARY
Inject Headroom SmartCrusher (JSON-mode, no ML) inside `apps/mcp-server/src/` as a TypeScript post-processing layer on tool responses. Specifically: wrap the `call_tool` response handler in `mcp-server` so that any tool response with `content[].text` larger than a configurable threshold (e.g. 4k chars) passes through `headroom-ai` SmartCrusher before being returned to the calling agent.

**Rationale:**
- Single injection point in a service already owned by `dev-mcp-server`.
- Affects all 146 downstream vn-market tools transparently — zero per-agent changes.
- SmartCrusher and CacheAligner are non-ML (no HuggingFace model load) — safe on 16GB host.
- TypeScript/Node runtime matches mcp-server's Bun/TS stack — `npm install headroom-ai` (core package without `[ml]` extra).
- No new containers. No port changes. No CF tunnel impact.
- Exemption list is encodable per-tool as a passthrough bypass map.

#### (b) Router CLI wrap — REJECTED
`headroom wrap claude` wraps the entire Claude CLI process, intercepting all API traffic. Blast radius includes git commits, Telegram sends (`send_telegram`), and signal writes — all live fleet operations. A compression artifact that mangles a `git add` path or a Telegram message content would be catastrophic and irreversible. This option is not acceptable for an autonomous commit-and-publish fleet.

#### (c) Headroom MCP server mode — REJECTED for v1
Registering Headroom as a downstream MCP server via the claude.ai gateway adds tools to the tool surface. System policy deliberately keeps tool surface small (146 tools already). CCR retrieval tools would add `compress`/`retrieve` pairs. Additionally, every agent would need to learn when to call these tools explicitly — high coordination cost. May be revisited in v2 if CCR reversible compression is needed.

#### (d) Hybrid/phased — ADOPTED AS ROLLOUT STRATEGY
The recommended approach is gateway-side (option a) rolled out in phases, starting with SmartCrusher on the 3 highest-volume tools only (get_cycle_bootstrap, get_market_snapshot, fetch_news_batch), with explicit financial data exemptions, before expanding.

### 2.2 Boundary with Existing Token Economy

- **Existing token-economy skill** compresses agent-to-agent prose messages (RETURN blocks, handoffs, pings) — operates AFTER tool output is already in agent context.
- **Headroom** compresses tool output payloads BEFORE they enter agent context — upstream of the token-economy layer.
- No double-compression risk: Headroom processes `tool_response.content[].text` → compressed JSON string → agent receives and reads → agent produces RETURN block → token-economy compresses that outbound message.
- The boundary is: `vn-market tool → headroom (mcp-server layer) → agent context → token-economy (prose layer)`.

---

## 3. Primary Recommendation

**Implement Headroom SmartCrusher as a TypeScript middleware layer inside `apps/mcp-server`'s `call_tool` response handler path, gated on payload size > 4k chars, with an explicit financial-data exemption list for numeric-sensitive tools, piloted on the 3 highest-volume non-financial tools first.**

This is the lowest blast-radius, highest-leverage integration point. It requires no new containers, no new MCP tools, no per-agent changes, and operates entirely within the `dev-mcp-server` ownership zone. The non-ML Headroom components (SmartCrusher for JSON, CacheAligner for prefix stability) are appropriate for the 16GB-capped host environment.

---

## 4. Hard Constraints

| Constraint | Enforcement |
|---|---|
| 16GB Mac host; Docker capped 8GB | Only SmartCrusher + CacheAligner (non-ML). Do NOT install `headroom-ai[ml]` or `[memory]` extras. The HuggingFace Kompress-base model is excluded from v1. |
| Must not break gateway call path | Headroom wraps the RESPONSE side only — never intercepts the outbound call_tool request. Any error in compression must fall through (passthrough on exception). |
| Must not break Telegram webhook | Headroom has no involvement in the webhook path (zenmidi.com/vn-market/webhook via CF tunnel is an inbound HTTP path, not a tool response path). |
| Must not break VPS pull pipeline | VPS push → mcp-server `/api/push-*` endpoints are HTTP ingress, not tool responses. Headroom is not in this path. |
| Tool surface stays small | No CCR retrieval tools added. SmartCrusher operates inline; no new MCP tools exposed. |
| No mass-start | Only mcp-server is rebuilt and restarted — `docker compose up -d --no-deps mcp-server`. |

---

## 5. Financial Data Exemption List

The following tools MUST bypass compression entirely (passthrough mode). These tools carry numeric financial data where lossy transformation would break downstream computation, display, or balance verification.

**Exempted tools (passthrough — no compression):**
- `get_bctc_full` — BCTC balance sheet rows, VAS line codes, numeric amounts
- `get_bctc_refined` — derived BCTC metrics (ROE, ROA, NIM, debt ratios)
- `get_bctc_inspect` — raw cell values with human-confirm lock flags
- `get_price_history` — OHLCV time series (price, volume, exact floats)
- `get_portfolio_positions` — ledger entries with P&L floats
- `get_sbv_fx_rates` — FX rate numeric payloads
- `get_macro_indicators` — macro numeric snapshot (CPI, GDP, trade balance)

**Allowed for compression (non-numeric or high-redundancy JSON):**
- `get_cycle_bootstrap` — contains narrative fields, news summaries, regime labels
- `get_market_snapshot` — ticker list with repeated field structure (high SmartCrusher leverage)
- `fetch_news_batch` — news text bodies (high compression ratio expected)
- `get_sector_rotation` — trend labels, categorical data
- `get_portfolio_conviction` — narrative conviction text + hexagram labels

**Validation gate (mandatory before Phase 1 production activation):**
Run golden-output diff on 5 real tool calls per allowed tool: capture raw response, compress, decompress (if reversible), compare key numeric fields. Pass threshold: zero numeric field alteration; narrative field similarity > 0.90. Fail = add tool to exemption list.

---

## 6. Phased Rollout Plan

### Phase 1 — SmartCrusher Pilot (Scope: 3 tools, dev-mcp-server, 1 sprint)

**Deliverables:**
1. Install `headroom-ai` (core + `[code]` extra only, no `[ml]`) as a dev dependency in `apps/mcp-server/package.json`.
2. Implement `compressionMiddleware.ts` in `apps/mcp-server/src/infrastructure/compression/`:
   - Accept tool name + raw response string.
   - If tool name is in exemption list → return raw unchanged.
   - If payload < 4k chars → return raw unchanged (overhead not worth it).
   - If payload ≥ 4k chars → apply `SmartCrusher.compress(payload)` → return compressed string.
   - On any error → log to WORK channel + return raw unchanged (fail-open).
3. Wire into the `call_tool` response handler path in mcp-server's MCP protocol layer.
4. Add `HEADROOM_ENABLED=true/false` env flag in `mcp.config.json` (default false for initial deploy).
5. **Before enabling:** run golden-output validation on 5 calls each of: `get_cycle_bootstrap`, `get_market_snapshot`, `fetch_news_batch`. Record before/after token counts in `docs/data/headroom-pilot-metrics.json`.
6. Enable flag, rebuild mcp-server only (`docker compose up -d --no-deps mcp-server`).
7. Monitor 48h: check WORK channel for compression errors; verify financial tools return bit-exact data.

**Gate to Phase 2:** measured token reduction ≥ 30% on pilot tools AND zero financial data errors in 48h monitoring window.

**Memory budget:** SmartCrusher is a pure-Python/TS JSON transform with no model weights. Estimated memory overhead: < 50MB per mcp-server process. Well within the 8GB Docker cap.

### Phase 2 — Expand to Full Allowed List (gated on Phase 1 proof)

Extend compression to all tools in the "allowed" list above. Add CacheAligner for prefix stability (reduces KV-cache misses on repeated tool calls within a cowork session). Measure fleet-wide token reduction vs Phase 1 baseline.

**Gate to Phase 3:** 7-day sustained operation with zero regressions in financial data serving (verify via `get_bctc_full` before/after spot checks by tran-ngoc-bau agent).

### Phase 3 — CacheAligner + Metrics Dashboard (gated on Phase 2 proof)

Enable CacheAligner on the highest-frequency tools (get_market_snapshot, get_cycle_bootstrap) for prefix stabilization — this helps Claude's KV-cache hit rate by keeping the compressed tool output structure stable across calls. Add a metrics endpoint to mcp-server reporting compression ratio per tool call for system-auditor consumption.

**Out of scope permanently (unless separate greenlight):**
- Kompress-base (HuggingFace ML model) — memory risk on 16GB host.
- CCR reversible compression — adds tool surface; not approved.
- `headroom wrap claude` (CLI wrap) — blast radius unacceptable.
- `headroom proxy` (ASGI middleware) — requires new port/container; not needed for this path.
- CodeCompressor — mcp-server tool responses are JSON, not source code; not applicable.

---

## 7. Rollback Path

| Step | Rollback action |
|---|---|
| Phase 1 pilot causes data errors | Set `HEADROOM_ENABLED=false` in mcp.config.json → `docker compose up -d --no-deps mcp-server` → 0 downtime rollback |
| Compression library crash loop | Fail-open design: any exception in `compressionMiddleware.ts` returns raw payload → mcp-server continues operating |
| npm package introduces security issue | `npm uninstall headroom-ai` → rebuild → rollback |
| Phase 2 breaks financial data | Add all affected tools to exemption list → redeploy → no rollback of Phase 1 needed |

---

## 8. Owner Zones and Responsibilities

| Concern | Owner |
|---|---|
| `compressionMiddleware.ts` implementation | dev-mcp-server |
| `mcp.config.json` flag addition | dev-mcp-server |
| Golden-output validation suite | qa (FastAPI TestClient equivalent for mcp-server tool responses) |
| Financial data spot-check verification | tran-ngoc-bau (live tool calls, not badge-based) |
| Phase 1 monitoring (WORK channel) | system-auditor Tier-3 |
| Phase 2+ decision | po (reads Phase 1 metrics gate file) |

---

## 9. DO-NOT List

- DO NOT install `headroom-ai[ml]` or `headroom-ai[memory]` extras — memory risk.
- DO NOT compress `get_bctc_full`, `get_bctc_refined`, or any tool in the exemption list.
- DO NOT add CCR retrieve/compress as MCP tools.
- DO NOT use `headroom wrap claude` or `headroom proxy` mode.
- DO NOT compress payloads < 4k chars (overhead exceeds benefit).
- DO NOT enable in production before golden-output validation passes.
- DO NOT run the Kompress HuggingFace model on this host in v1.
- DO NOT compress tool request payloads — only compress response payloads.
- DO NOT restart more than mcp-server during Phase 1 deploy.

---

## 10. Files to Create / Edit (for agent-father / dev-mcp-server)

| File | Action | Notes |
|---|---|---|
| `apps/mcp-server/package.json` | Add `headroom-ai` (core, no extras) dependency | Bun-compatible; verify npm compat |
| `apps/mcp-server/src/infrastructure/compression/compressionMiddleware.ts` | CREATE | SmartCrusher wrapper with exemption list, fail-open |
| `apps/mcp-server/src/infrastructure/compression/exemptionList.ts` | CREATE | Typed list of tool names that bypass compression |
| `apps/mcp-server/src/infrastructure/compression/goldenOutputValidator.ts` | CREATE | Phase 1 validation harness — 5-call before/after diff |
| `mcp.config.json` | ADD `headroom.enabled: false` flag + `headroom.minPayloadChars: 4000` | Loaded by existing config loader |
| `docs/data/headroom-pilot-metrics.json` | CREATE (by qa/dev-mcp-server during Phase 1) | Token before/after per tool, Phase 1 gate proof |
| Wire point in mcp-server tool response handler | EDIT (dev-mcp-server identifies exact file) | Wrap after vn-market tool response, before returning to calling agent |

**dev-mcp-server must identify the exact file handling tool response serialization in `apps/mcp-server/src/` before implementation — do not guess the path.**

---

## PO Critique

**Critiqued by:** po · 2026-06-06T21:30Z · signal `headroom-context-compression-20260606T184634Z` · Created by: agents-architect (non-pilot → routing-by-outcome)

**(1) What could break:** Every cowork agent consuming the 3 pilot tools through the gateway — cowork dispatcher (`get_cycle_bootstrap`, 15-min cadence), market-watcher + alert-commander (`get_market_snapshot`), news-scout/unified-agent (`fetch_news_batch`). Critical flaw in the allowed-list: `get_market_snapshot` carries NUMERIC ticker quotes (price, change %, volume) that feed alert-commander stop-loss logic — it belongs on the exemption list by the brief's own criterion ("numeric financial data where lossy transformation would break downstream computation"). The "repeated field structure = high SmartCrusher leverage" framing optimizes for compression ratio over data class. Misclassification here corrupts live alerting, the highest-stakes consumer in the fleet.

**(2) False-green / silent-swallow risk:** YES, two. (a) Fail-open passthrough-on-exception logs to WORK channel only — a chronically erroring compressor degrades to silent no-op while the pilot reports "enabled, no errors"; needs an error-count metric in the gate file, not just channel noise. (b) The 48h "zero financial data errors" gate is observational absence-of-evidence: nothing in the plan would DETECT a subtly mutated numeric field in a compressed payload (exempted tools are bit-exact by construction; allowed tools are exactly where mutation can hide).

**(3) Is the success signal gameable:** YES. `docs/data/headroom-pilot-metrics.json` is authored by the same dev-mcp-server implementing the compressor; "narrative similarity > 0.90" is self-graded with no specified measure; "token reduction ≥ 30%" is trivially achievable by crushing harder — the two gate axes trade off against each other with only one independently checked. Per fence-false-green lesson, the validator must be PROVEN-RED: QA injects a deliberate numeric mutation into a compressed payload and the golden-output gate MUST fail; a validator that never fired red proves nothing.

**(4) Host-load impact:** Acceptable. SmartCrusher/CacheAligner non-ML, no model weights, claimed <50MB inside the existing mcp-server process; no new containers; deploy = `--no-deps mcp-server` rebuild only (complies with no-mass-start, 8GB Docker cap, host-memory-panic constraints). Residual: "pure-Python/TS" is vague — if `headroom-ai` drags a Python runtime into the Bun image, footprint and image size claims are unverified; dev must confirm the dependency shape before install.

**(5) Lane-C-in-disguise check (C-3):** NO on gate-logic (compressor doesn't edit any audit/gate code), NO on loop-own-success-criteria, NO on irreversible action (env-flag rollback, default-off), NO on user-facing comprehensibility (MARKET prose is agent-authored downstream). BUT it sits UPSTREAM of every consumer's inputs including detector agents — borderline, handled via conditions not reclassification. Stays LANE-B.

**VERDICT: APPROVED-LANE-B — DEFERRED (P3).** Rationale: sound integration point (response-side middleware, fail-open, flag-gated, exemption list, phased) and real token pressure (~800k+/day at dispatcher cadence). Deferred because P3-LOW vs current capacity: WORKFLOW-FLUIDITY active (WF-2/WF-3 open) + new user-reported HIGH frontend sprint this tick. Backlog row `HEADROOM-COMPRESS-P1` filed; pick up after WORKFLOW-FLUIDITY signoff.

**Binding conditions (BA must encode as AC):**
1. Move `get_market_snapshot` from allowed → exemption list for Phase 1. Pilot = `get_cycle_bootstrap` + `fetch_news_batch` only (substitute `get_sector_rotation` if a 3rd is wanted).
2. Golden-output validator PROVEN-RED by QA (injected numeric mutation must fail the gate) before `HEADROOM_ENABLED=true`.
3. Gate file must include compression error/passthrough-exception counts; >0 unexplained errors in 48h window = Phase 2 gate fails.
4. Defined similarity measure for the 0.90 narrative threshold (named algorithm, not judgment call).
