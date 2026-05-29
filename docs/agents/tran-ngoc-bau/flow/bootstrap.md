> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Bootstrap

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `tran-ngoc-bau`)

**Step 0b-DASH — Read signal dashboard** → skill: `.claude/skills/signal-dashboard/SKILL.md` (§ READ)
- Scan `## tran-ngoc-bau` section for NEW rows.
- For each NEW row: read payload → add to audit context. Mark READ.
- Log: `"[dashboard] {N} new signals"` or `"[dashboard] inbox empty"`.
- If DASHBOARD.md missing → skip, never fail.

**Step 0b2 — Check previous handoff ACK**

If `docs/handoffs/tnb-audit-latest.md` exists, check for `## PO ACK` section at the bottom:
- **ACK present** → PO read previous cycle. Log `"Previous handoff ACK'd by PO"`. Proceed.
- **ACK missing** → PO never processed previous findings. Log `"Previous handoff NOT ACK'd by PO — findings may be lost"`. Flag in session log. Include this in Step 9 findings as a persisting blocker.

**Step 0c — Bootstrap**
- Load `docs/policies/alert-policy.md` (fail-loud)
- Load `docs/standards/alert-message-format.md` (fail-loud)
- Load `docs/standards/tnb-methodology.md` (fail-loud) — the Báu strategic framework. Used in Phase 2.5.
- `get_macro_snapshot()` → extract REGIME, CARRY_REGIME, DXY_SIGNAL, US10Y_SIGNAL
- `get_system_status()` → confirm infrastructure healthy. If DOWN → send BUG, EXIT.

> **Gateway-down handling — two failure modes:**
>
> **(A) call_tool wrapper absent or transport error** — `mcp__claude_ai_gateway__call_tool` is not present in this session, or the call itself returns a connection/transport error (not an application-level status). This is most likely a **stale cron session** (session born before or during an MCP reload; tools never refreshed), NOT a fleet outage. Send BUG: `"gateway wrapper unavailable in this session — likely stale session, recommend session reload"`. EXIT. Do NOT claim the gateway or infrastructure is down.
>
> **(B) Gateway reachable, `get_system_status` reports infrastructure DOWN** — gateway responded but the status payload contains real failures. Send BUG with the status detail. EXIT.
>
> **FORBIDDEN diagnosis:** Never cite `.mcp.json` (empty or not) as evidence of an outage. `.mcp.json` is intentionally empty by design — the gateway is reached only via the `call_tool` wrapper, not via direct server registration. "No servers registered in `.mcp.json`" is NOT a failure condition.
>
> Do NOT switch to "file-evidence mode" in either case — session logs contain PAST state that may be wrong. Auditing from stale files produces hallucinated findings. Report the failure and exit.
