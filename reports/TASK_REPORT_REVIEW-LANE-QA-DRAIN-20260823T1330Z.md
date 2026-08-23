## Task Report — Review-Lane QA Drain, 2026-08-23T13:30Z

Scope: 12 `review[]` rows with `next_agent=qa` + 1 stranded `in_progress[]` row.
Mode: Direct-Commit Verify (`branch: null` throughout — all work committed straight to `main`).
Source lane adapted `review[]`→`done_verified[]` (guard on `status=="REVIEW"`), the cycle-809 deviation, because the shipped `qa[]`-guarded actuator refuses these rows by design — see the rejection below.

**Verdict: 8 DONE_VERIFIED · 2 CHANGES_REQUESTED · 2 HELD · 1 not-verifiable (assessed + re-routed)**

> **One verdict was RETRACTED mid-cycle.** `FIX-PM-DECOMPOSE-CLOSEOUT-…` was approved, then a concurrently-running pm agent reported it could not use the shipped step. I re-tested rather than accepting the report, one of its two claims held, and I reversed my own verdict to CHANGES_REQUESTED. Detail below.

### Suite results
| check | result |
|---|---|
| `pnpm --filter vn-market check` (`bun tsc --noEmit`) | exit 0, clean |
| `pnpm --filter vn-market test` | **15358 pass / 51 fail / 40 skip**, 15449 tests, 1278 files, 521s, exit 1 |
| `mock-guard.sh` | PASS (`No production source files to scan`) |
| DDD / security scan | N/A — zero production source touched |

The 51 failures are **pre-existing on `main` and unrelated by construction**: every one of the 10 verified commits touches only `.md` + `orch-state.json`; zero `.ts`/`.py`/`.js`. Partly tracked already (`DEFLAKE-1187-POLLNEWS-DEAD-PATH`). Not used to block doc-only rows, and not hidden. I checked whether the runner false-greens and it does **not** — pnpm propagates `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL ... Exit status 1`.

### APPROVED → DONE_VERIFIED (8)
Each carries a `verification.raw_probe` with the verbatim command and observed value.

1. **FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire** (`b7dba86db`) — guard exit 0; paired suite 24/24 incl. TEST10. Anti-false-green: the row warned a drained inbox fakes this, so I confirmed `cowork-fire` **is live in the guard's input array** while the guard still passes. Prior QA cycle measured 23/24 on exactly this gap.
3. **CLEAN-NB-AGENT-FATHER-MIXED-HEADING-OVERCAP-DISARM** (`336bde51e`, board-only) — closeout claim independently re-verified and **TRUE**: `2c46efece` real/on-main/correctly-subjected, archive file live, notebook 99L/9179B, 3/3 dated headings. The "0 guard WARNs" negative is non-vacuous — the guard fired 2026-08-23T09:52Z on other notebooks.
4. **FIX-TNB-AUDIT-STEPS-ASSUME-NONEXISTENT-CHANNEL-PARAM** (`232f153e8`) — 0 call sites remain (5 refs, all explanatory non-use). Premise confirmed at source: `channel` occurs **0 times** in `telegramReportTools.ts`.
5. **FIX-COWORK-FLOWDOC-STALE-WEEKEND-SUPPRESSION-AND-BGFAN1-…** (`4ae46cedc`) — AC-A + AC-B met; premises re-derived (weekend `interval_minutes=480`; `evaluateCadence` at `cadence-policy.js:52`).
6. **FIX-DEVFLOW-SELFCONTAINED-ZONE-FLOWS-SUCCESS-PATH-NO-HEAD-SYNC** (`8880ca2fb`) — guarded `.head` reset in all 4 files, matching SSOT `microservice-main.md:165-166`.
7. **FIX-COWORK-TICKSNAPSHOT-STEP47-…** (`b545a69cc`) — *status_note was stale*; shipped. Now sources `mcp-call.sh`; false premise corrected + SUPERSEDED.
8. **FIX-COWORK-SPAWNFANOUT-STEP53-…** (`b545a69cc`) — *status_note still literally reads "LATENT, NOT SHIPPED"*; it **is** shipped. Both defects closed, incl. the load-bearing surface-scoping.
9. **FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE** (`d05864c40`) — 29/29 re-run incl. live-DB T10; out-of-zone revert verified byte-exactly (sha256 `f1a8ee92b7d08755`).

### CHANGES_REQUESTED (2)
**FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR** → `review[]`, `next_agent=agent-father`, `redispatch_count=1`.
Found only by **executing** the shipped actuator through the real write path.

