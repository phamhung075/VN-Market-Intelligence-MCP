<!-- size-justification: 275L (corrected from stale 227L claim, drift undocumented pre-2026-07-25) — atomic QA gate flow with JUMP-TO dispatch + BCTC eval hard-gate + mock-production guard (pipeline / approved / changes-requested / architect-review / clean / emergency); TDD/DDD/security/eval/mock-guard checklist steps are tightly sequential and cannot decompose without losing gate ordering; mandatory decision-journal per-task step at verdict routing. +11L: WF-1 error-boundary STOP-RELEASE block (AC-WF1-3). +4L: WF-3 INV-GATEWAY-1 annotations. +1L: FIX-QA-NOTEBOOK-WRITE-SELFCAP-200L APPEND class annotation. UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK 2026-07-22: +42L — Direct-Commit Verify entry point (verify-committed/-approved/-changes), the hard qa-side prerequisite for dev-team's Review-Lane QA-Drain (every one of its 32 live source rows has branch:null, incompatible with the `pipeline` JUMP-TO's git-checkout precondition); additive only, `pipeline`/`approved`/`changes-requested` unchanged. QA-FLOW-QUALITY-AUDIT-CHECKLIST-FRESHNESS 2026-07-25: +1L — thin dispatch row to new sub-flow `./quality-audit.md` (checklist-demand sourcing + freshness verification + gap-escalation now durable, was ephemeral router-prompt-only; lazy-load pattern, no logic inlined here). 2026-08-12 doc-self-heal (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS verify-committed cycle): +2L — Direct-Commit Verify step 4 gained a non-bun-zone substitution note (pytest/mypy for Python microservices, run inside the zone's actual deployed image, never host/sandbox — host dependency drift silently produced a false 195/195-green claim on rag-service). FIX-QA-OOM-CLASS-AC3-CERTIFIES-ON-UNRELIABLE-SIGNAL-AND-UNSETTLED-WINDOW 2026-08-15 (agent-father): +~30L — new "OOM-Class Durability Gate" section in Pipeline (detection rule + D1-D5 summary, full spec delegated to new SSOT `docs/standards/oom-durability-verification-bar.md`, generalised fleet-wide from RAG-MEM-DURABILITY-BAR v2) + a cross-reference paragraph in Direct-Commit Verify (the observed path for every OOM-class row so far) gating `vc-approved`; closes 5 defects (docker-inspect-only signal, unsettled window, restart-laundering, negative-only criterion, stale grandfather-exemption) proven live on the rag-service OOM incident. FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR 2026-08-23 (agent-father): +50L — `vc-approved`/`vc-changes` verdict exits gained literal `jq | orch-apply.sh` executable blocks (both previously prose-only, no write actuator at all — 4 confirmed stranded rows permanently consumed `qa[]` `QA_CAP=10` slots) + a self-verify re-read on each, matching the `FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR` template (commit `3ce726a6e`). SAME ROW, redispatch 1 (agent-father, 2026-08-23T14:20Z, after qa CHANGES_REQUESTED on commit `863a250e3`): +24L (366→390L actual; the "275L" claim at the head of this justification has been stale since at least the 2026-08-15 edit and is NOT corrected here — out of this row's scope) — the shipped jq could not pass `orch-validate.mjs` at all, so all three of qa's findings are closed here: `del(.next_agent)` replacing `next_agent: null` (TaskSchema:208 is optional-NOT-nullable, unlike HeadSchema:324), a mandatory RC-VERIF `verification.raw_probe` block with a fail-loud empty-field refuse (§ 8A `checkVerificationGate` hard-rejects DONE_VERIFIED without it), `($t.owner // $t.owner_agent // "po")` replacing the null-emitting `$t.owner`, widened self-verify predicates on both blocks, and a `ORCH_APPLY_LIVE_FILE_OVERRIDE` dry-run recipe so the next editor verifies by executing rather than reading. FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE 2026-08-26 (developer, architect brief `docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md` §1b): +34L (390→424L) — new mandatory Step 0d "Not-Before Gate Check", inserted immediately after Step 0c/before Smart-Skip so it runs before ANY jump target; the one convergence point every dispatch path (scripted QA-Drain OR router hand-dispatch) passes through, closing the class the picker-side `scripts/lib/devteam-eligibility.jq` gate cannot reach (hand-dispatch bypasses that script entirely). FIX-BEHAVIORAL-VERIFICATION-GATE-QA-SIDE 2026-08-26 (agent-father, `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §9 row 2): +6L — Direct-Commit Verify gains a Behavioral-predicate AC (P0/P1 apps/ rows, `created_at >= BEHAVIOR_PREDICATE_CUTOFF`) gating `vc-approved`; `vc-changes` routes a missing-predicate failure to `po` explicitly, not the code owner. -->

