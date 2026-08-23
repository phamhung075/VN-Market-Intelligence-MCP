# pm Step 3e — lane-agnostic parent resolution, fail-loud refusal, and the 3-way disposition

**Task:** `FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT` (P0, review[], `redispatch_count=1`)
**Author:** agents-architect · 2026-08-23T14:15:51Z
**Supersedes (partially):** `docs/architecture-briefs/2026-08-14-pm-decompose-closeout-reachability-and-nextagent-mint.md` §5 + §8 — that brief's §2 (reachability), §3 (fleet sweep), §4 (`next_agent` SSOT), §6 (epic-wrapper reconciliation) and §7 (no dev-team gate) all still stand and are NOT re-opened here. Only the Step-3e **write transform** (§5) and the **acceptance-fixture matrix** (§8) are replaced.
**Prior implementation:** commit `e6a4858ae` (agent-father) — faithful to the 08-14 brief. The defect below is a defect in **my own §5 illustrative jq**, not in the implementation of it.

---

## 0. What is and is not being re-opened

| Claim | Verdict here |
|---|---|
| Step 3e resolves `$row` from `in_progress[]` + `active_sprints[].tasks[]` only; `ready[]`/`backlog[]` parents break | **CONFIRMED — reproduced end-to-end, §1** |
| The closeout branch writes an ID-less ghost row into `done[]` | **CONFIRMED — exact validator string reproduced, §1.1** |
| The partial branch is a silent exit-0 no-op | **CONFIRMED — and it still resets `.head`, so the cycle reads closed, §1.2** |
| Step 3e emits a schema-invalid `next_agent: null` | **NOT RE-OPENED.** qa's non-confirmation is correct and independently re-verified: the only `null` this block writes is inside `.head = {...}`, and `HeadSchema.next_agent` is `.nullable().optional()` (`orchStateSchema.ts:324`). `TaskSchema.next_agent` at `:208` is `z.string().optional()` (non-nullable) — that is the FIX-QA-VC-LANEMOVE row's defect, filed there. **Do not chase it in this file.** §4.3 below prescribes `del(.next_agent)` on the *terminal* row shape — that is a different, additive ruling about a row that keeps a *stale string*, not about writing a null. |
| The reachability restructure (Step 3d/3e above the RETURN, Steps 4/4b under a bounded `## ` heading, the invariant note, the Step-3 mint shape) | **KEEP — unchanged.** Re-verified: `## RETURN` at L163, `## Task Lifecycle — Later-Cycle Steps` at L175, no numbered step between them. |

---

## 1. Reproduction (executable, synthetic fixtures only — live board never touched)

Harness: `ORCH_APPLY_LIVE_FILE_OVERRIDE=<fixture>` (the sanctioned test hook already in `scripts/orch-apply.sh`). Fixture = minimal schema-valid board with one parent in `ready[]`, one in `backlog[]`, one in `active_sprints[0].tasks[]`, one already in `done[]`, and one duplicated across `qa[]`+`review[]`.

### 1.1 CLOSEOUT branch, `ready[]` parent — ghost row, whole write rejected

Running the shipped jq verbatim with `SPRINT_ID=PARENT-READY`:

```
candidate .task_board.done  →  [{"status":"DONE","closed_at":"…","children":["C1","C2"]}]   ← no id
candidate .task_board.ready →  ["PARENT-READY"]                                             ← parent never left

$ … | bash scripts/orch-apply.sh
ORCH-STATE VALIDATION FAILED (1 issue) — fix and retry:
[1] task_board.done[0].id: expected string, received undefined.
[orch-apply] ABORTED: validator exit 2 — live file untouched
```

`null + {…}` in jq yields the patch object alone, so `$row == null` silently produces an id-less row. `orch-validate` catches it — but the **shell wrapper swallows the failure**: the shipped line ends `|| echo "[pm] decomposition-closeout ABORTED …"`, and `echo` succeeds, so the branch's overall exit status is **0**. Measured: `wrapped exit=0`. pm's cycle continues and emits its `## RETURN` as if the closeout landed.

