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

> **Gateway-down handling:** If MCP gateway call fails → send BUG one-line error → EXIT. Do NOT switch to "file-evidence mode" — session logs contain PAST state that may be wrong. Auditing from stale files produces hallucinated findings. Report the failure and exit.