# QA — Main Flow

**Tools:** `docs/agents/tools/package/qa.md`

## Input
`docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`
Signal payload may include `handoff_delta: { last_read_anchor, last_read_at }` from prior round.

## Output
Task report | APPROVED merge or CHANGES_REQUESTED with exact file:line issues

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`
> **WF-1 STOP-RELEASE (AC-WF1-3):** On ANY tool failure BEFORE verdict is reached (pre-approved/changes-requested), run this block first:
> ```
> // INV-GATEWAY-1 (2026-06-07): task_release is the dispatcher session's sole responsibility.
> // This best-effort call may silently fail (no MCP gateway binding in specialist sub-session).
> // The dispatcher finally-block and TTL expiry (3600s) are the authoritative release paths.
> call_tool(server="vn-market", tool="task_release", arguments={
>   task_id: "task:" + task_id,
>   owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, apps/mcp-server/src/interface/mcp/
>     tools/system/coordination/taskReleaseTool.ts:35-41 (P1-FINAL/TASK_1980). Substitute the real session
>     id read from this spawn prompt's Coordination line (or your own `echo $CLAUDE_CODE_SESSION_ID` if you
>     hold Bash) — NEVER write the literal text "$CLAUDE_CODE_SESSION_ID", it is sent as-is, not expanded>"
> })
> // ok=false acceptable — best-effort. Note: CHANGES_REQUESTED does NOT release (fixer holds lock — intentional).
> now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
> jq --arg s "idle" --arg t "$now" --arg u "qa" \
>   '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
>   "docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
> ```
> Then continue with the standard error-boundary exit (`send_telegram(channel="bug", message="[qa] tool failure — EXIT")` + drop signal + EXIT).
> **DECISION JOURNAL RULE:** Terminal output is STATUS-ONLY (RETURN + caveman). All reasoning → `docs/agent-memory/decisions/sprint-<id>.md` via skill `.claude/skills/decision-journal/SKILL.md`.

---

## Role in dev-team flow
> Canonical orchestration: `docs/agents/dev-team/flow/main.md`

**Called from:** dev-team Step 3 — after each developer DONE, gates merge; also Step 2 CLEAN — receives stale branch list from po triage
**Receives:** Step 3: `docs/handoffs/TASK_NNN.md` with `[Developer] Implementation Record`, branch `task/NNN-*`; Step 2 CLEAN: list of branches with 0 unmerged commits or stale worktrees
**Produces:** Step 3: APPROVED (merge + push + branch delete) or CHANGES_REQUESTED (file:line issues) → RETURN with `NEXT: pm` or `NEXT: fixer`; CLEAN: deleted branches + pruned remotes → EXIT
**Hand off to:** Step 3 APPROVED → main terminal → pm marks Done, unblocks next tier; CHANGES_REQUESTED → main terminal → fixer (round < 2) or architect (round ≥ 2)
**Composes with:** developer (receives from), fixer (sends CHANGES_REQUESTED to), pm (sends APPROVED to), architect (escalates ARCHITECT_REVIEW_NEEDED to)

CLEAN workflow: `for each branch: if git log main..<branch> empty → git branch -d; if worktree → git worktree remove --force + git branch -D; if unmerged → report to WORK`.
Parallel QA: multiple tasks in same tier can be QA'd simultaneously if on different branches.

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO |
|---|---|
| Normal Step-3 QA (post-dev handoff) | `pipeline` |
| Step-2 CLEAN spawn (branch cleanup) | run inline CLEAN one-liner in Role section, then JUMP TO `end` |
| dev-team Review-Lane QA-Drain spawn (`mode=verify-committed` in spawn context) | `verify-committed` |
| Quality-audit checklist / freshness-demand sync (`mode=quality-audit` in spawn context, or explicit user/PO/router ask) | → Run sub-flow: `./quality-audit.md` |
| Pipeline result: all green, no arch impact | `approved` |
| Pipeline result: issues found (round < 2) | `changes-requested` |
| Pipeline result: arch concern (new domain/MCP tool/cross-service) | `architect-review` |
| Tests broken on `main` | `emergency` |

After pre-checks (project-root, notebook-read, delta-read, **Step 0d not-before gate check**, Smart-Skip), jump to the labelled section. Verdict branches at end of `pipeline` are JUMP TOs, not sequential walks.

---

**Step 0a — Resolve project root** → run skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with `qa`)

**Step 0c — Delta-read handoff** → skill: `.claude/skills/handoff-delta-read/SKILL.md`
```
Read handoff using delta-read skill:
  path: docs/handoffs/TASK_NNN.md
  last_read_anchor: <from signal payload handoff_delta.last_read_anchor, or null>
  last_read_at:     <from signal payload handoff_delta.last_read_at, or null>