### 1.2 PARTIAL branch, `ready[]` parent — worse: it "succeeds"

Both `map()`s target `in_progress[]` and `active_sprints[]`, neither matches, so the candidate is the identity document **plus the `.head` null-out**. It is schema-valid, so `orch-apply` **applies it and exits 0**:

```
post-write .head  → {"status":"idle","active_task_id":null,"next_agent":null,"updated_by":"pm"}
post-write ready[]→ [{"id":"PARENT-READY","status":"READY","next_agent":"pm"}]   ← unchanged
```

`.head` is idle (the cycle looks closed out) while the parent keeps its stale `next_agent`, keeps its lane, and re-surfaces to pm on the next dispatch sweep. **This is byte-for-byte the occurrence-1/2/3 symptom the row exists to end.** No error, no warning, no signal.

### 1.3 Why the lane assumption was wrong — the two dispatch paths

`scripts/devteam-backlog-claim-ready-lane-consumer.jq` picks from `.task_board.ready[]` and **moves the row into `in_progress[]`** (`:142`/`:150`). Under that path the parent genuinely is in `in_progress[]` at Step-3e time. The 08-14 jq encoded that path and only that path.

The **router's manual dispatch sweep does not move the row** — it picks by `next_agent` and spawns. Under that path the parent stays exactly where it was. pm's 2026-08-23T13:44Z run was a manual sweep of "the 9 `ready[]` rows carrying `next_agent=pm`", so **8 of 9 parents were in `ready[]`** (pm notebook, "What I learned this cycle" §3). pm implemented the correct semantics by hand and persisted them as `scripts/pm-decompose-20260823-manual-dispatch-queue.jq`.

### 1.4 Live lane census (independently re-measured, matches qa exactly)

Rows carrying `children[]`: **backlog 10 / done 9 / ready 6 / in_progress 1 / active_sprints 0.** The one lane the shipped transform handles holds 1 of 26. `review[]` and `qa[]` are additionally unhandled and are *not* in qa's proposed fix list either.

---

## 2. Root cause — one mistake, two surfaces

> A **hand-enumerated subset of lanes** was substituted for the schema's lane set — in the write transform *and* in the acceptance fixture that was supposed to catch it.

- **Transform:** 2 of 8 flat lanes + 1 of 2 sprint arrays were named literally.
- **Acceptance fixture (08-14 brief §8):** the AC-1/AC-2 replay spec said "a synthetic board" and enumerated the *branch* matrix (`complete` × `partial`) but never the *lane* matrix. A fixture built exactly to that spec passes on an `in_progress[]` parent and never exercises `ready[]`. The commit's own AC line reads *"reachability invariant replayed **manually**"* — AC-1/AC-2/AC-3 were never mechanized at all (`scripts/audits/` contains no `pm-decompose-*` or reachability verifier today, grep-confirmed).

