# CI-Red Triage: FAILEDFILE Read + File-Scoped Dedup + Anti-Amnesty Fence

**Task:** `FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY` (P0, S, supervised, plan_only)
**Author:** agents-architect · **Date:** 2026-07-31T04:29:55Z
**Zone:** `docs/agents/po/flow/` (implementation target — NOT this agent's write zone, hence a brief, not a direct edit)
**Files to change:** `docs/agents/po/flow/triage-signals.md`, `docs/agents/dev-team/flow/ci-health-probe.md`
**Implementer:** agent-father (docs/agents/* is in-zone per `.claude/skills/commit-boundary/SKILL.md`; no production code touched, no dev-* specialist needed)

---

## 1. Problem (restated from the row, RAW-verified at source, not re-argued)

`triage-signals.md` §`ci_red` dedups on `check_id` (`CI-RED-<sha8>`) and `head_sha` —
both SHA-derived. On a repo where `main` advances every few minutes neither key
ever matches across two different reds for the *same underlying defect*, and
nothing in the row instructs PO to open the run log and read the
`=== FAILED FILES (N) ===` / `FAILEDFILE:` block `scripts/ci-per-file-isolation.sh`
emits — the only place the real failure identity lives. `failing_jobs[].name`
(the only thing the row currently extracts) is the literal GitHub job name
("bun test") for every red, so every red looks identical and the cheapest
disposition ("same standing baseline") wins by default. Confirmed cost: 8
reds / 3 distinct files / 4 days minted zero board rows (2026-07-25→07-29);
recurred a 6th time this tick (frontend-eslint + size-lint, 6 distinct SHAs,
run 30603458514, head `ad6d8cd69`).

## 2. What's already proven in the field (do not re-invent)

PO has independently executed this exact fix BY HAND twice already, because
the row (this task) had not shipped yet:

- `FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT` (ready[49]) and
  `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER` (ready) — both
  minted from the SAME incoming ci_red signal (`CI-RED-79013523`, run
  `30512236942`), by running `gh run view <run_id> --log-failed` and reading
  the actual failing step, THEN splitting into two independent rows (one per
  distinct job+file), each carrying:
  ```json
  "check_id": "CI-RED-79013523",
  "ci_fingerprint": "e795202f4528cd5fd7141b83de450f68e9045e2eed00e40f682e08cc871c8a08",
  "dedup_key": "ci_job:<job_name>|file:<file_or_path>",
  "verification_gate": "ci_green_on_subsequent_push"
  ```
- `FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A` (review[203]) — same
  pattern, `dedup_key: "ci_job:bun test|file:apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts"`.
- `po_dedup_hit_20260731T0132` note on ready[49] shows the mechanism WORKING:
  a 5th ci_red on a brand-new SHA (`40dfb1f9`) matched `dedup_key` and was
  correctly folded into the existing row instead of re-minted.

This brief formalizes exactly this already-validated `dedup_key` shape and
read procedure into the SSOT so it stops being tribal/ad hoc and starts being
mandatory for every PO session, not just the ones who happened to remember.

**Decision:** no new probe-side (`scripts/agents-flow/ci-health-probe.js`)
logic is introduced. The FAILEDFILE read is a **live** `gh run view` call
made by PO at triage time (freshest possible state, and `payload.run_id` is
already threaded through the existing signal shape — verified, no probe gap).
Adding log-parsing to the Node probe would duplicate this logic in two
places and risk drifting from the bash script's own output format. The only
`ci-health-probe.md` change is a documentation-accuracy correction (§4).

## 3. Change 1 — `docs/agents/po/flow/triage-signals.md` §`ci_red` row

Replace the current `ci_red` table row (the row starting `| \`ci_red\` |
\`ci-health-probe\` |`) with:

```
| `ci_red` | `ci-health-probe` | Read signal fields directly (not a payload path — shape is inline in signal JSON per `docs/agents/dev-team/flow/ci-health-probe.md` §Signal shape). Extract `payload.check_id`, `payload.failing_jobs`, `payload.head_sha`, `payload.run_id`, `payload.suggested_sprint_class`. **MANDATORY PRE-DEDUP FAILING-FILE READ (no exceptions — dedup MUST NOT be evaluated before this step completes):** `failing_jobs[].name` is a literal GitHub job name ("bun test", "size-lint") — it carries ZERO discriminating information about WHAT failed; every ci_red looks identical on job name alone. Run `gh run view {payload.run_id} --log-failed | grep -E 'pass / |FAILEDFILE'`. If the output contains one or more `FAILEDFILE: <path>` lines → the sorted, deduped set of those paths is FAILING_FILES (the block `scripts/ci-per-file-isolation.sh` emits at `=== FAILED FILES (N) ===`, one entry per test file that failed in per-file isolation). If the grep returns EMPTY (the failing job is not the `bun test` isolation runner — e.g. a dependency-install or lint-tool crash with no FAILEDFILE block) → FAILING_FILES is instead the single most specific path named in the failing step's own error line, read verbatim from `gh run view {payload.run_id} --log-failed` (e.g. `apps/frontend/bun.lock` for a frozen-lockfile error, or the offending source path for a lint/size-lint failure) — never the bare job name. Record FAILING_FILES verbatim on whatever row is created below, OR in the skip-log line if skipping — a disposition with no file list attached is INVALID and must be redone. **Dedup check (FILE-SCOPED — PRIMARY; check_id/head_sha are SECONDARY, both SHA-derived and proven to never match across advancing SHAs on this repo, do not dedup on them alone):** for EACH distinct file in FAILING_FILES, build `dedup_key = "ci_job:{failing job name for that file}|file:{file path}"` and (1) scan `docs/data/orch/orch-state.json` `.task_board` for any open entry (status ∈ TODO/IN_PROGRESS/REVIEW/BLOCKED) whose own `dedup_key` field matches — if found → log `"[po] ci_red: {check_id} — file-scoped dedup hit on {existing_id} ({dedup_key}), duplicate skipped"`, append the new `head_sha`/`check_id` as an additional observed SHA to that row's `status_note`, mark signal DONE, skip that file. (2) SECONDARY, only if (1) finds nothing for that file: scan for an open entry whose title or id contains `check_id`, or whose `status_note` contains `head_sha` — same skip on match. If NEITHER matches for that file: append to `.task_board.backlog[]`: `{id: "{check_id}-FIX" (or a descriptive FIX-<SLUG> id when the root cause is already clear — do not force the templated id when a more legible one is available; -2/-3 suffix if more than one file mints from the same check_id), title: "{check_id}-FIX — CI RED: {job name} — {file path}", owner: "po", status: "TODO", zone: "apps/<zone inferred from the FILE path, never the job name>", check_id: "{check_id}", dedup_key: "ci_job:{job name}|file:{file path}", ci_fingerprint: "{payload.dedup_key sha256, if present — traceability only, NOT the dedup discriminant}", created_at: "<ISO-8601 UTC now>", verification_gate: "ci_green_on_subsequent_push", status_note: "AC: gh run view <databaseId with headSha AFTER {head_sha}> --json jobs -q '.jobs[]|select(.name==\"{job name}\")|.conclusion' == success (verification_gate=ci_green_on_subsequent_push). Priority: high. Failing job: {job name}. Failing file: {file path}."}`. One row PER DISTINCT FILE — do not collapse multiple unrelated failing files into one row (matches already-validated practice on `FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT` / `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`, minted as two sibling rows from one signal). Commit orch-state.json (commit-mutex, atomic write). Log `"[po] ci_red: created BACKLOG task {check_id}-FIX — file: {file path}"`. **ANTI-AMNESTY FENCE (hard forbid, no override):** a ci_red MUST NEVER be deduped into `FIX-MCP-SUITE-HEALTH-BASELINE` or any other LOCAL-full-suite row. Reason: `.github/workflows/ci.yml` runs `scripts/ci-per-file-isolation.sh` per commit `3174de0ce`, forking one bun process per test file, so the CI plane's green baseline is 0 fail (proven run `30425110302`) and structurally excludes the full-suite order-dependent pollution that class of row characterises — the two planes never share a fail set and must never share a disposition. **BACKSTOP:** the CI plane's last known-green baseline is 0 fail — a ci_red is therefore ALWAYS actionable. "Pre-existing" / "same standing baseline" is NEVER a valid disposition unless it names a specific, already-open, FILE-scoped `.task_board` row matched via the dedup check above; an assertion of pre-existence with no matched row is a fabricated disposition and the row MUST be minted. | `.task_board.backlog[]` FIX entry (one per distinct failing file) — standard po→dev chain applies; DONE only when CI GREEN on subsequent push for that file's job |
```

**Net effect vs current row:**
- Adds the mandatory `gh run view --log-failed` read (AC-1) as a hard gate before any dedup decision.
- Replaces the two-layer check_id/head_sha-only dedup with a FILE-scoped
  primary key + the same two checks demoted to secondary (AC-2).
- Adds the explicit anti-amnesty fence naming `FIX-MCP-SUITE-HEALTH-BASELINE`
  and the CI-plane-vs-local-plane reason (AC-3).
- Adds the "0-fail baseline ⇒ always actionable" backstop, foreclosing the
  "pre-existing" escape hatch without a named row (AC-4).
- Formalizes the one-row-per-distinct-file minting already used twice in
  production (not a new behavior, just now documented).

## 4. Change 2 — `docs/agents/dev-team/flow/ci-health-probe.md`

Two small, non-behavioral, doc-accuracy edits (no script change — CANON-SCRIPT
`scripts/agents-flow/ci-health-probe.js` is unaffected because neither edit
touches probe-executed steps CI-0..CI-4):

**4a. Hard Constraint #2 (3-LAYER DEDUP)** — layer (c)'s description is now
stale (it will describe the OLD PO mechanism once Change 1 ships). Replace:

```
2. **3-LAYER DEDUP:** (a) probe-level `signals_processed` DB fingerprint check before signal write; (b) drain-signals.js fingerprint dedup on re-read; (c) PO triage-signals.md open-entry check on `check_id`+`head_sha`. No `ci_red` task may be duplicated.
```
with:
```
2. **3-LAYER DEDUP:** (a) probe-level `signals_processed` DB fingerprint check before signal write — SHA+job-scoped, prevents re-emitting the SAME signal for a SHA already signaled this tick, does NOT (and is not meant to) dedup a persistent defect across advancing SHAs; (b) drain-signals.js fingerprint dedup on re-read — same SHA-scoped fingerprint as (a); (c) PO triage-signals.md open-entry check — FILE-SCOPED (`dedup_key: "ci_job:<job>|file:<file>"`, built from a live `gh run view {run_id} --log-failed` FAILEDFILE read), with check_id/head_sha as secondary fallback only. Layer (c) is the ONLY layer that dedups a persistent defect across SHAs — (a)/(b) staying SHA-scoped is intentional, not a gap (see `FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY`). No `ci_red` task may be duplicated.
```

**4b. Step CI-3**, immediately after the existing `DEDUP_KEY` definition, add
one clarifying line (prevents a future reader from assuming the probe's own
key already solves cross-SHA dedup — it doesn't, by design, and that
conflation was half of the root cause this brief fixes):

```
DEDUP_KEY   = "ci_red:" + HEAD_SHA + ":" + SORTED_JOBS
FINGERPRINT = sha256(DEDUP_KEY)
```
gains, directly below:
```
# NOTE: DEDUP_KEY is intentionally SHA+job-scoped — it exists ONLY to stop
# this probe re-emitting the SAME signal for a SHA it already signaled this
# tick (layer a/b above). It is NOT the mechanism that dedups a persistent
# defect across advancing SHAs — that is PO's FILE-scoped dedup_key
# (triage-signals.md §ci_red, layer c), built from a live FAILEDFILE read,
# not from this field. Do not "fix" cross-SHA dedup here.
```

Both edits are prose-only inside existing sections; no line-count budget
concern (`ci-health-probe.md` carries its own size-justification header
already, +9L here is within the file's declared load-bearing scope).

## 5. Retro-sweep (AC-5) — executed now, evidence attached

Confirmed on current `origin/main` (run `30603458514`, head `ad6d8cd69e4`,
`2026-07-31T04:10:31Z`, `bun test` job conclusion=`success`,
`gh run view 30603458514 --log 2>&1 | grep -E "pass / |FAILEDFILE"` →
`14866 pass / 40 skip / 0 fail`, zero `FAILEDFILE:` lines):

- `1408-tool-diacritics.test.ts` — GREEN. Fixed by `9374e65e0`
  ("test(mcp-server): fix stale ổn định assertion in 1408-tool-diacritics",
  2026-07-28T19:23:42+02:00 / ~17:23:42Z, i.e. immediately after the last
  diacritics red at 07-28T17:21Z).
- `emit-pressure-state.test.ts` — GREEN. Fixed by `98917416a`
  ("fix(mcp-server): pressure-state host_headroom_mb wrong machine + latent
  wrong quantity", 2026-07-28T20:01:11+02:00) and `d19d6cdc5`
  ("fix(mcp-server/CI-RED-cdd5fa5a-FIX): platform-aware headroom
  negative-control + surface CI isolation failure logs", 2026-07-29T01:49:42
  +02:00 — same commit that added the `=== FAILED FILES ===` per-file log
  surfacing to `$GITHUB_STEP_SUMMARY` in `ci-per-file-isolation.sh`, itself a
  direct downstream reaction to this same class of dropped ci_red signal).
- `1847d-C-alert-outcome-job.test.ts` — separately tracked and already
  CI-plane-verified GREEN on `FIX-CI-RED-ALERTOUTCOME-CLOCK-SEAM`
  (review[159], `ci_plane_verified` field, two consecutive green `bun test`
  runs post-fix) — not re-verified here, out of this row's AC-5 scope.

Blind window (2026-07-25→07-29) is closed with evidence, not assumption.

## 6. Sequencing / dependencies

No dependency on any other open row. `FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT`
and `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER` (the live
CI-red content fixes) are explicitly out of scope here per the dispatch —
this brief only fixes the triage MECHANISM. Ship independently; either order
is safe since Change 1 (PO-side) and Change 2 (probe-doc-only) do not
interact with a running probe cycle mid-flight.

## 7. Verification (for whoever implements)

- No test surface — both files are agent-flow prose/spec, same disposition
  as prior flow-doc-only rows (`FIX-SWEEPGUARD-...`, `2026-07-13-FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE`):
  the RAW clause-content read IS the gate.
- Positive control for the NEXT real ci_red after this ships: confirm the
  triage session's notebook/status_note actually shows a `FAILEDFILE:`-derived
  file list and a `dedup_key` field on whatever row results — absence of
  either on the next occurrence means the row didn't actually change PO
  behavior and should be treated as CHANGES_REQUESTED.
