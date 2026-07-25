<!-- lazy-loaded by main.md §Tier-5. cap: 120L (flow-file) — within cap.
     New dimension (D-PAGE, Tier-5) covers TWO rotations (quality-checklist.json freshness
     checks + frontend-data-coverage-map.json page rows) sharing one partition scheme, the
     canonical verified_at contract, two anomaly classes (drift + audit-staleness), and a
     map-self-staleness sentinel. Origin: agent-father dispatch
     coordination_session=93587c5d-9135-42df-a0e7-170d0f8358b2 (2026-07-25), user demand
     "reverify this quality-audit page, plan it day by day... do not trust stale status". -->
> Parent: [../../../../.claude/agents/system-auditor.md](../../../../.claude/agents/system-auditor.md)

# D-PAGE — Quality-Audit Freshness Rotation (Tier-5, daily, detect-only)

**Wall time target: < 240s.** Runs once daily (own cron, offset from Tier-3/D4 — see `.claude/commands/crons/cron-auditor-page-reverify.md`). Not part of the AUDIT_TIER 1/2/3 election.

**Boundary (read this before writing anything):** this dimension is DETECT-ONLY on `docs/data/quality-checklist.json` — READ-ONLY, always, no exceptions; `qa` remains its sole writer (`docs/agents/qa/flow/quality-audit.md`). It has ONE narrow, additive write on `docs/data/frontend-data-coverage-map.json`: the `verified_at` key per row, nothing else (that file carries no other active writer — see script header). Everything else this dimension finds is a **signal**, never a direct fix or a checklist edit.