→ store anchor_out + read_at into context (emit in RETURN block as handoff_delta for next round)
```

**Step 0d — Not-Before Gate Check (mandatory, before ANY jump target)** — architect brief `docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md` §1b. This is the ONE convergence point every dispatch path — scripted (Review-Lane QA-Drain, either call site) OR hand (router/human `task_claim` + `Agent("qa", ...)`) — passes through before any verify work runs; the picker-side gate in `scripts/lib/devteam-eligibility.jq` only protects the two scripted call sites, not hand-dispatch.

```
Read this task's own row directly off docs/data/orch/orch-state.json by task_id
(wherever it currently lives — do not assume a lane). Check every key in the
known allowlist — SSOT: gate_not_before_keys in scripts/lib/devteam-
eligibility.jq; KEEP THIS LIST IN SYNC WITH THAT ONE, never hand-copy a stale
snapshot:
  qa_not_before, next_recheck_not_before, qa_new_window_earliest_d1_close

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

If ANY present key's value is LATER than $NOW:
  - STOP. Do not run BCTC/OOM/test/DDD/security checks — no further tool
    calls against this row's content.
  - Reverse the dispatch, in ONE orch-apply.sh write: if drain_source_lane is
    set, move the row back to that lane ("review"/"done") with matching
    status ("REVIEW"/"DONE"); clear claimed_at/claimed_by/drain_source_lane.
    Route next_agent to the row's own owner/owner_agent (fallback "po") —
    same fallback chain as the existing verify-committed path.
  - Do NOT increment redispatch_count — no verify work happened, nothing to
    charge.
  - Append a short status_note: "[QA] HOLD — <key>=<value> not yet elapsed
    (now=<now>). Not dispatched, not charged."
  - Self-verify at HEAD (same discipline as every other lane-move in this file).
  - RETURN UNVERIFIED-BLOCKED, reason = the gating key + value,
    PIPELINE: continue — do NOT jump to pipeline/verify-committed/etc.

No known key present, or all present keys already elapsed → proceed
unchanged to Smart-Skip / the JUMP-TO table.
```

**Residual, not closed here:** the field-name fragmentation itself (3+ ad hoc names, no normalization) is contained by a known-list, not eliminated — if a 5th name appears, both this list and `gate_not_before_keys` must be updated by hand.

## Smart-Skip
- Test-only change → skip DDD + security. Run: unit + regression + tsc.
- String literal only → skip DDD + security. Run: full suite + tsc.
- Never skip `bun test` + `bun tsc --noEmit`.
- Never skip `mock-guard` when modified files include any production source (non-test, non-fixture).

<!-- jump:pipeline -->
## Pipeline

### BCTC Eval Gate (run after test-run, before verdict)

For any sprint task that touches a BCTC report, fetch eval for each `report_id` in task scope:
```
GET /api/bctc-eval/{report_id}   ← exact path; check schema_version field before parsing
```
Status semantics (consistent across all agent consumers):
- `overall_status = "red"` → hard fail: qa MUST refuse DONE. Write in handoff:
  `BLOCKED: stage N red — <gate_failures summary from gate_failures_json>`
- `overall_status = "yellow"` → soft warning: qa logs in handoff:
  `CAUTION: yellow eval — <stage names that are yellow>`
  Does NOT block merge.
- `overall_status = "green"` → pass; proceed to verdict.

If endpoint returns 404 (eval not yet computed) → log `BCTC-EVAL: not yet computed for {report_id}` in handoff, do NOT block (eval substrate may not be deployed yet).
If endpoint returns 409 → same as 404 treatment.

### OOM-Class Durability Gate (run after test-run, before verdict — for any task whose title/AC/status_note asserts absence of crash/OOM/memory-leak, or that memory usage is bounded/fixed/durable)

Full bar (D1-D5 + detection rule + grandfather-exemption guard) → `docs/standards/oom-durability-verification-bar.md`. Fleet-wide — applies to any service, not just rag-service. Hard rules, summarized:
- NEVER certify via `docker inspect .State.OOMKilled` / `.State.ExitCode` / `.RestartCount` alone — proven false-negative across confirmed kernel OOM-kills. Read the authoritative in-VM/in-host kernel log (`dmesg` via `nsenter`, or `journalctl -k`) instead.
- Window must span ONE continuous container/process lifetime (`.State.StartedAt` unchanged at open and close) — any restart/recreate during the window → window VOID, not merely reset.
- Require a POSITIVE plateau, not just "no crash observed": fitted growth rate `<= 0.02 pp/min` over the final segment AND final reading `<= 85%` of cap — both must hold.
- Window is VOID (not merely reset) if ANY mitigation (restart, cap raise, throttle, manual intervention) occurred during it.
- Before any DONE_VERIFIED/APPROVED flip, write the six D5 evidence fields onto the row: `durability_window_started_at`, `durability_window_container_id` (or process-identity equivalent), `durability_window_ended_at`, `durability_samples[]` (>=6 `{ts, mem_pct}`), `durability_growth_pp_per_min`, and the verbatim kernel query used. A prose assertion without all six is NOT a certification.
- If the row's id is in `RC_VERIF_GRANDFATHERED_IDS` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts`) but the row carries any retraction/void marker (RETRACTED/FALSIFIED/VOID text anywhere on the row), the exemption MUST NOT be relied upon — require a live D1-D5 raw-probe regardless.

