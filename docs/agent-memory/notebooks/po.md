# PO Notebook

_Last: 2026-07-28T14:55Z (re-escalation triage) · 3 `orch-apply.sh` writes, all Zod+conservation clean · 832 ids, 0 dups · `.head` untouched · nothing pushed, no agent spawned, **no container touched, no PID killed, no service write issued**._

## Shipped

| What | State |
|---|---|
| **MINT** `FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT` | **P0** · `apps/pdf-extractor/` · →architect · `plan_only` + `supervised` · id read-back verified on `backlog` |
| **MINT** `FIX-AUDITOR-EMIT-SEVERITY-LABEL-FLAT-ESCALATION-BYPASS-NEVER-FIRES` | P1 · `cross-service/` · →developer · `supervised` · id read-back verified on `backlog` |
| `sys-20260728T143010-6ec2` + `sys-20260728T143457-0d5b` | `NEW`→`triaged`, one shared 4.8KB disposition |
| BUG Telegram 4268 | names the **user gate** explicitly; not a status ping |

**My 13:12Z MONITOR ruling fired as written.** 95%-of-cap crossed on 5 self-captured samples (98.27/99.19/99.19/98.36/96.44%); OOMKilled and RestartCount predicates did NOT cross. One of three was declared sufficient, so it was honoured, not re-argued.

## Lessons

- **⚠️⚠️ A threshold crossing is not yet a defect — I went looking for the mechanism I had said was missing.** The 13:12Z ruling declined to mint *because* a plateau with no mechanism is the auditor-FP class. So arithmetic alone would have been a self-contradiction. Found it: **10 concurrent `tesseract`** against `ProcessPoolExecutor(max_workers=1)` + `Semaphore(1)`, a guard that is commented, documented AND unit-tested. Same 10 PIDs 7 min apart, all `PPID=1`, distinct `/tmp/tess_*`. Had I found nothing I would have re-affirmed MONITOR.
- **⚠️⚠️ I corrected the router's premise and then installed my own.** My first draft of the P1 row repeated "the key was minted for the BENIGN 85% state". The row it describes says, verbatim, **98.87%** — the alert *was* sent; dedup worked. Rewrote in place (not delete-and-remint: keeps the id and the trail). **Reading the source refutes a claim; reading the row refutes the claim about the row.** I had done the first and skipped the second.
- **⚠️⚠️ The refutation was worth more than the report.** Correct dedup-key hygiene, shipped alone, would **create** the suppression bug that was falsely reported — 3 improvised keys are the only reason the 98.87% alert escaped its own ledger. Filed as a mandatory sequencing interlock. **When a bug report is wrong, ask what would have to change for it to become right.**
- **⚠️ Blame landed on the actuator; the producer was flat.** The bypass (`new_rank > stored_rank`) is correct and tested — it was never handed a rank-3 input. Control case, same auditor, same sweep, 5 min later: `sbv_fx` went HIGH→CRITICAL. One condition varied its label with the measurement; the other did not. Standing memory needs a third branch beyond detect/ignore: **it detected, it reported, it SENT — at a rank that could not travel.**
- **⚠️ My re-escalation threshold had no machine-readable home.** "95% of cap" lived only in a prose field on a row since cold-evicted. Every participant re-derived severity from scratch at 14:30Z and every one landed on WARN — each defensible, none able to see the pre-commitment. **A MONITOR disposition is a promise only I can keep.**
- **⚠️ `docker exec ps` is the cheapest question nobody asks.** `docker stats` gave 8 hours of percentages and no cause; one read-only `ps` gave the mechanism, the caller, and the arithmetic in a single line.

## Carry-over

- 🔴 **User gate open — mitigation is NOT mine.** Reaping the 10 orphaned PIDs frees ~890MiB and is strictly less destructive than a restart; **both are kills**. VN market CLOSED, so the 2026-06-01 anchor risk does not apply *right now* — cost is 10 in-flight page OCRs, each 27-42 min deep. Window narrows at next open.
- 🔴 **P1 must ship (a)severity-derivation before (c)key-normalisation.** Reversed order manufactures the reported bug. Written into the row as mandatory, restated in AC-1.
- **Cleared, do not re-blame:** anomaly-task-bridge 2h grace (rows 17/12 min old = correctly pending); router's WARN call and its refusal of a 3rd audit / 2nd push — defensible on evidence held, affirmed not reversed.
- **Still unsubstantiated:** "458 PDF jobs stuck". pdf-extractor being the service at 99% does **not** make it true. Needs a live jobs-table count; causation not assumed. Carried as non-blocking on the P0 row.
- **Not folded, deliberately:** `PERF-PEK-PER-PAGE-LATENCY` explains why each OCR runs 30-40 min — it does **not** explain why there are ten. Merging would let known-latency bury unknown-concurrency.
- `review`=118 / `qa`=0 still owned elsewhere. `po-decisions.md` now 660L, rotation cap still unchecked — third cycle carrying this.
