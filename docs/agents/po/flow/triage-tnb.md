# PO — Step 0-TNB: Read TNB Audit Findings (MANDATORY)

**Parent flow:** `docs/agents/po/flow/main.md` (Step 0-TNB dispatcher)

Check if `docs/handoffs/tnb-audit-latest.md` exists. If it does:

1. Read the file completely
2. Note Overall status, direction, findings table, persisting blockers, and positive signals
3. Each finding with severity `high` → must become a sprint task (Step 1)
4. Each finding with severity `med` → evaluate during sprint planning, include if capacity allows
5. Persisting blockers → check against existing TASKS.md to avoid duplicates
6. Positive signals → acknowledge in notebook (track what's working)
7. **ACK the handoff** — append to the file:
   ```markdown

   ---
   ## PO ACK
   - Read by: po
   - At: {ISO timestamp — get via `date -u +"%Y-%m-%dT%H:%M:%SZ"`, never speculate}
   - Tasks created: {list of task IDs, or "none — all GOOD"}
   - Skipped findings: {list of finding #s skipped with reason, or "none"}
   ```

If the file does not exist: log `"[po] No TNB handoff file found — skipping Step 0-TNB"` in notebook and proceed normally.

**This step feeds directly into Step 0 Channel Audit and Step 1 Sprint Planning.**