Applies identically inside `pipeline` and `verify-committed` (Direct-Commit Verify) — Direct-Commit Verify is the OBSERVED path for every OOM-class row seen so far (FIX rows commit straight to `main`), so this gate is cross-referenced there too, not only here.

**Heartbeat sprint-task lock (dispatcher-side)**
```
// INV-GATEWAY-1 (2026-06-07): task_heartbeat/task_claim/task_release MCP calls are the dispatcher
// session's sole responsibility. QA specialist does NOT call task_heartbeat or task_claim here.
// The dispatcher holds the outer lock; QA proceeds without a direct lock claim.
// Lock-stolen detection: if the dispatcher's heartbeat fails, the dispatcher handles re-claim.
// See docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md (INV-GATEWAY-1).
```

```bash
git checkout task/NNN-kebab-description
bun test src/__tests__/NNN-*.test.ts
bun test
bun tsc --noEmit
grep -r "from.*infrastructure" <modified_files>  # must return NOTHING
grep -r "from.*application" <modified_files>     # must return NOTHING
grep -r "process\.env" src/                      # must return NOTHING
grep -r "password\|secret\|token" src/ | grep -v test | grep -v "//"
bash scripts/audits/mock-guard.sh --files "<space-separated modified production files>"
# Exit 1 = HARD-FAIL (fabricated data) → CHANGES_REQUESTED; Exit 2 = CAUTION → log in report, non-blocking; Exit 0 = PASS
```
Verdict routing:
- All checks pass AND no arch concern → JUMP TO `approved`
- Issues found AND round < 2 → JUMP TO `changes-requested`
- Issues found AND round ≥ 2 → JUMP TO `changes-requested` (RETURN block routes to architect)
- New domain service / MCP tool / cross-service HTTP / DDD refactor → JUMP TO `architect-review`

→ journal (MANDATORY per task — pre-verdict): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<task_id from handoff / task_board — the task number under QA review, e.g. ARCH-ORCH-F2; omit only if CLEAN branch sweep with no task context>"]
Write at minimum ONE entry per task you complete stamped with its task-id (record WHY this verdict — which checks failed/passed, why APPROVED vs CHANGES_REQUESTED vs ARCHITECT_REVIEW_NEEDED — not on terminal). Routine pass: `what-considered: "only path: all checks green"`, `why-change: "no change from plan"`.

## Task Report

Write to `reports/TASK_REPORT_NNN.md` — never `apps/mcp-server/reports/` or `docs/reports/`.

**Compact** (fix, ≤3 files):
```markdown
## Task Report NNN
changed: [file:lines, ...]
tests: N pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED | CHANGES_REQUESTED

### Issues (if CHANGES_REQUESTED)
- file.ts:42 — exact issue
```
**Full** (new tool/domain service/security): test results, DDD, security, code quality, blockers, merge commit.

<!-- jump:verify-committed -->
## Direct-Commit Verify (dev-team Review-Lane QA-Drain rows, `branch:null`)

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22) — the qa-side HARD PREREQUISITE for `docs/agents/dev-team/flow/main.md` § Review-Lane QA-Drain (folds `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN`). Every row that drain claims carries `branch: null` — committed straight to `main` via the FIX direct-execute path, never on a `task/NNN-*` branch, often with no `docs/handoffs/TASK_NNN.md` at all (grep-verified 2026-07-21: all 32 live `review[]` rows). The normal `pipeline` JUMP-TO's first line (`git checkout task/NNN-kebab-description`) cannot run against these — using it here guarantee-fails the spawn. Additive entry point only; `pipeline`/`approved`/`changes-requested` are unchanged.

