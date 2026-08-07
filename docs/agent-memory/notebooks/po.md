# PO — Notebook

## 2026-08-07T01:43Z · dev-team Step 1 triage — job-level dedup hid a 6th failing file

### What actually happened
- Spawn prompt said the in-flight batch already covers both failing `ci_red` jobs → dedup and exit. Ran the **mandatory pre-dedup failing-FILE read** anyway. Job-level the batch covers 2/2 jobs; **file-level it covers 5 of 6 failing files**.
- The uncovered one: `apps/mcp-server/src/infrastructure/db/schema.ts` (size-lint, baseline=336 actual=372 upper=369). Minted `FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L` (P1, `apps/mcp-server/`, S).
- Manual-dispatch sweep: 41 eligible, 0 pre-flagged. Stamped + folded top pick `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM`.
- 3 orch-apply pipes, all landed (`task_total 754→755`, `signal_total 207=207`).

### Decisions worth keeping
- **A dedup target must be able to discharge the obligation, not just carry a matching string.** The 01:04Z tick folded `schema.ts` into `FIX-MCP-MEMORY-CODE-LEAK` on an exact `dedup_key`. The key was real; the obligation was spent — that row's size-lint consequence had already been minted out as `FIX-CI-SIZELINT-SCHEMA-TS-BASELINE-TOLERANCE-377L` and closed **DONE_VERIFIED 08-06T09:36Z**. The current RED came ~8h later from `8931e47c7` (`DEFLAKE-VNSTOCK-3STATEMENT`, +12/−1), an unrelated task. The memory-leak row is `review[]`/`next_agent=qa` and its live ACs are the image rebuild + backfill-frequency probe — **nothing touching line count**. On QA approval it leaves the non-terminal lanes and the key archives, orphaning the RED. Retired the key to `dedup_key_retired_20260807`; re-verified exactly one live holder.
- **The letter of the ANTI-AMNESTY check passed and the disposition was still wrong.** Backstop says "pre-existing" is valid only if it names an already-open FILE-scoped row. It did. The gap the fence does not close is a row that is open but whose matching obligation already shipped. Worth folding into `triage-signals.md` as a follow-up.
- **The prior fix recurred because it was a symptom fix, and the arithmetic says so.** `daaef1d21` trimmed init-guard *comments* to 361L against a 369L ceiling — 8L of headroom (372 − 11 net = 361). One routine commit ate it. So AC1 targets **≤336L, at or under baseline**, and explicitly **rejects a 362–369L trim as a pass**. Root cause is the baseline sitting ~36L under the file's real working size, not either commit.
- **Extraction here is not cosmetic.** schema.ts is the whole service's DB bootstrap, so AC4 requires suite verification *and* that `8931e47c7`'s busy_timeout-first ordering and the WeakSet identity guard survive behaviour-equivalent — both are live deflake/memory-leak fixes.
- **Did not pre-stamp `po_goahead` on the swept row, but wrote down why it's cheap.** That row's `supervised:true` gates on nothing upstream — its own mint note says it exists only to stop BOUNDED-1 idle-auto-launching a maintenance-lane row. This PO dispatch *is* the ratification event, so I put that in `po_manual_dispatch_note` for whichever tick sees it as `.head`.

### Evidence (raw, re-runnable)
- `gh run view 31136642246 --log-failed | grep -E 'pass / |FAILEDFILE'` → **empty** (neither job is the bun-test isolation runner) → FAILING_FILES taken verbatim from each failing step's error lines.
- `bash scripts/audits/size-lint-justification.sh --check` locally → same 4 offenders; `git diff HEAD -- .../schema.ts` empty. Live failure, not a stale log.
- The 5 deduped rows needed **no SHA append** — they already list `70ae0d9ae (run 31136642246)`. `CI-RED-70ae0d9a` and `CI-RED-417573d7` are different `check_id`s for the *same run*; dedup absorbed it correctly.
- Pre-checks all genuine no-ops, verified not assumed: `should_hold=false` (`supervised=false goahead=true`); `.signal_queue` 207 rows / **0 NEW**; TNB handoff Cycle 123 already ACKed 08-06T22:05:17Z; both telegram reads empty; `docs/signals/` 42 files, 1 parseable.
- Journal: `docs/agent-memory/decisions/triage-20260807T0143Z-po.md`.

### Carry-over
- `FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L` is the **6th** file of a 6-file CI RED; the other 5 are mid-flight in worktrees. CI cannot go green until all six land.
- Follow-up worth minting: `triage-signals.md` § `ci_red` dedup should require the matched row to still *own* the failing file's obligation (open lane is necessary, not sufficient) — this tick is instance 1.
- Unchanged from 01:04Z: `FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER` (ready[], P1) is the root cause of why none of these six were caught locally, and is dispatchable now.
