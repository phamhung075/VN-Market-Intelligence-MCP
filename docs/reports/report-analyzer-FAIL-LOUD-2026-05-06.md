# Report Analyzer — FAIL LOUD

**Cycle:** 2026-05-06 (scheduled run)
**Agent:** report-analyzer
**Status:** ABORTED — MCP server unreachable

---

## What happened

Scheduled task `vn-report-analyzer` triggered. Cycle could not start — the VN Market Intelligence MCP server at `https://zenmidi.com/mcp` is not reachable from this execution environment, and no equivalent MCP connector is registered.

## Evidence

| Check | Result |
|---|---|
| DNS `zenmidi.com` | resolves to `127.0.0.1` (localhost) inside sandbox |
| `curl https://zenmidi.com/mcp` | `connection refused` (port 443 closed on 127.0.0.1) |
| `mcp-registry` connector search (`vn`, `market`, `intelligence`, `stock`, `zenmidi`) | 0 connectors installed |
| Generic `call_tool` with server names `vn-market-intelligence`, `zenmidi`, `vn-mcp` | `unknown server` for all |
| Pipeline state | `idle` (last update 2026-05-05 06:30 UTC by dev-team-cron) |

## Consequence

Every step in the cycle SKILL.md depends on MCP tools served by this endpoint:
- Step 0: `get_agent_signals` — unreachable
- Step 1: `get_market_context`, `get_user_positions_for_analysis` — unreachable
- Step 2: `get_bctc_full`, `get_sector_comparison`, `get_kinhdich_reading`, `get_market_summary`, `generate_market_summary` — unreachable
- Step 3: `get_insider_signals`, `get_legal_risk_signals`, `post_agent_signal` — unreachable
- Step 3.5: `get_open_chain_findings` — unreachable
- Step 5: `submit_feedback`, `get_recent_fixes` — unreachable

No financial analysis, no signal posting, no feedback submission was performed. Zero data was written to any tracked store via MCP this cycle.

## Why fail-loud (not silent fallback)

`fail-loud-protocol.md` is explicit: "Silent fallback is worse than no output." Producing analysis from stale local files (e.g. `data/pdfs/BCTC VEA 31.12.2025...`, `BCTC VNM 31.12.2025...`) without the live financial DB, sector comparison, insider signals, or Kinh Dich layer would yield a hallucinated, displaced report. Refused.

## Cannot self-escalate via standard channels

The protocol says step 1 is `send_telegram(channel="bug", ...)` and step 2 is `submit_feedback(...)`. Both require the same unreachable MCP server. Self-escalation via the documented channel is not possible from this run. This file is the substitute fail-loud artifact.

## What the user (or ops) needs to fix

1. Confirm `zenmidi.com` is the correct production MCP host. The sandbox resolver maps it to `127.0.0.1`, suggesting either (a) the host is meant to be local-only and should be reached on the user's own machine where DNS is configured, or (b) the production endpoint moved and `SKILL.md` is stale.
2. If (a): scheduled tasks should run on the host where the MCP server is reachable, not in a remote sandbox. Verify the cowork/scheduled-task runtime has an MCP connector pointing at the live server.
3. If (b): update the MCP server URL in the scheduled task SKILL.md and any cron-registry entry referencing it.
4. After the connector is restored, dispatch `ops` → `get_vps_service_health()` to confirm BCTC pipeline health before re-enabling this scheduled task (per CLAUDE.md prerequisite #2).

## Local data observed (not analyzed)

Two BCTC PDFs are present locally but were not opened — without `get_bctc_full` and the financial DB, isolated PDF parsing breaches the Step 2 rule and the SKILL.md "BANNED" clause against `read_bctc_pdf` every cycle:
- `BCTC VEA 31.12.2025 - RIENG - VN.pdf`
- `BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`

## Pipeline state — not modified

`docs/pipeline-state.json` left at `idle`. This run did not advance the dev-team chain because no analysis was produced. Manual ops intervention required.