**Input:** the row's own `task_board.qa[]` entry — self-contained (`id`, `commit`, `files[]`, `review_note`/`status_note`, `owner`): `jq --arg id "<task_id>" '.task_board.qa[] | select(.id==$id)' docs/data/orch/orch-state.json`. No handoff-file requirement.
**Fallback (row predates the drain, missing `commit`/`files[]`/`owner`):** derive `commit` via `git log --oneline --all -- <files named in status_note prose or detail_ref's `files[]`>`, cross-check the candidate commit's date against the row's `completed_at`; use `completed_by` as `owner` if `.owner` absent.

**Verify (no checkout — QA already runs on `main`):**
```bash
# 1. Refuse prose-only trust (feedback_router_verify_raw_not_badges) — require a concrete commit ref:
[ -n "$COMMIT" ] && [ "$COMMIT" != "pending" ] && [ "$COMMIT" != "null" ] || ISSUE="no commit reference to verify"

# 2. Commit must be real and on main's ancestry:
git merge-base --is-ancestor "$COMMIT" main || ISSUE="$COMMIT not found in main ancestry"

# 3. Commit must touch the row's own claimed files (if `.files[]` present):
git show --stat "$COMMIT" | grep -qF "<each files[] entry>"   # each must appear, else ISSUE

# 4. Re-run REAL verification — never trust the row's own review_note prose alone:
bun test <touched test file(s) inferred from files[], else targeted zone suite>
bun tsc --noEmit
bash scripts/audits/mock-guard.sh --files "<touched production (non-test) files, if any>"
```
Non-bun zone (e.g. Python microservices — rag-service, pdf-extractor): substitute `pytest`/`mypy` for `bun test`/`tsc`, but run them INSIDE the zone's actual deployed runtime image (e.g. `docker run --rm -v <repo>/apps/<zone>:/app ... <zone-image>:latest python3 -m pytest ...`), never host/sandbox Python — host or CI-sandbox dependency versions (e.g. `lancedb`/`fastapi`/`starlette`) routinely diverge from what the built image actually resolved, which can silently mask (or fabricate) a real pass/fail (`feedback_host_cli_integrity_check_false_ok_verify_through_runtime`).

**OOM-class AC (mandatory, before any `vc-approved`):** if the row is OOM-class / crash-durability-class per the Pipeline's OOM-Class Durability Gate (§ 1 detection rule, `docs/standards/oom-durability-verification-bar.md`), the checks above are necessary but NOT sufficient — run that gate here too and confirm D1-D5 all pass with the six D5 evidence fields written onto the row. Direct-Commit Verify IS the observed path for every OOM-class row seen so far (rag-service FIX rows commit straight to `main`, `branch: null`) — bypassing `pipeline` here does not bypass the Durability Gate.