Fixing the transform with **another hand-list** (qa's suggested `backlog/ready/in_progress/active_sprints` — which still omits `review[]`, `qa[]`, `done_verified[]`, `archive[]`, `closed_sprints[]`) reproduces the class one generation later. Same failure mode as `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`.

**Invariant adopted here:**

> **LANE-SET-DERIVATION.** Any orch-state transform or verifier that must locate a row by id MUST discover its lane set **structurally from the document** (`.task_board | to_entries | select(.value|type=="array")`, sprint arrays identified by their elements carrying `.tasks`). The only permitted hand-named lane set is the **terminal** set, and it must be applied as an *exclusion from a live default* — so a lane added to `TaskBoardSchema` later is treated as live and searched, never silently skipped.

---

## 3. Ruling: the transform moves out of the flow doc into `scripts/`

The 08-14 brief embedded the jq in prose and labelled it *"illustrative — exact jq needs a real re-read/anchor pass by whichever agent implements it."* That escape hatch is what shipped. A jq blob living inside a markdown heredoc:

1. cannot be unit-tested, so AC-1/AC-2 can only ever be "replayed manually";
2. must be re-derived by every reader, which is why pm hand-rolled two variants in one day (`scripts/pm-decompose-20260823-manual-dispatch-queue.jq`, `scripts/pm-decompose-20260823T1045-siginbox-and-proseceiling.jq`);
3. pushes `docs/agents/pm/flow/main.md` (275L today) further past the **120L `flow-file` cap** in `docs/data/file-size-caps.json` — currently inert only because of the glob defect tracked as `FIX-FILESIZECAPS-FLOWFILE-GLOB-NESTED-DIR-ONLY-173-FLOW-FILES-UNGOVERNED` (ready[], architect). Growing the inline blob deepens a breach that is already scheduled to become live.

**Ruling:** the transform becomes `scripts/pm-decompose-closeout.jq` (+ thin `scripts/pm-decompose-closeout.sh` wrapper doing the shell guard and the post-write probe). `docs/agents/pm/flow/main.md` Step 3e shrinks to a disposition table + a call site + the `docs/policies/dev-standards.md` § Script Persistence pointer. This also cleanly splits the zones: `scripts/` → **developer**; the flow doc → **agent-father**.

---

## 4. The corrected design

### 4.1 Shared resolution prologue (tested)

```jq
def toarr: if type=="array" then . elif .==null then [] else [.] end;
def is_sprint_array: (type=="array") and (any(.[]; type=="object" and has("tasks")));
def flat_lane_keys:
  [ .task_board | to_entries[]
    | select((.value|type)=="array") | select((.value|is_sprint_array)|not) | .key ];
def sprint_lane_keys:
  [ .task_board | to_entries[]
    | select((.value|type)=="array") | select(.value|is_sprint_array) | .key ];
# The ONLY hand-named set. Default is LIVE: an unknown/new lane is searched, never skipped.
def terminal_lanes: ["done","done_verified","archive","closed_sprints"];

def locate($sid):
  . as $doc
  | ( [ (flat_lane_keys)[] as $l
        | ($doc.task_board[$l] // []) | to_entries[]
        | select(.value.id == $sid) | {lane:$l, sprint:null, row:.value} ]
    + [ (sprint_lane_keys)[] as $l
        | ($doc.task_board[$l] // []) | to_entries[] as $s
        | (($s.value.tasks) // []) | to_entries[]
        | select(.value.id == $sid) | {lane:$l, sprint:$s.value.id, row:.value} ] );
```

Verified against the fixture: `PARENT-READY→ready`, `PARENT-BACKLOG→backlog`, `PARENT-SPRINT→active_sprints/SPR-1`, `PARENT-ALREADY-DONE→done`, `PARENT-DUP→[qa,review]`, `NOPE→[]`.

### 4.2 Fail-loud refusal — three layers, because one is not enough

| Layer | Mechanism | Catches |
|---|---|---|
| **L1 — in-jq** | `if ($hits\|length)==0 then error("[pm 3e] parent \($sid) NOT FOUND in any task_board lane -- refuse") elif ($hits\|length)>1 then error("… resolves in N lanes (…) -- refuse") else . end` — mirrors `docs/agents/qa/flow/main.md:211-212` verbatim in style | miss + cross-lane duplicate. jq exits 5, `orch-apply` receives empty stdin → exit 3, live file untouched |
| **L2 — shell** | `\|\| { echo "[pm 3e] …" >&2; exit 1; }` — **never bare `\|\| echo`**. This is the idiom Step 3c in the same file already uses (`\|\| { echo "[pm] ABORTED: …" >&2; exit 1; }`); Step 3e diverged from its own neighbour | a validator/CAS/ceiling rejection that L1 cannot see |
| **L3 — post-write probe** | mandatory re-read (§4.5) | an executor that ignores exit codes — i.e. an LLM reading the flow doc as prose |

L3 is not belt-and-braces: a flow doc is executed by an LLM, and `docs/protocols/fail-loud-protocol.md` § Analysis-Only Exit Guard already rules that *"any step that writes an artifact AND asserts its own persistence must re-read the persistence layer before claiming it — never trust the write call's own exit code."* Step 3e asserts persistence and never re-reads. That is the reason occurrence 1-3 all read as successful cycles.

### 4.3 Disposition A — CLOSEOUT-TERMINAL (tested)

```jq
(locate($sid)) as $hits
| if   ($hits|length) == 0 then error("[pm 3e] parent \($sid) NOT FOUND in any task_board lane -- refuse")
  elif ($hits|length) >  1 then error("[pm 3e] parent \($sid) resolves in \($hits|length) lanes (\($hits|map(.lane)|join(","))) -- refuse")
  else . end
| $hits[0] as $hit | $hit.row as $row
| ( reduce (($row.children // []) + $children)[] as $c ([]; if index($c) then . else . + [$c] end) ) as $all_children
| (if (terminal_lanes | index($hit.lane)) != null then
     # already terminal -> IDEMPOTENT: never re-append, only backfill children[]
     ( if $hit.sprint == null
       then .task_board[$hit.lane] |= map(if .id == $sid then . + {children:$all_children, updated_at:$t, updated_by:$u} else . end)
       else .task_board[$hit.lane] |= map(.tasks |= map(if .id == $sid then . + {children:$all_children, updated_at:$t, updated_by:$u} else . end))
       end )
   else
     ( if $hit.sprint == null
       then .task_board[$hit.lane] |= map(select(.id != $sid))
       else .task_board[$hit.lane] |= map(.tasks |= map(select(.id != $sid)))
       end )
     | .task_board.done = ((.task_board.done // []) + [
         $row
         | del(.next_agent)                    # string|absent — NEVER null (TaskSchema:208)
         | . + { status:"DONE", closed_at:$t, children:$all_children,
                 updated_at:$t, updated_by:$u,
                 pm_decomposition_complete:true, pm_closeout_note:$note } ])
   end)
| (if $head_active == $sid then
     .head = {status:"idle", active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
   else . end)
```

Three rulings embedded:

- **`del(.next_agent)`, not `next_agent: null`.** pm hit the null rejection live on all 7 of its closeouts ("`next_agent: null` is schema-invalid… `del(.next_agent)` is the correct terminal shape", pm notebook §8). *Preserving* the stale string is also wrong: the router's manual sweep picks by `next_agent`, which is precisely why decomposed parents "kept returning to pm" (pm notebook §1). A terminal decomposed umbrella has no next hop by construction.
- **`children` is the FULL set**, order-preserving union of pre-existing `.children` and this cycle's mints — not just this cycle's. 4 of pm's 10 rows "did not need decomposing — they needed `children[]`" (pm notebook §1): they were already split by an earlier cycle and this invocation mints zero.
- **Terminal-lane hit is idempotent, not an error.** Re-running 3e on an already-closed parent backfills `children[]` and cannot duplicate the row into `done[]`.

### 4.4 Dispositions B and C — the binary is wrong, it is a 3-way

The shipped `DECOMPOSITION_COMPLETE=true|false` collapses two genuinely different open states, and pm wrote **both** on 2026-08-23:

| | **A · CLOSEOUT-TERMINAL** | **B · DELEGATED-HELD** | **C · PARTIAL** |
|---|---|---|---|
| all scope delegated? | yes | yes | no |
| parent owes its own verification? | no | **yes — a child owns the parent's `verification_gate`** | n/a |
| lane | → `done[]`, `DONE` | stays | stays |
| `pm_decomposition_complete` | `true` | `true` | `false` |
| `children[]` | full set | full set | full set |
| `next_agent` | **deleted** | the verifying agent | corrected non-stale value |
| `hold_reason` | — | **absent, deliberately** | **SET** |
| live example (2026-08-23) | pm's 7 closeouts | `FIX-SIGNAL-INBOX-…-LITTER`, `FIX-ORCH-PROSE-CEILING-…` (10:45Z) | `IVC-PM-DECOMPOSE` (13:44Z) |

**Why `hold_reason` is load-bearing and not decoration.** Writing `children[]` flips `is_epic_wrapper` (`scripts/lib/devteam-eligibility.jq:167`), which makes the parent permanently undispatchable by every automated picker (`:431`) — the "corrected non-stale `next_agent`" of disposition C is decorative to RLC/BOUNDED-1 and only reachable by a manual sweep. Worse, `scripts/devteam-wrapper-autoclose.jq` sweeps any `ready[]`/`in_progress[]` wrapper whose children all reach a terminal status **into `review[]`** — which would silently destroy disposition C's residual pm hop. That script's only escape hatch is `has_hold_reason` (`devteam-eligibility.jq:491-493`, applied at `devteam-wrapper-autoclose.jq:99`). So:

- **C must set `hold_reason`** — otherwise the pm re-entry is stolen by the autoclose sweep.
- **B must NOT set it** — for B, being swept to `review[]` when the children finish is exactly the desired closeout.

**Live hazard, currently armed, reported not fixed:** 8 rows in `ready[]`/`in_progress[]` carry non-empty `children[]` with **no `hold_reason`**. `IVC-PM-DECOMPOSE` is a genuine disposition-C row (`pm_decomposition_complete:false`, `next_agent:pm`, `depends_on:[IVC-A1]`) with no `hold_reason` — its pm re-entry hop will be consumed by the autoclose sweep once `IVC-C1..C6/A1/A2` go terminal. The `depends_on` gate does not protect it: autoclose is not dep-gated.

### 4.4b Disposition B/C shared transform (tested)

```jq
(locate($sid)) as $hits
| if   ($hits|length) == 0 then error("[pm 3e] parent \($sid) NOT FOUND in any task_board lane -- refuse")
  elif ($hits|length) >  1 then error("[pm 3e] parent \($sid) resolves in \($hits|length) lanes (\($hits|map(.lane)|join(","))) -- refuse")
  else . end
| $hits[0] as $hit
| if (terminal_lanes | index($hit.lane)) != null
  then error("[pm 3e] parent \($sid) is already TERMINAL in \($hit.lane)[] -- an open disposition is incoherent, refuse")
  else . end
| $hit.row as $row
| ( reduce (($row.children // []) + $children)[] as $c ([]; if index($c) then . else . + [$c] end) ) as $all_children
| ( { next_agent:$na, updated_at:$t, updated_by:$u,
      pm_decomposition_complete:($complete == "true"), pm_disposition_note:$note }
    + (if ($all_children|length) > 0 then {children:$all_children} else {} end)
    + (if $hold != ""                then {hold_reason:$hold}      else {} end) ) as $patch
| (if $hit.sprint == null
   then .task_board[$hit.lane] |= map(if .id == $sid then . + $patch else . end)
   else .task_board[$hit.lane] |= map(.tasks |= map(if .id == $sid then . + $patch else . end))
   end)
| (if $head_active == $sid then
     .head = {status:"idle", active_task_id:null, next_agent:null, updated_at:$t, updated_by:$u}
   else . end)
```

`$complete="false"` + non-empty `$hold` = disposition C. `$complete="true"` + `$hold=""` = disposition B.

### 4.5 Mandatory post-write probe (L3)

```jq
def is_sprint_array: (type=="array") and (any(.[]; type=="object" and has("tasks")));
def probe($l): {lane:$l, status, na:(.next_agent//"<absent>"), children:((.children//[])|length),
                pmc:(if has("pm_decomposition_complete") then .pm_decomposition_complete else "<absent>" end),
                by:(.updated_by//"<absent>")};
[ .task_board | to_entries[] | select((.value|type)=="array") | .key as $l
  | if (.value|is_sprint_array) then (.value[]|.tasks[]?|select(.id==$sid)|probe($l))
    else (.value[]|select(.id==$sid)|probe($l)) end ] as $hits
| {found:($hits|length), where:$hits, head_status:.head.status, head_active:.head.active_task_id}
```

Assertions (pm MUST refuse to emit `## RETURN` unless they hold):

- `found == 1`
- A → `where[0] == {lane:"done", status:"DONE", na:"<absent>", children:>0, pmc:true, by:"pm"}`
- B/C → `where[0].lane` unchanged, `children:>0`, `pmc` is a boolean (`true`/`false`), `by == "pm"`
- `head_active == null` **iff** it named `$SPRINT_ID` before the write

Measured discrimination on the three live-run fixtures — this is the assertion that would have caught the shipped defect on day one:

```
correct closeout : {"lane":"done","status":"DONE","na":"<absent>","children":2,"pmc":true,      "by":"pm"}
correct partial  : {"lane":"ready","status":"READY","na":"pm",     "children":2,"pmc":false,     "by":"pm"}
SHIPPED no-op    : {"lane":"ready","status":"READY","na":"pm",     "children":0,"pmc":"<absent>","by":"<absent>"}
```

### 4.6 Dependents retarget — mandatory pre-step of disposition A (tested)

`deps_satisfied()` (`devteam-eligibility.jq:278-281`) requires **exactly `DONE_VERIFIED`**. A parent closed as *decomposed* reaches `DONE` and never gets a QA hop, so it can never reach `DONE_VERIFIED` — every row that depends on it is stranded forever. pm hit this live and retargeted 2 dependents by hand ("Always scan dependents before a decomposition closeout", pm notebook §4). Disposition A must therefore carry this in the SAME write:

```jq
def retarget($sid; $children; $t; $u):
  ((.depends_on | toarr) + (.depends | toarr) | unique) as $all
  | if ($all | index($sid)) then
      . + { depends_on: (($all | map(select(. != $sid))) + $children | unique),
            updated_at: $t, updated_by: $u }
        | del(.depends)                 # orch-validate Stage 1f rejects both-fields divergence
    else . end;
reduce ((flat_lane_keys)[]) as $l (.;
    if (terminal_lanes | index($l)) != null then . else .task_board[$l] |= map(retarget($sid;$children;$t;$u)) end)
| reduce ((sprint_lane_keys)[]) as $l (.;
    if (terminal_lanes | index($l)) != null then . else .task_board[$l] |= map(.tasks |= map(retarget($sid;$children;$t;$u))) end)
```

Verified: `depends_on:["PARENT","OTHER"] → ["C1","C2","OTHER"]`; legacy scalar `depends:"PARENT" → depends_on:["C1","C2"]` with `.depends` removed; unrelated rows untouched; **idempotent on re-run**.

Cross-reference, do **not** duplicate: the systemic half (nothing produces `DONE_VERIFIED`) is `FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION` (P0, in progress). This brief only stops pm from *manufacturing new* instances of it.

### 4.7 Prose-ceiling pre-flight — dispositions B and C are mechanically blocked on fat rows

`scripts/orch-row-prose-ceiling-check.mjs` guards `PROSE_CEILING_LANES = ['backlog','ready','review']` growth-only. Measured on a synthetic 13011 B `ready[]` row:

```
B/C in-place patch (full)     : live=13011B -> candidate=13131B   → ABORTED
B/C in-place patch (minimal)  : live=13011B -> candidate=13045B   → ABORTED   (+34 B is enough)
A  closeout ready[] -> done[] :                                     → OK      (row leaves the measured set)
```

So **any** in-place disposition on an over-ceiling row in a guarded lane hard-rejects — even a 34-byte structural patch. **21 rows** in `backlog`/`ready`/`review` are over the ceiling today, several of them decomposition parents already carrying `children[]` (e.g. `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` ready[] 15537 B / 3 children; `FIX-A21-CRASH-WINDOW-PREDECESSOR-BOUND-FALSE-NEGATIVE` backlog[] 20292 B / 2 children).

Required branch: before a B/C write, pm probes the parent's prose bytes. Over ceiling → **refuse loudly** and either (a) stub the row first via `scripts/orch-backlog-stub.sh` (`LANES=ready` / `--lane` is supported; it is the checker's own sanctioned escape hatch, routing prose to `detail_ref`), or (b) escalate. Never split the write to dodge the check — the checker's error text forbids exactly that. Root fix is owned elsewhere: `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS` (ready[], developer) defect D3.

