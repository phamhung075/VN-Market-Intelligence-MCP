# PO — Notebook

## 2026-08-11T12:54Z · Every one of the three "low-risk" fixes had a load-bearing coupling the brief never touched

### What actually happened
- Triaged `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` (R1/R2/R3) into **4** backlog rows + sprint `CHORE-COMMIT-OVERHEAD`, ONE `orch-apply.sh` write, task_total 751→755. `next_agent=pm` on all 4. **No dispatch** — WIP=2 at cap (`UC-RDL-P4`, `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`).
- Journal: `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md`.

### Decisions worth keeping
- **★ A "FLOW-DOC-ONLY PROSE CHANGE" WAS COUPLED TO THE DEDUP KEY.** Brief R3 = cap the §0a-D inline at 50KB. Read the adjacent line: `drain-signals.md:68` computes `envelope_id = sha256(from + type + JSON.stringify(loaded_payload) + ts)` — the payload IS the dedup identity. Store a pointer and hash it, and every gated signal re-drains forever. The recommendation was right; the diff it implies is not one line.
- **★ THE BRIEF ARGUED FROM ONE TARGET'S PROPERTY TO A GENERIC CAP.** Its case for relaxing "always inline" is that `db-integrity-history.json` is never moved. True — and not a property of a *size* cap, which pointerises any >50KB target including the `processed/{filename}` ones `FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE` exists for. Gate on size AND target class.
- **★ SPLIT 3 RECOMMENDATIONS INTO 4 ROWS ON ONE GREP.** `db-integrity-history-append.sh:98` hardcodes `--payload-ref` at the whole 745KB accumulator, not the finding that fired. The size gate bounds the symptom; that line is the cause. Its hardcode is *deliberate* (closed a 3x `to=po`+`payload_ref=null` defect) — so the fix is granularity, never reverting to agent-supplied. `payload_ref` already parses `#fragment` (`drain-signals.js:467`), so the cheap path exists.
- **★ THE PRECEDENT DIDN'T TRANSFER — SAME FILE, 12 LINES DOWN.** Brief R1 cites `emit-dashboard-row.sh:46-58` ("commit-failure does NOT flip success") to batch the commit. Lines 60-67 of that same header say this script, *unlike* `auditor-notebook-commit.sh`, must hold `commit-mutex:main` across **both** the mutation and the commit, and names the hazard: uncommitted `DASHBOARD.md` gets swept by a peer's bare commit. L-7's market-watcher precedent batches an agent's OWN notebook in its OWN zone; `DASHBOARD.md` is shared across concurrent tiers. Sized S→M with the design choice made explicit.
- **★ UNTRACKING CONVERTS A RARE RACE INTO A GUARANTEED ONE.** 536 tracked `processed/*.json` confirmed; only 1 live `detail_ref` into them *today*. But Stage 1c hard-blocks every fleet orch-apply write on a dangling ref — untracked = absent on any clean checkout. Already fired twice from the tracked side (`395e224ad`). AC is now "passes from a checkout that never had the files", not a green run on this machine.
- Cited numbers re-derived at source, all hold: 745,061B history; 536 tracked; 2×599,273B envelopes live in `pending_triage_inbox` (98% of it); orch-state 5.18MB.

### NEXT
- pm decomposes all 4. R3-consumer + R3-producer legs are P1 (next `db_integrity_breach` reproduces the spike exactly); R2/R1 P2.
- **Blocker I did not clear:** 4 rows (`TASK-COWORK-SIGNAL-*`) sit in `review[]`, `supervised=true`, **zero** `po_goahead` — pm decomposition complete, awaiting PO supervised-goahead. Needs its own tick; ratifying 4 supervised rows on source-verification is not a side task.

### Carry-over
- **★ WHEN A BRIEF SAYS "LOW RISK, PROSE-ONLY", READ THE 20 LINES AROUND THE LINE IT CITES.** All 3 recommendations were correct in direction and under-scoped in coupling — and every coupling was in the same file, within 20 lines of the evidence the brief already quoted.
- Standing (held): re-read each row on disk after `orch-apply.sh`; assert the AC-3 SHA is the one I just created, never a peer's sweeping commit.
- **★ VERIFY THAT A VERIFIER CAN FAIL** (held from 08-09): empty output from a check is not evidence of absence until the check is proven able to produce output. Cf. the AC-3 SHA self-check below.
- Both prior sections (08-09 02:48Z cron-status false-CRITICAL, 01:35Z `git diff <blob> <blob>` usage error) dropped WHOLE per AC-2 — po is the OVERWRITE class (preamble + 1 section, ≤50L). Both remain in git; neither was shrunk in place (AC-2a).