**Behavioral-predicate AC (mandatory before any `vc-approved` — `docs/architecture-briefs/2026-08-26-behavioral-verification-gate-deploy-aware-ordering.md` §9 row 2, closes §2's "dominant delivery path has no deploy-aware check" gap):** if `zone` starts with `apps/` AND `priority` ∈ {P0,P1} AND the row's `created_at`/`declared_at` is `>= BEHAVIOR_PREDICATE_CUTOFF = "2026-08-26T19:57:54Z"` — a row minted BEFORE that instant predates the field and is exempt from this check, never apply it retroactively — then `verification.behavior_predicate` MUST already be present on the row. Absent on an in-scope row → treat as `ISSUE = "missing mint-time behavior_predicate"` and route via `vc-changes` below (§ note there: this is a mint gap, not a developer/code defect — the fix is PO/BA re-authoring at mint, not a new commit). Present, or row out of scope (wrong zone/priority, or pre-cutoff) → this check passes, fall through to the line below.

No `ISSUE` set AND all checks pass AND (if OOM-class) the Durability Gate D1-D5 satisfied with D5 fields written AND the Behavioral-predicate AC above passed → JUMP TO `vc-approved`. Any `ISSUE`, failing check, unmet Durability Gate condition, or failed Behavioral-predicate AC → JUMP TO `vc-changes`.

→ journal (MANDATORY): skill `.claude/skills/decision-journal/SKILL.md` § Write Entry [task_id: "<id>"]

<!-- jump:vc-approved -->
**verify-committed-approved:** append `[QA] Review Record (direct-commit verify)` — since there is no handoff file, append to the row's own `status_note` field instead of `docs/handoffs/TASK_NNN.md`. Flip `status: QA -> DONE_VERIFIED`, move `.task_board.qa[] -> .task_board.done_verified[]`, IN THE SAME `orch-apply.sh` write (status-flip = lane-move MUST, `execute-tier.md` § MUST — CANONICAL:SSOT-STATUSFLIP-LANEMOVE). No merge/push/branch-delete step — the work is already on `main`. **Executable form (FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR, 2026-08-23 — the prose above states intent, this is the literal mechanism; NEVER treat the prose as self-actuating):**
```bash
task_id="<id>"                                   # the row's own id
REVIEW_RECORD_NOTE="<the Review Record text described above>"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# ── RC-VERIF raw_probe (MANDATORY — orchStateSchema.ts § 8A `checkVerificationGate`) ──
# A row flipped to DONE_VERIFIED is HARD-REJECTED by orch-validate.mjs unless it carries
# verification.raw_probe{tool,args,live_value_observed,observed_at}. Fill these three from
# the checks you ACTUALLY ran in § Verify above — never from the row's own prose. Leaving
# any of them empty makes the jq below refuse (fail-loud) rather than emit a bad candidate.
PROBE_TOOL="git merge-base --is-ancestor + git show --stat + bun test + bun tsc --noEmit"
PROBE_ARGS="commit=$COMMIT; files=<the row's .files[] joined>"
PROBE_OBSERVED="<literal observed result, e.g. 'ancestor=yes; stat touches 2/2 claimed files; bun test 41 pass 0 fail; tsc 0 errors'>"
jq --arg id "$task_id" --arg now "$NOW" --arg note "$REVIEW_RECORD_NOTE" \
   --arg ptool "$PROBE_TOOL" --arg pargs "$PROBE_ARGS" --arg pobs "$PROBE_OBSERVED" '
  (.task_board.qa // []) as $q
  | ([$q[] | select(.id == $id)][0]) as $t
  | if $t == null then error("id not in qa[] -- refuse")
    elif ($t.status // null) != "QA" then error("status != QA (\($t.status)) -- refuse")
    elif (($ptool | length) == 0 or ($pargs | length) == 0 or ($pobs | length) == 0)
      then error("RC-VERIF: raw_probe tool/args/live_value_observed empty -- refuse")
    else . end
  | .task_board.qa = [$q[] | select(.id != $id)]
  | .task_board.done_verified = ((.task_board.done_verified // []) + [
      (($t + {
        status: "DONE_VERIFIED",
        qa_verified_at: $now,
        verification: (($t.verification // {}) + {
          raw_probe: { tool: $ptool, args: $pargs, live_value_observed: $pobs, observed_at: $now }
        }),
        status_note: (($t.status_note // "") + "\n[QA] Review Record (direct-commit verify): " + $note)
      }) | del(.next_agent))
    ])
' "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

# Self-verify (mandatory — RETURN may not assert the lane-move without this passing):
jq -e --arg id "$task_id" '.task_board.done_verified[]
  | select(.id == $id)
  | (.status == "DONE_VERIFIED") and (has("next_agent") | not) and (.verification.raw_probe.tool != null)' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" >/dev/null \
  || { echo "LANE-MOVE NOT PERSISTED (or next_agent still present / raw_probe missing)"; exit 1; }
```

**TaskSchema `next_agent` is `z.string().optional()` — OPTIONAL, NOT NULLABLE** (`orchStateSchema.ts:208`). Emitting `next_agent: null` on a `task_board` row aborts the write with `expected string, received null` → `[orch-apply] ABORTED: validator exit 2`, so the whole lane-move silently fails to land (live repro 2026-08-23; of 31 live `done_verified[]` rows 27 hold a string and 4 OMIT the key — zero hold null). Hence `del(.next_agent)`, never `next_agent: null`. Do NOT copy the `.head` idiom at the top of this file (`.head = {... next_agent:null}`): `HeadSchema.next_agent` IS `z.string().nullable().optional()` (`orchStateSchema.ts:324`), a genuinely different contract — that line is correct and must stay.
```
## RETURN
DONE: Task <id> verified against main HEAD commit <commit> — no branch/merge needed (already on main)
NEXT: pm | mark done, unblock downstream
PIPELINE: continue
```

<!-- jump:vc-changes -->
**verify-committed-changes:** append the failing check(s)/`ISSUE` to the row's `status_note` (file:line where applicable). Move `.task_board.qa[] -> .task_board.review[]` (back to review, status `QA -> REVIEW`), stamp `redispatch_count += 1` (mirrors the dead-worker resume convention already live on board rows, e.g. `UC-SDF-P4`'s `redispatch_count`/`resume_note`). Route to the row's own `owner` field, NOT `fixer` — there is no task branch for a fixer to work on; the owner must apply a NEW direct commit. **Exception — Behavioral-predicate AC failure only (missing mint-time `behavior_predicate`, see above):** route `next_agent: "po"` explicitly instead of `.owner` — the code owner cannot fix a missing mint-time field by committing again; PO/BA must re-author it at mint (`docs/agents/po/flow/main.md`). Say so verbatim in `$ISSUE_NOTE` so the owner fallback below isn't silently used instead. **Executable form (FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR, 2026-08-23 — same mechanism requirement as `vc-approved` above, this path previously had ZERO `orch-apply.sh` mention at all):**
```bash
task_id="<id>"                                   # the row's own id
# CEILING (live 2026-08-23): review[] IS in orch-row-prose-ceiling-check.mjs PROSE_CEILING_LANES.
# A long $ISSUE_NOTE appended to an already-large row hard-rejects at orch-apply Stage 2.5
# (ORCH_ROW_PROSE_CEILING_BYTES, default 12000) and the lane-move does not land. Keep this
# inline note a SHORT summary and put the verbatim issue list behind the row's `detail_ref`.
ISSUE_NOTE="<short summary of the failing check(s)/ISSUE — verbatim detail goes to detail_ref>"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg id "$task_id" --arg now "$NOW" --arg note "$ISSUE_NOTE" '
  (.task_board.qa // []) as $q
  | ([$q[] | select(.id == $id)][0]) as $t
  | if $t == null then error("id not in qa[] -- refuse")
    elif ($t.status // null) != "QA" then error("status != QA (\($t.status)) -- refuse")
    else . end
  | .task_board.qa = [$q[] | select(.id != $id)]
  | .task_board.review = ((.task_board.review // []) + [
      ($t + {
        status: "REVIEW",
        next_agent: ($t.owner // $t.owner_agent // "po"),
        redispatch_count: (($t.redispatch_count // 0) + 1),
        qa_changes_requested_at: $now,
        status_note: (($t.status_note // "") + "\n[QA] CHANGES_REQUESTED (direct-commit verify): " + $note)
      })
    ])
' "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

# Self-verify (mandatory — RETURN may not assert the lane-move without this passing):
jq -e --arg id "$task_id" '.task_board.review[]
  | select(.id == $id)
  | (.status == "REVIEW") and ((.next_agent | type) == "string")' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" >/dev/null \
  || { echo "LANE-MOVE NOT PERSISTED (or next_agent not a string)"; exit 1; }
```