### 4.8 Live inconsistency this taxonomy explains

`FIX-SIGNAL-INBOX-NON-DRAINABLE-…-LITTER` and `FIX-ORCH-PROSE-CEILING-…` both sit in `ready[]` with `pm_decomposition_complete: true`, no `closed_at`, no closeout note, `next_agent: developer`. Under the shipped binary that state is incoherent (the flag says close, the disposition says stay). Under the 3-way it is a **valid disposition B** and just needs the label. Reported for PO/pm; **not touched here.**

---

## 5. Replacement AC matrix (supersedes 08-14 brief §8)

The fixture matrix is **derived, not enumerated**: the verifier reads the lane keys out of `orchStateSchema.ts`'s `TaskBoardSchema` (or, equivalently, out of a full synthetic board built with one row per lane) and runs each disposition against **every** lane. Adding a lane to the schema without adding a fixture must fail the verifier.

| AC | Assertion | Status now |
|---|---|---|
| **AC-1** | Disposition A on a parent in **each** flat lane + `active_sprints[].tasks[]` → parent in `done[]`/`DONE`/`children[]`/`next_agent` absent, source lane emptied, `.head` idle, every minted child carries a non-empty `next_agent` | jq **proven** on ready/backlog/sprint/terminal (§4.3); needs mechanizing per-lane |
| **AC-2** | Disposition C (negative control) → parent STAYS in its lane, `pm_decomposition_complete:false`, `hold_reason` set, `.head` idle, **not** in `done[]` | jq **proven** (§4.4b) |
| **AC-2b** | Disposition B → parent stays, `pm_decomposition_complete:true`, `hold_reason` **absent**, `next_agent` = verifier | jq **proven** (§4.4b) |
| **AC-3** | Executable reachability check: positive fixture = pre-`e6a4858ae` `pm/flow/main.md` (FAILS); negative = current `pm/flow/main.md` + `dev-team/flow/main.md` + `qa/flow/main.md` (PASS) | **NOT BUILT** — still only manual |
| **AC-4** | Miss / cross-lane duplicate / terminal-lane-with-open-disposition each **refuse** with a distinct non-zero exit; live file byte-identical afterwards | jq **proven**, exit 5 on all three (§4.2 L1) |
| **AC-5** | Shell wrapper propagates failure — `orch-apply` non-zero ⇒ step exit non-zero. Regression fixture: the `\|\| echo` form must FAIL this AC | **NOT BUILT** — measured `wrapped exit=0` today |
| **AC-6** | Post-write probe distinguishes correct-A / correct-B / correct-C / silent-no-op | probe **proven** (§4.5) |
| **AC-7** | Dependents naming a closed parent are retargeted onto its children in the same write; idempotent; unrelated rows untouched | jq **proven** (§4.6) |
| **AC-8** | Over-ceiling parent + disposition B/C ⇒ loud refusal, not a swallowed `orch-apply` rejection | **NOT BUILT** |