- **[1] BLOCKER `docs/agents/qa/flow/main.md:218`** — `next_agent: null`. `done_verified[]` is governed by `orchStateSchema.ts:208` `z.string().optional()` — optional but **not nullable**. Live repro: `VALIDATION FAILED (10 issues) … next_agent: expected string, received null` → `[orch-apply] ABORTED: validator exit 2`. Of 30 live rows, 27 string / 3 key-absent / **0 null**. Root cause: the `.head` idiom was copied in, where null *is* legal (`HeadSchema:324` is `.nullable()`). Fix: `del(.next_agent)`.
- **[2] BLOCKER `docs/agents/qa/flow/main.md:203-228`** — never writes `verification.raw_probe`, but RC-VERIF rejects any `DONE_VERIFIED` lacking it. Surfaced immediately after fixing [1].
- **[3] LATENT `docs/agents/qa/flow/main.md:252`** — `next_agent: $t.owner` writes null when owner is absent; true right now for two live `review[]` rows.
- **[4] NON-BLOCKING** — both blocks guard `qa[]`/`status=="QA"`, but all 13 rows today arrived `review[]`/`REVIEW`.

Net: the row replaced a prose-only lane move with an actuator that **cannot complete a lane move**. Its own predicted D3 prose-ceiling caveat also came true on its own rejection (9986B→13293B breach), so the full issue text lives in `detail_ref` cold store.

**FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT** → `review[]`, `next_agent=agents-architect`, `redispatch_count=1`. **This retracts my own DONE_VERIFIED issued ~25 min earlier.**

My first pass verified the *reachability* half (genuinely fixed, 0 violations) but never tested which **lane** the step resolves parents from. A concurrent pm agent hit that gap on 9 real parents. I re-tested both of its claims:

- **[1] BLOCKER — CONFIRMED.** Step 3e's *both* branches resolve `$row` from `in_progress[]` + `active_sprints[].tasks[]` only. On a `ready[]` parent the closeout branch appends an **id-less ghost row** to `done[]` (jq `null + {...}`) **and leaves the parent in `ready[]`**; `orch-validate` then hard-rejects the write, so the step is unusable — exactly pm's experience (8 of 9 parents in `ready[]`). The **partial branch is worse: a silent no-op** — exits 0, `|| echo ABORTED` never fires. Scope is *wider* than pm reported: rows carrying `children[]` sit in **backlog 10 / done 9 / ready 6 / in_progress 1**, so `backlog[]` is unhandled too and the one handled lane holds a single row. I had flagged this same not-found hazard on my first pass but sized it "non-blocking edge case" — pm's frequency evidence is what makes it blocking, and I was wrong.
- **[2] NOT CONFIRMED — recorded, not passed through.** pm also reported a schema-invalid `next_agent: null`. It does not apply here: the only null is inside `.head = {...}`, which *is* nullable (`HeadSchema`, `orchStateSchema.ts:324`). The closeout preserves the row's `next_agent`. The genuine non-nullable (`:208`) defect belongs to the qa row, where I filed it independently — it appears to have been carried across between rows.

### HELD — not verified, no defect evidence (2)
- **FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE** → `next_agent=ops`. Fix real and on `main` (`3db7a8dc8`, `acquire(blocking=True, timeout=wait)`), but REBUILD_REQUIRED verified TRUE: the running container was created 2026-08-15 and is "Up 8 days", predating the fix. AC-8/AC-9 structurally uncertifiable. Honoured the implementer's "Do NOT certify AC-8 on a zero-traffic window."
- **RAG-FTS-BUILD-MEMORY-BOUND** → `next_agent=po`. **Prose beats lane**: the row's own field says "done_verified STILL WITHHELD", time-gated to 2026-09-20, with a HARD GUARD noting it already produced one false green.

### Not verifiable — assessed, not skipped (1)
**FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58** (`in_progress[]`) → `next_agent` `qa`→`po`; status/lane untouched. Its own `blocked_reason` says "Not dispatchable work"; `status=BLOCKED`, `plan_only`, `supervised`, no commit, defect still live (system-map still 34). Real work sits in 3 child rows. Secondary finding: parent has **no `children[]` field** — a live instance of exactly the drift that row #2's new Step 3e prevents going forward.

### Follow-ups for the router to mint (QA endorses, not minted here — out of zone)
1. **scripts/ regression verifier + fixtures for the qa vc-* actuators** (AC-4/AC-5, developer). A fixture asserting each block's output passes `orch-validate.mjs` would have caught blockers [1] and [2] pre-ship. Strongly endorsed.
2. **scripts/ de-stamp mode** for `cowork-write-last-fired.js` (`--destamp`), per row #5's own deferral.

### Lifecycle note
Peer commit `58bd68df6` cold-evicted 8 of my freshly-verified rows from `done_verified[]` into `archive/2026-08.json` `done_tasks[]` mid-cycle. Verified as **normal eviction, not data loss** — all 8 present with Review Record and `raw_probe` intact. The retracted pm row had to be pulled back out of that archive into hot `review[]`; the archive copy was then deleted, and uniqueness re-checked (hot=1, archive=0).

### Incidental
`docs/data/orch/archive/backlog-detail.json` had a pre-existing `count=465` vs `items=466` off-by-one; healed to 467 alongside my append.
