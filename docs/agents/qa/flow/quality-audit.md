<!-- size-justification: 66L — under the 120L flag threshold, marker kept for context: atomic checklist-sync sub-flow (source-union → diff-against-live → hard verification rules → gap-escalation), 4 sequential steps each consuming the prior's output. -->
> Parent: [./main.md](./main.md)

# QA — Quality-Audit Checklist Sync (sub-flow)

**Trigger:** on-demand — user/PO/router names the "quality-audit checklist" or "freshness demand" sync explicitly; OR after `docs/architecture-briefs/2026-06-10-quality-audit-framework.md` or `docs/data/frontend-data-coverage-map.json` changes (check via `git log -1 --format=%cI -- <path>` against last sync's `_updated_at`). No cron arms this today — if a standing cadence turns out to be warranted, name it in RETURN; do not self-arm one.

## Input
None required beyond the trigger. Optional: a specific `check_id`/`cap_id` scope from the requester (else full sync).

## Output
`docs/data/quality-checklist.json` gains any demanded-but-missing rows (existing declaration pattern) + N backlog rows minted for gaps that can't be satisfied today.

---

## Step 1 — Source the demanded checklist set

Union of (reference by path — do not inline their content here):
- `docs/architecture-briefs/2026-06-10-quality-audit-framework.md` — 10-dimension (D1–D10) audit framework + capability table (§4), 38 base capabilities.
- `docs/data/frontend-data-coverage-map.json` — per-page freshness/SLA declaration (TASK-FFT-L4 self-policing SLA layer): `.rows[]` → `{page, elem, endpoint, store, writer, cadence, sla, asof, status}`. This is the live freshness-demand SSOT for frontend pages — treat every row as a demanded check.
- `docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md` + `docs/architecture-briefs/ssot-freshness-audit-2026-05-11.md` — freshness architecture briefs (rationale/context, not live declarations).
- `docs/policies/*.md` carrying SLA/freshness rules — re-glob at runtime (`grep -l "SLA\|freshness" docs/policies/*.md`); do not hardcode a filename list, it drifts. Currently resolves to `docs/policies/dev-standards.md` § Foreign-flow freshness recheck harness pointer.

## Step 2 — Diff demanded vs rendered set

Rendered set = `docs/data/quality-checklist.json` (`_ssot: true`). It is the ONLY file `apps/mcp-server/src/interface/mcp/routes/qualityChecklistHandler.ts` serves raw at `/api/quality-checklist`; `apps/frontend/app/routes/api.quality-checklist.tsx` proxies it; `apps/frontend/app/routes/dashboard.quality-audit.tsx` renders it. Those three files are read-only reference here — a peer `qa` instance owns edits there; NEVER touch them from this sub-flow.

For each demanded item from Step 1 (a framework capability, or a coverage-map page/SLA row) with no matching `cap_id`/`check_id` in `docs/data/quality-checklist.json .capabilities[]`: ADD it using the EXISTING declaration pattern — one more object in `.capabilities[]`:
```json
{ "cap_id": "...", "title": "...", "service": "...", "deploy_status": "...", "rolls_up_functions": [...],
  "checks": [ { "check_id": "...", "dimension": "...", "question": "...", "metric": "...", "expected": "...",
    "recheck_how": "...", "status": "...", "severity": "...", "zone_owner": "...", "evidence": "...",
    "last_verified": "...", "signal_id": null } ] }
```
Never fork a parallel checklist file or a second serving mechanism — the `CAP-FE-PAGE-*` rows already extended the original 38-capability set this exact way (74 live today). Follow that precedent.

## Step 3 — Verify (hard, non-negotiable)

- **Live served runtime only.** Verify through `curl -s http://localhost:3001/api/quality-checklist` (frontend-facing) or mcp-server `:3000/api/quality-checklist` directly — a host-CLI `cat`/`jq` read of the JSON file on disk is a convenience read, not proof the served path works. Confirm both agree before trusting either.
- **A badge is not evidence.** The `overall` field and `pass/warn/fail/info/needs_review/total` summary counts are NOT verification — open each `checks[]` entry and read its own `status`/`evidence`.
- **Empty ≠ pass.** Before scoring a check PASS from a query that returned zero/null rows, confirm the query targets a populated store (right DB, right table, right filter). An empty result from a wrong target is not a clean PASS.
- **Freshness = two layers.** For any D4/freshness check: compare the FETCH timestamp (raw ingest, e.g. `vps_push_log.pushed_at`, or the coverage-map's `.asof` field) against the downstream ANALYSIS timestamp (derived/eval table, e.g. BCTC eval `computed_at`). Fresh fetch + stale analysis = FAIL — never average the two or take the newer one.
- **Real timestamps only.** Every `last_verified` write is real `date -u +%Y-%m-%dT%H:%M:%SZ` shell output. Hand-typed ISO strings are forbidden — they drift into the future.
- **No fabrication.** Cannot verify a check (endpoint unreachable, tool not gateway-registered, ambiguous evidence) → `status: "NEEDS_REVIEW"`, `evidence: "UNVERIFIED — <concrete reason>"`. Never guess a PASS/FAIL.

Write the diff (new rows + verification results) into `docs/data/quality-checklist.json` directly (data file, not a frontend route, not orch-state — in scope here) via `Edit`; bump `_updated_at` (real `date -u`) and `_updated_by: "qa"` in the same edit pass.

## Step 4 — Gap → dev-team task (escalation branch)

For any demanded item that cannot be satisfied today (capability not implemented, endpoint missing, freshness contract violated by design):

1. **Prior-art check first** — no duplicate rows:
   `jq --arg kw "<keyword>" '[.task_board | (.backlog,.ready,.in_progress,.review,.qa,.done,.done_verified)[]? | select((.title // "") | test($kw;"i"))]' docs/data/orch/orch-state.json`
2. **If a prior-art row exists**, `git log --since=<that row's created_at>` on the suspected root-cause file(s) — the gap may already be fixed and the row just stale; do not mint a duplicate.
3. **If genuinely open**, mint into `.task_board.backlog[]` (shape per `docs/standards/task-schema.md` + live backlog precedent): `id, title, type, status:"BACKLOG", priority, size, zone, source:"qa-quality-audit-checklist", detail_ref:"<demanding doc path>#<section>", note:"<root cause>", created_at:<real date -u>, created_by:"qa", next_agent:"<resolved — step 4>"`.
4. **Resolve `next_agent`** — never guess: code-zone gap → `.claude/skills/zone-detect/SKILL.md` (queries `docs/data/system-map.json`); design/doc-only gap → the owning non-dev agent per `docs/data/system-map.json .project.agents[]` (e.g. `architect` for framework changes, `ba` for spec gaps).
5. **Write ONLY** via `jq '<transform>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` — never raw `mv`/`cp`/`>`/full-doc overwrite.

→ journal (MANDATORY): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "quality-audit-checklist-sync-<YYYY-MM-DD>"] — record which demanded items were added, which failed verification (and why), which gaps were minted vs already covered by prior art.

## RETURN
```
DONE: quality-audit checklist synced — N items added, M gaps escalated to backlog, K NEEDS_REVIEW
NEXT: po | triage minted gap rows                    ← only if M > 0
PIPELINE: continue
```