All fixtures synthetic, via `ORCH_APPLY_LIVE_FILE_OVERRIDE` — zero live `orch-state.json` I/O, mirroring `scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh`.

---

## 6. Rows to mint (zone-split, sequenced — do not bundle)

This brief writes **no** `docs/data/orch/orch-state.json` task rows; PO/pm mint them.

| # | Row id | Owner / `next_agent` | Zone | Size | depends_on |
|---|---|---|---|---|---|
| 1 | `FIX-PM-3E-FAILLOUD-HOTFIX` | agent-father | `docs/agents/pm/flow/` | XS | — |
| 2 | `FIX-PM-3E-CLOSEOUT-SCRIPT-LANE-AGNOSTIC` | developer | `scripts/` | M | — |
| 3 | `FIX-PM-3E-FLOWDOC-REPOINT-3WAY-DISPOSITION` | agent-father | `docs/agents/pm/flow/` | S | 2 |
| 4 | `FIX-FLOWDOC-RETURN-REACHABILITY-CHECKER` | developer | `scripts/audits/` | S | — |

**Row 1 — stop the bleed (ship immediately, independent of everything else).** Two edits inside the existing inline Step 3e: insert the `$row == null` / duplicate `error(…)` guard (§4.2 L1) into both branches, and change both `|| echo "…"` tails to `|| { echo "…" >&2; exit 1; }` (§4.2 L2). This does **not** make Step 3e work on `ready[]`/`backlog[]` — it converts a silent corruption/no-op into a visible refusal while row 2 lands. Rows 1 and 3 touch the same block; row 3 supersedes row 1, so sequence them.