**`next_agent` must resolve to a STRING, never null** — same `orchStateSchema.ts:208` contract as `vc-approved` above. A bare `next_agent: $t.owner` emits null whenever `.owner` is absent, which aborts the write; `.owner` IS absent on live `review[]` rows today (`RAG-FTS-BUILD-MEMORY-BOUND`, `FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE`, both confirmed 2026-08-23), so the `// $t.owner_agent // "po"` fallback chain is load-bearing, not defensive padding. When it falls through to `po`, say so in `$ISSUE_NOTE` so PO knows it must re-route.

**Dry-run either block before trusting it on a real row** (both were shipped once as prose, then once as jq that could not pass the validator — read-only inspection missed both). `orch-apply.sh` honours `ORCH_APPLY_LIVE_FILE_OVERRIDE`, so a full end-to-end rehearsal never touches the hot file:
```bash
FX=$(mktemp -d)/orch-state.json && cp "$PROJECT_ROOT/docs/data/orch/orch-state.json" "$FX"
export ORCH_APPLY_LIVE_FILE_OVERRIDE="$FX"     # orch-apply.sh writes here instead
# ...run the block above with "$FX" substituted for the jq input path; exit 0 == it will land.
unset ORCH_APPLY_LIVE_FILE_OVERRIDE            # MANDATORY — a leaked export sends real writes to the fixture
```
```
## RETURN
DONE: Direct-commit verify failed for <id> — see status_note for issues
NEXT: <row's own .owner field, e.g. developer/dev-<zone>/ba> | apply a new direct commit fixing the listed issues
PIPELINE: continue
```

## Approval