**Canonical field:** `verified_at` — `date -u +%Y-%m-%dT%H:%M:%SZ` (second precision, real shell output, never hand-typed, never ms, never a bare date). Means "when system-auditor last live-reprobed this row/check". Written on EVERY probe this cycle, pass or fail. **Distinct from** `quality-checklist.json .last_verified` (qa's own field — untouched) and `frontend-data-coverage-map.json .asof` (data recency, NOT confirmation recency — never conflate the two: a row can have a fresh `asof` and a stale `verified_at` and that combination is itself a finding).

**Golden rule (non-negotiable):** stored `status`/`last_verified`/`.asof` are read ONLY as the diff target. Never skip a probe because stored status already says PASS. Never launder a stale stored value into a fresh verdict.

---

## Step 1 — Map self-staleness sentinel (runs every cycle, unconditional)

```bash
MAP_AGE_ISO=$(git -C "$PROJECT_ROOT" log -1 --format=%cI -- docs/data/frontend-data-coverage-map.json)
```
Compute age in days (portable epoch diff, same GNU/BSD fallback as the script). If age > 14 days → this is the SSOT-of-freshness itself going unverified (router finding: 40/50 rows reported LIVE off a 23-day-old snapshot). Emit via `scripts/emit-audit-signal.sh --check-id "PG-MAP-SELF" --category-type "system_issue" --severity WARN --summary "frontend-data-coverage-map.json unverified <N>d (SSOT-of-freshness stale)" --detail-json '{"dedup_key":"system_issue:frontend-coverage-map:PG-MAP-SELF"}'`.

## Step 2 — Checklist rotation (Data Freshness/SLA checks, 74 at authoring time)

```bash
bash scripts/audits/auditor-page-reverify.sh select
```
Paste the `[page-reverify] SELECT ...` marker + JSON array into the notebook `### RAW-PROBE:` block (same anti-carry discipline as Tier-1 — this cycle's selection only). For **every** check_id returned (never skip one because `status` already shows PASS):
1. Execute that check's own `recheck_how` field verbatim (an MCP `call_tool(...)` recipe already authored by qa) against the LIVE served runtime.
2. Classify the result into the SAME enum quality-checklist.json already uses: `PASS | WARN | FAIL | INFO | NEEDS_REVIEW`. Cannot execute the recipe (tool unavailable, ambiguous evidence) → `NEEDS_REVIEW`, never a guessed PASS.
3. Two-layer check where the recipe distinguishes a fetch timestamp from an analysis/serve timestamp: fresh fetch + stale analysis → `FAIL`, never averaged, never "take the newer".

Build `/tmp/sau-pgrv-results-<compact-UTC>.json` = `[{check_id, stored_status, live_verdict}]` (stored_status = that check's CURRENT `status` field from the `select` JSON, read fresh this cycle — not memorized from a prior run). Then:
```bash
bash scripts/audits/auditor-page-reverify.sh record --results /tmp/sau-pgrv-results-<ts>.json
bash scripts/audits/auditor-page-reverify.sh staleness-scan
```
Paste both marker blocks verbatim into the notebook.

**Emit — VALUE DRIFT** (one `[page-reverify] RECORD OK ... drift=true` line): stored said PASS, live probe disagrees — a real regression that went silent.
```bash
bash scripts/emit-audit-signal.sh --check-id "<check_id>" --category-type "data_stale" --severity WARN \
  --summary "<check_id> drift: checklist=PASS live=<verdict>" \
  --detail-json '{"dedup_key":"data_stale:<check_id>:PG-DRIFT","title":"D-PAGE drift: <check_id>"}'
```
**Emit — AUDIT STALENESS** (one `[page-reverify] STALE ...` line — this check has not been re-probed within the 7-day window; the rotation itself may have stopped running):
```bash
bash scripts/emit-audit-signal.sh --check-id "<check_id>" --category-type "system_issue" --severity WARN \
  --summary "<check_id> not re-verified in <age_days>d (window=7d)" \
  --detail-json '{"dedup_key":"system_issue:<check_id>:PG-STALE","title":"D-PAGE audit-staleness: <check_id>"}'
```
Paste each `[emit-signal] OK|SKIP-dedup|ABORT ...` marker into the notebook.

## Step 3 — Coverage-map rotation (per-page `verified_at`)

```bash
bash scripts/audits/auditor-page-reverify.sh map-select
```
For each row returned (STATIC already excluded by the script), best-effort live probe: `curl -s http://localhost:3001<endpoint>` when `endpoint` starts with `/api/` and has no path-parameter placeholder; extract the row's declared `asof` field from the response. Endpoint not mechanically probable (gw route, path param, computed-on-read composite) → log `[D-PAGE] NEEDS_REVIEW UNVERIFIED <page> — endpoint requires manual probe`, do NOT include in the results list (its `verified_at` stays whatever it was — never fabricate a probe that didn't happen). Gate by VN market hours (02:00–08:59 UTC Mon–Fri) for rows whose own `status == STALE_RISK` — outside those hours log INFO, skip verdict, but it MAY still count as "probed" for `verified_at` purposes since liveness (not staleness) was confirmed.

Build the list of page names that were ACTUALLY reprobed this cycle (successes only), then:
```bash
bash scripts/audits/auditor-page-reverify.sh map-record --results /tmp/sau-pgrv-pages-<ts>.json
```
Paste the `[page-reverify] MAP-SELECT ...` and `[page-reverify] MAP-RECORD OK ...` markers into the notebook.

## Step 4 — Notebook + heartbeat + release

Notebook section (label `Tier-5-D-PAGE`, ≤60L, same settled-write AC-3 pattern as every other tier): include `checklist checks: N probed (D drift, S stale)`, `map rows: M probed`, `PG-MAP-SELF: <FRESH|STALE age=Nd>`.
Commit via `scripts/auditor-notebook-commit.sh` (same as every other tier — see `flow/main.md` end-of-cycle). If Step 3 touched `frontend-data-coverage-map.json`, stage it in the SAME mutex-guarded commit alongside the notebook (own_paths includes both paths — never a directory sweep).

→ skill: `.claude/skills/anomaly-task-bridge/SKILL.md` — inputs: `AUDIT_TIER = 5` (ATB is tier-agnostic beyond its Tier-1 skip gate; `data_stale`/`system_issue` rows emitted above flow into the existing `repair_task_request` → PO → task_board pipeline unchanged, zero new plumbing).

## OUTPUT-CONTRACT (append to the standard line)
```
[OUTPUT-CONTRACT] page_checks_probed=N | page_drift=N | page_stale=N | map_rows_probed=N
```

## Failure modes

| Failure | Behavior |
|---|---|
| `quality-checklist.json` unreadable/invalid JSON | `select`/`staleness-scan` ABORT — log WARN, run `mark-skip --reason checklist-unreadable`, skip Step 2 only, continue to Step 3 |
| `frontend-data-coverage-map.json` unreadable | Skip Step 1 and Step 3 only, log WARN, continue |
| Fewer than expected checks in today's partition (0) | Not an error — some weekdays legitimately get a smaller slice (74 % 7 ≠ 0); log and continue |
| Ledger write fails (disk/permission) | Log WARN + BUG telegram, do NOT block Step 2/3 findings from emitting — the ledger is bookkeeping, not the anomaly signal itself |
| Election/claim lost (peer session leads today's tick) | `mark-skip --reason "election-loss"`, EXIT clean — no notebook write this cycle, the SKIPPED entry is itself the coverage-hole record |