**Row 2 — `scripts/pm-decompose-closeout.jq` + `scripts/pm-decompose-closeout.sh` + `scripts/audits/pm-decompose-closeout-replay-verify.sh`.** §4.1/§4.3/§4.4b/§4.5/§4.6/§4.7 verbatim (all jq in this brief is fixture-executed, copy-runnable). Verifier covers AC-1/2/2b/4/5/6/7/8 with the schema-derived lane matrix of §5.

**Row 3 — flow-doc repoint.** Step 3e becomes: the 3-way disposition table (§4.4), the `DECOMPOSITION_DISPOSITION=A|B|C` decision rule, the script call site, the mandatory post-write probe assertions (§4.5), the ceiling pre-flight branch (§4.7), and the § Script Persistence pointer. **Must shrink, not grow, the block** — the inline jq leaves the file. Keep the reachability invariant note and the `## Task Lifecycle` segment marker exactly as they are.

**Row 4 — AC-3.** `scripts/audits/flow-doc-return-reachability-verify.sh`: for each `docs/agents/*/flow/**/*.md`, within each `## `-bounded segment, flag any numbered-step line occurring after an emitted `## RETURN`. Positive fixture = pre-`e6a4858ae` `pm/flow/main.md`; negative = current `pm/flow/main.md` + `dev-team/flow/main.md` + `qa/flow/main.md`. Note the glob must be a real recursive walk, not bash `case` — see `FIX-FILESIZECAPS-FLOWFILE-GLOB-NESTED-DIR-ONLY-173-FLOW-FILES-UNGOVERNED`.