<!-- jump:approved -->
**DJ-GATE-1** (before DONE flip): verify `docs/agent-memory/decisions/sprint-<SPRINT_ID>-*.md` contains `task-id:** <TASK_ID>`; if absent → status stays REVIEW, `status_note: "journal-missing"`, `send_telegram(channel="work", message="[DJ-GATE-1] journal absent for <TASK_ID> — held REVIEW")`. Full gate: `docs/protocols/agent-chaining-protocol.md` § Journal-before-DONE Gate.

**APPROVED**: append `[QA] Review Record` → release sprint-task lock → merge + push + clean → return.
Merge commit subject must follow `docs/policies/commit-convention.md` — use `chore` or `feat` type, `<sprint>/<area>` scope; `Task:` trailer optional for merge commits bundling multiple tasks. Merge commits are AC-trailer exempt (AC lives on the feat/fix commit).
If QA writes a non-merge commit that carries `Task:` trailer, it must also carry `AC:` trailer.
QA non-merge commits with sprint scope (digit in scope) MUST carry `Task:` trailer.

**Release sprint-task lock** (dispatcher responsibility — see INV-GATEWAY-1):
```
// INV-GATEWAY-1 (2026-06-07): task_release is the dispatcher session's sole responsibility.
// This best-effort call may silently fail (no MCP gateway binding in specialist sub-session).
// The dispatcher finally-block and TTL expiry (3600s) are the authoritative release paths.
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "task:" + task_id,
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, apps/mcp-server/src/interface/mcp/
    tools/system/coordination/taskReleaseTool.ts:35-41 (P1-FINAL/TASK_1980). Substitute the real session
    id read from this spawn prompt's Coordination line (or your own `echo $CLAUDE_CODE_SESSION_ID` if you
    hold Bash) — NEVER write the literal text "$CLAUDE_CODE_SESSION_ID", it is sent as-is, not expanded>"
})
// Proceed with merge regardless of ok value — release is best-effort cleanup
```
```bash
git checkout main
git merge --no-ff task/NNN-kebab-description -m "chore(<sprint>/<area>): merge task/NNN-<title>"
git push origin main
# Clean branch — handle worktrees explicitly:
worktree_path=$(git worktree list --porcelain | grep -A1 "branch refs/heads/task/NNN" | grep "worktree" | awk '{print $2}')
if [ -n "$worktree_path" ]; then
  git worktree remove --force "$worktree_path"
fi
git branch -d task/NNN-kebab-description
git push origin --delete task/NNN-kebab-description 2>/dev/null || true  # ignore if no remote
```
```
## RETURN
DONE: Task NNN merged, pushed to main, branch deleted locally + remote, all tests green
NEXT: pm | mark Task NNN done, unblock downstream, queue next developer task
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```

<!-- jump:changes-requested -->
**CHANGES_REQUESTED**: append issues (file:line) → check fixer round count in handoff → return:
```
## RETURN
DONE: QA review complete — N issues found (see [QA] Review Record in handoff)
NEXT: fixer | apply minimum fixes to listed issues      ← round < 2
NEXT: architect | fixer ceiling hit, root-cause needed  ← round ≥ 2
HANDOFF: docs/handoffs/TASK_NNN.md
HANDOFF_DELTA: { "last_read_anchor": "<anchor_out>", "last_read_at": "<read_at>" }
PIPELINE: continue
```

<!-- jump:architect-review -->
**ARCHITECT_REVIEW_NEEDED** → return:
```
## RETURN
DONE: QA flagged architectural issue before merge
NEXT: architect | review Task NNN before merge, then re-run QA
HANDOFF: docs/handoffs/TASK_NNN.md
PIPELINE: continue
```

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`
  Notebook-write class: **APPEND** (AC-6) — compose settled ≤200L body in memory (AC-3 drop-oldest loop if > 200L) before single Write. SSOT: `.claude/skills/notebook-write/SKILL.md`.

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Browser/UI automation for E2E verification → skill: `.claude/skills/webapp-testing/SKILL.md` (trigger: QA task requires Playwright-based UI testing or verifying a web artifact beyond unit tests)

**Commit notebook** (direct — INV-GATEWAY-1):
```bash
# INV-GATEWAY-1: commit-mutex/task_claim/task_release MCP calls are the dispatcher session's sole
# responsibility; inner specialist agents commit directly (explicit paths), no mutex skill call.
git add docs/agent-memory/notebooks/qa.md
git commit -m "chore(memory/qa): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/qa.md
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

<!-- jump:emergency -->
## Emergency
Tests fail on main → revert breaking commit → `send_telegram(channel="bug", message="[qa] EMERGENCY: tests red on main — breaking commit reverted, merges blocked")` → open Backlog task → no merges until green
