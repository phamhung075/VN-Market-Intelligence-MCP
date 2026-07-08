## Task Report FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE

changed:
- scripts/agents-flow/mcp-call.sh:147-302 (new: `mcp_call_gateway_meta()` + 3 private helpers `_mcp_call_gateway_curl`/`_mcp_gateway_session_id`/`_mcp_gateway_strip_headers`; `mcp_call()` at line 93 confirmed byte-unchanged)
- scripts/agents-flow/mcp-call-gateway-meta.test.sh (new, 20 tests)
- docs/standards/gateway-call-contract.md:90-115 (new §6 Degraded Mode, incl. §6d de-escalation rule)

tests: 20/20 (mcp-call-gateway-meta.test.sh) + 20/20 (cowork-tick-preflight.test.sh, regression) + 55/55 (dev-team-tick-preflight.test.sh, regression) — all independently re-run, zero drift from developer/router numbers
shellcheck: clean | bash -n: clean
ddd: N/A (bash script, no domain/infra layering)
security: PASS — no process.env, no hardcoded secrets/tokens; `mcp-session-id` sanitized (`tr -d ' \r\n'`) before reuse as a header value; endpoint is genuinely unauthenticated (confirmed live + matches cited SPIKE §2)
verdict: APPROVED

### Independent verification beyond router's pre-verify
- Live-called (real network, not stubbed) all 3 gateway meta-tools against `https://zenmidi.com/gateway/mcp` via the actual (non-stubbed) `mcp_call_gateway_meta()`:
  - `list_servers {}` → 0, `{"servers":[{"cached_tool_count":183,"name":"vn-market",...}]}`
  - `list_server_tools {"server":"vn-market"}` → 0, tool list returned
  - `search_tools {"query":"task_claim"}` → 0, hits returned (doc-claimed-correct arg shape)
  - `search_tools {"keyword":"task_claim"}` → 1, `unexpected additional properties ["keyword"]` — byte-for-byte matches the exact error text quoted in the new §6b footgun note, corroborating the doc's factual claim rather than trusting prose.
- Confirmed `mcp_call()` (lines 41-145) untouched — diff only adds lines after its closing brace, before the standalone-CLI block.
- Confirmed scope discipline: `git diff --stat a6031047e^..c80473c93` touches exactly the 6 claimed files (script, test, doc, journal, notebook, orch-state), no `apps/*`.
- Confirmed task_board hygiene: row present in `review[]` only (index 4), absent from `in_progress[]`/`backlog[]`; `.head` untouched (`active_task_id: FACTORY-APP-split-fetchParseAndStoreBctc`) as instructed — this task's own row moved via `orch-apply.sh` only.
- DJ-GATE-1: developer journal entry confirmed present (`sprint-SYSTEMIC-REMAKE-P1-developer.md` STEP developer-S7, `task-id: FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE`); qa's own entry added (STEP qa-S23).

No blocking issues found.