**Dispatchability note for PO:** `is_dev_role` is `^dev(-|$)|^developer$` (`devteam-eligibility.jq:306-307`), so `agent-father` fails `is_non_dev_next_agent_unrouted` and rows 1 and 3 are **not** auto-dispatchable by RLC/BOUNDED-1 — they need a PO/router manual sweep, or `next_agent: po` as a routing shim (precedent `FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT`).

---

## 7. Reported, not fixed

1. **8 `ready[]`/`in_progress[]` wrapper rows carry `children[]` with no `hold_reason`** and are therefore armed for premature autoclose-to-`review[]`. `IVC-PM-DECOMPOSE` is the one confirmed disposition-C victim (§4.4).
2. **2 rows carry `pm_decomposition_complete: true` while sitting open in `ready[]`** with no `closed_at` — valid disposition B, mislabelled under the shipped binary (§4.8).
3. **21 rows exceed the prose ceiling** in guarded lanes; in-place pm dispositions on them are mechanically impossible until D3 ships (§4.7).
4. `FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58` — the router cited it as a parent with no `children[]`; **it now has 3** (`in_progress[]`, `BLOCKED`, `next_agent:po`). Not touched (peer-owned).
5. `docs/agents/pm/flow/main.md` Step 3b still mandates `branch: task/NNN-kebab`, contradicting the project NO-BRANCHES rule — third cycle unchanged, agent-father-owned, fold into row 3 if convenient.

---

## RETURN
DONE: Design complete — `docs/architecture-briefs/2026-08-23-pm-decompose-closeout-lane-resolution-and-fail-loud.md`. Defect reproduced end-to-end on synthetic fixtures; all replacement jq fixture-executed (6 resolution cases, 6 in-place cases, closeout through `orch-apply` clean, dependents-retarget idempotent, ceiling behaviour measured).
ZONE: `scripts/` (rows 2+4, developer) | `docs/agents/pm/flow/` (rows 1+3, agent-father)
NEXT: agent-father (row 1 immediately, row 3 after row 2) | developer (rows 2, 4) | PO (mint the 4 rows; note agent-father rows are not auto-dispatchable)
PIPELINE: continue
