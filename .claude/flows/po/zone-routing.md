# PO — Zone Routing Flow (Sub-flow)

**Parent flow:** `.claude/flows/po/channel-audit.md` (calls this before emitting any FIX/SPRINT) · also reusable by `triage-signals.md` / `sprint-kickoff.md` when zone needs resolving.

Single SSOT for zone assignment — every FIX/SPRINT-* task entry MUST resolve to exactly one zone here before leaving PO.

---

## Step A — Zone Inference (MANDATORY before emitting any FIX)

Resolve `zone:` for every FIX/SPRINT entry using this table before writing the task:

| Hint in BUG message / affected file | Zone | dev-* specialist |
|---|---|---|
| MCP tool / cron / market orchestration / `apps/mcp-server/` path | `apps/mcp-server/` | dev-mcp-server |
| HTTP routing / gateway / health agg / `apps/api-gateway/` | `apps/api-gateway/` | dev-api-gateway |
| price fallback / VPS bridge / quote agg / `apps/stock-price/` | `apps/stock-price/` | dev-stock-price |
| RSI / MACD / BB / indicator math / `apps/technical-analysis/` | `apps/technical-analysis/` | dev-technical-analysis |
| SBV FX / commodity / macro trend / `apps/macro-indicators/` | `apps/macro-indicators/` | dev-macro-indicators |
| hexagram / I-Ching / kinh dich / `apps/kinh-dich-service/` | `apps/kinh-dich-service/` | dev-kinh-dich |
| dedup / cooldown / Telegram dispatch / `apps/alert-engine/` | `apps/alert-engine/` | dev-alert-engine |
| BCTC / OCR / Vietnamese parse / `apps/pdf-extractor/` | `apps/pdf-extractor/` | dev-pdf-extractor |
| embeddings / LanceDB / semantic search / `apps/rag-service/` | `apps/rag-service/` | dev-rag-service |
| cross-service / root / scripts/ / Docker / shared infra | `cross-service/` | generic developer |
| affects 2+ apps/ subtrees | `multi` | architect must split |

**Rule:** every emitted FIX/SPRINT entry MUST resolve to exactly one row. If unclear → escalate to architect (don't guess).

---

## Step B — Zone Health Notebook Scan

Read the last notebook entry for each active dev-* agent and extract any "Zone health:" line:
```
docs/agent-memory/notebooks/dev-mcp-server.md
docs/agent-memory/notebooks/dev-api-gateway.md
docs/agent-memory/notebooks/dev-stock-price.md
docs/agent-memory/notebooks/dev-technical-analysis.md
docs/agent-memory/notebooks/dev-macro-indicators.md
docs/agent-memory/notebooks/dev-kinh-dich.md
docs/agent-memory/notebooks/dev-alert-engine.md
docs/agent-memory/notebooks/dev-pdf-extractor.md
docs/agent-memory/notebooks/dev-rag-service.md
```

For each notebook: scan the most recent entry for a line starting with `Zone health:`. Collect into `pendingObservations[]`. Exclude `"Zone health: no drift detected"` lines (no action needed).

For each non-trivial `Zone health:` line:
- mentions coverage drop, unused fixtures, stale tests, or doc drift → add to `pendingObservations[]` for sprint-planning consideration
- mentions a critical regression or broken test → open a FIX task immediately (treat as BUG signal); resolve `zone:` via Step A

Surface `pendingObservations[]` in notebook and optionally into sprint planning if capacity allows.

---

## Output

- Every FIX/SPRINT entry carries `zone:` (one of the rows above, `multi`, or `cross-service/`).
- `pendingObservations[]` available for downstream sprint planning.
- Control returns to caller (`channel-audit.md` or `triage-*.md`).
