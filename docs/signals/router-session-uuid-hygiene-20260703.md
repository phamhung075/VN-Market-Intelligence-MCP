# Repair: session-UUID hygiene — agents commit raw owner_client_session into notebooks + `.claude/tmp` is tracked (111 snapshots carry it)

- **Filed:** 2026-07-03 by router (surfaced during RAW-verify of FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK, dev-team 17:49Z closeout)
- **Type:** repair_task_request → PO → backlog (PLAN-ONLY). Two separable sub-fixes under one root theme — PO may split.
- **Suggested task id:** `CHORE-SESSION-UUID-HYGIENE` (split candidates: `CHORE-GITIGNORE-CLAUDE-TMP` + `FIX-AGENT-NOTEBOOK-UUID-PROVENANCE`)
- **Severity:** MEDIUM. The leaked value is the **ephemeral** `owner_client_session` / `CLAUDE_CODE_SESSION_ID` coordination token (task-lock release-matching), NOT a durable API credential — impact is coordination-integrity (a peer who knew it could forge `task_release` of this session's locks) + repo debt/bloat, not a data breach. Pre-existing, non-blocking.

## Finding

Standing directive: the session UUID is a coordination parameter passed as `owner_client_session` in MCP task-lock args ONLY — **NEVER** committed to a tracked file. RAW-verifying the dev-mcp-server sprint exposed two live violations:

### (A) Agents write the raw UUID into committed notebooks — RECURRING
`docs/agent-memory/notebooks/dev-mcp-server.md` had `**Session:** <UUID> (router-dispatched...)` lines in **multiple** entries (2026-07-02 TASK-DASH-CRON-1, 2026-07-03 FIX-SEARCH-SIMILAR, 2026-07-03 FIX-LEGAL-RISK). The FIX-LEGAL-RISK line (added by commit `9967785e4`, unpushed) was scrubbed by the router via `--amend` (→ `ce4051a7b`, now `**Provenance:** router-dispatched (...)`). The earlier lines were committed by prior commits and are already in origin history. This is a pattern the agent repeats every cycle — likely present in other agents' notebooks/journals/decision-journals too.

### (B) `.claude/tmp/` is NOT gitignored → 111 tracked snapshots, each carrying the UUID
`git ls-files .claude/tmp/orch-hook-proposal-*.json` → **111** tracked files; `git check-ignore` → NOT ignored. Each contains `"session": "<UUID>"` and `"claimed_by": "<UUID>"` (orch-apply hook proposal snapshots). These are transient hot-file hook artifacts that should never be committed — both a UUID leak and pure repo bloat.

## Scope / Proposed fix

**(A)** Audit ALL agent memory outputs (`docs/agent-memory/notebooks/*.md`, `sessions/*.md`, `decisions/*.md`, `reports/*.md`) for raw `owner_client_session`/`CLAUDE_CODE_SESSION_ID` values. Fix the agent instructions (agent-father) so agents record dispatch provenance as `(router-dispatched)` or a non-credential tag — never the raw UUID. Add a pre-commit guard or CI grep that fails if a committed diff contains a UUID matching the session-token shape.

**(B)** Add `.claude/tmp/` to `.gitignore`; `git rm --cached` the 111 tracked `orch-hook-proposal-*.json` (verify `scripts/orch-apply.sh` writes these as scratch and does NOT depend on them being tracked — it almost certainly only reads/writes them transiently). Confirm the orch-apply pipeline still validates+applies after untracking.

**History:** deep rewrite (`git filter-repo`) of the already-pushed historical occurrences is NOT recommended — the token is ephemeral (dies at session end) and the cost/risk of rewriting shared origin history far exceeds the benefit. Forward-fix (A)+(B) + rotating away from committing it is the correct scope.

## Evidence

- `git ls-files ".claude/tmp/orch-hook-proposal-*.json" | wc -l` → 111; `git check-ignore .claude/tmp/orch-hook-proposal-1782804612500.json` → not ignored.
- dev-mcp-server notebook lines 5, 17, and the FIX-LEGAL-RISK entry (pre-amend) all `**Session:** <UUID>`.
- Router remediation this cycle: amend `9967785e4`→`ce4051a7b` (FIX-LEGAL-RISK line only — the sole unpushed occurrence).
- Related: [[feedback_subagent_force_add_secret_leak]] (agent-side secret-into-git class).
