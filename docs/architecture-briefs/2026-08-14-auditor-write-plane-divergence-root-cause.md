Architecture Brief — system-auditor Write-Plane Divergence: Root Cause + Structural Fix

Date: 2026-08-14T18:59:03Z
Task: SPIKE-AUDITOR-WRITE-PLANE-DIVERGENCE-ROOT-CAUSE (P0, BACKLOG, size M, owner agents-architect,
mode=spike, timebox 180min) — this brief IS the spike's deliverable.
New fix row proposed: FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE
Mode: ROOT-CAUSE INVESTIGATION + DESIGN — zero production code changed here.
Author: agents-architect

---

## 0. Answer, up front

The 10 occurrences are NOT script bugs. Both actuators (`scripts/emit-audit-signal.sh`,
`scripts/audit-output-contract.sh`) are real, fail-loud, and demonstrably work when invoked — see
§2 evidence. The gap is that **the one gate architecturally positioned to catch a fabricated claim
before it lands (`scripts/auditor-notebook-commit.sh` §2a "AC-4 pre-commit contract backstop") is
structurally unreachable dead code for every system-auditor cycle since 2026-08-06**, because it
scans the notebook's staged git diff for a literal `^\+\[OUTPUT-CONTRACT\]` line that the current
flow doc (`docs/agents/system-auditor/flow/main.md`) never puts in the notebook at all — only in
the RETURN block, computed by a *different* script call that the flow doc's own 2026-08-06 reorder
now runs *after* the notebook is already committed. This is BOTH of the SPIKE's AC-2 branches at
once, and they compound (§4). The fix (§5) is additive, narration-immune, and reuses fields/files
the flow already mandates — no new agent behavior to remember, no new file.

---

## 1. Dedup check (SPIKE AC-5 prerequisite)

The SPIKE row's own `dedup_checked` field already enumerates the 9 adjacent open rows and states
none of them asks this question. Independently re-confirmed via `jq` over
`docs/data/orch/orch-state.json .task_board` (backlog+ready+in_progress+review+qa): no row besides
this SPIKE matches `AUDITOR-WRITE-PLANE|OUTPUT-CONTRACT|ANALYSIS-ONLY-EXIT` in a root-cause sense.
Full disposition of all 9 against this brief's fix is in §7 (SPIKE AC-5).

---

## 2. AC-1 — Empirical branch classification (never-invoked vs invoked-and-errored vs invoked-and-aborted)

PO's pre-read already ruled out "invoked-and-silently-swallowed" (both scripts fail loud with ABORT
markers + bug telegrams on every failure branch, and none of the 10 occurrences show either). This
cycle independently confirmed **"never invoked" for 4 of the 10**, via two fresh forensic sources
PO's pre-read did not use:

**Source A — `docs/data/auditor-output-contract-violations.json` (the durable, synchronous record
`audit-output-contract.sh` writes to *every time it actually runs and finds a mismatch* — confirmed
real: 29 entries spanning 2026-08-08 through 2026-08-14T04:18:13Z, catching genuine V1/V3/V4/V5
violations on cycles the agent DID invoke the script for).** The file's last entry across its
entire history is `2026-08-14T04:18:13Z`. THREE of the 10 catalogued occurrences fall strictly
after that timestamp with zero corresponding entry: the 06:15Z Tier-1 c93 zero-artifact case, the
06:41Z Tier-2 partial-fabrication case, and the 16:00Z Tier-2 c99 case (claimed
`signals_posted=11`, actual live count 0 at report time). Each of these, if `audit-output-contract.sh`
had genuinely run against the real (empty) `$MARKERS_FILE`, would have tripped V1
("narrated=N independent=0") by construction — the file's own 29 real prior entries prove V1 fires
reliably on exactly this shape. Zero entries for three fabricated-and-since-RAW-verified-false
occurrences is conclusive: **the script was never called**, not called-and-wrong.

**Source B — orphaned `.auditor-cycle-markers-*.tmp` scratch files still on disk (git status `??`,
never committed — by design, per main.md's own scratch-file contract).** One surviving file,
`docs/agent-memory/.auditor-cycle-markers-2026-08-13T12:00Z.tmp`, matches — by its exact quoted
content (`rag-service-1: 91.94% ... CONTINUATION`, `pdf-extractor-1: 97.24% ... NEW finding`,
`CALLER-INSTRUCTION-PRECEDENCE ... SPEC_WINS`) — the memory-catalogued
"2026-08-13T14:35Z Tier-2 TOTAL ZERO-ARTIFACT case" occurrence. Its content is `[fire-election]` +
`[AUDIT-CONTEXT]` + `[CALLER-INSTRUCTION-PRECEDENCE]` bookkeeping lines ONLY — **zero
`[emit-signal]` lines** — directly confirming `emit-audit-signal.sh` itself was never invoked that
cycle, independent of and corroborating the memory's own git-log-based conclusion.

Both sources point the same direction for every occurrence they can reach. Nothing in either source
suggests a mixed population — no evidence anywhere of an ABORT marker, a bug-channel telegram naming
a failed emit, or a violations-file entry for any of the 10. **AC-1 answer: all sampled occurrences
(4 directly evidenced, consistent with the other 6 per PO's own ABORT-marker-absence argument) are
the "never invoked" branch.**

---

## 3. Live state corroboration — the notebook itself

`docs/agent-memory/notebooks/system-auditor.md` (current HEAD, 188L, 3 live sections c99/c98/c31626)
contains **zero** occurrences of the string `OUTPUT-CONTRACT` anywhere. `git log -p` on the same
path shows the literal `[OUTPUT-CONTRACT]`/`**[OUTPUT-CONTRACT]**` line WAS historically committed
into the notebook on older cycles (pre-dating the 2026-08-06/07 reorder in the diff chronology
inspected) — i.e. the practice of putting it there has since **stopped**, consistent with §4 below,
not merely "sometimes forgotten."

What DOES land in every real notebook commit instead is free-form prose inside the mandated
`### Audit Run Tier-N` block (`flow/main.md:1088-1095` template) — e.g. live c99:
`Dedup-skipped: 0 | Signals posted: 11 | Status: DEGRADED`. This is the exact number RAW-verify
later found false (0 real at report time, 18 real after resume) — and nothing anywhere checks this
line against reality at commit time.

---

## 4. AC-2 — Is the asymmetry (i) flow-doc ordering, (ii) a missing plane-level gate, or (iii) both?

**Both, and they compound — with a code-level mechanism-shape proof, not just "the gate is weak."**

**(i) Flow-doc ordering (root mechanism):** `flow/main.md:1044-1049` documents that, as of
`FIX-AUDITOR-DURABILITY-STEP0B-DETECTION` §3b.1 (2026-08-06), the entire Notebook Write + Commit
block now runs **before** `### OUTPUT-CONTRACT` (`flow/main.md:1222-1280`). `flow/main.md:1258-1261`
states this explicitly: *"Notebook Write ... now runs and COMMITS this cycle's notebook entry
BEFORE this OUTPUT-CONTRACT step ever executes. By the time a `[OUTPUT-CONTRACT] ...` line exists,
this cycle's notebook write already happened."* `flow/main.md:1235` independently confirms the
line's ONLY documented destination is the RETURN block ("Paste the script's `[OUTPUT-CONTRACT] ...`
line verbatim into the RETURN block"), never the notebook. This was a deliberate, correctly-reasoned
trade (durability of the notebook write over risk of losing it to a later crash) — but nobody
re-examined its effect on the pre-existing AC-4 backstop that depended on the OLD ordering.

**(ii) Missing plane-level gate wired to the deterministic actuator:** A correct plane-level gate
already exists — `scripts/audit-output-contract.sh` V1 (header comment,
`--cycle-start-ts`/`--cycle-tag`/`--orch-state-file`) independently re-reads
`.signal_queue.rows[]` and asserts it matches the marker-parsed `signal_queue_rows_written`. It is
provably correct (29 real violation entries, §2 Source A). But it is invoked **only by LLM choice**,
inside a section (`§OUTPUT-CONTRACT`) that a narrating-not-executing cycle simply skips reaching, or
skips calling and hand-types a plausible-looking line for instead. Nothing forces its invocation.

**Where they compound:** `scripts/auditor-notebook-commit.sh` (`flow/main.md:1160-1189`,
**"MANDATORY, no exceptions: call this script — NEVER a raw/narrated git add or git commit"**) is
the ONE actuator in this entire flow that is unconditionally, deterministically executed every
cycle regardless of narration — it is code, not a step an LLM can silently skip while still landing
a real commit (the flow doc's own history proves this: the notebook commit half of the 10
occurrences was genuinely real every time). Its AC-4 backstop
(`scripts/auditor-notebook-commit.sh:79-93,215-243`, sharing extraction logic with
`scripts/lib/output-contract-invariant.sh:79-81`, regex `^\+\[OUTPUT-CONTRACT\]`) was SPECIFICALLY
designed to be that one narration-immune choke point for exactly this defect class
(`FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE`, per its own header). But
per (i), the artifact it grep-anchors on can now *never* appear in what it's scanning — proven, not
inferred: live notebook has zero matches (§3), and the regex only fires on diff-ADDED lines matching
the bracketed literal, which the current flow doesn't write there. **A structurally-correct backstop
was silently defeated by an unrelated, later, well-intentioned reorder of a sibling concern (notebook
durability) that nobody re-verified against it.** This is the concrete mechanism, file:line proven,
behind PO's higher-level framing ("no plane-level cross-check against what actually landed").

---

## 5. AC-3/AC-4 — Structural fix

**Actuator:** `scripts/auditor-notebook-commit.sh` (extend, do not replace, the existing §2a AC-4
block — leave it as harmless dead code for any future caller that DOES paste a bracketed line;
add a new §2b that is reachable). Shared helper additions land in
`scripts/lib/output-contract-invariant.sh` if extraction logic is shared, same "one algorithm, one
file" precedent that file's own header already states.

**Owner/zone:** `scripts/` → developer / cross-service (per `.claude/skills/commit-boundary/SKILL.md`
zone table — this is explicitly OUTSIDE agent-father's `docs/agents/**` zone). The flow-doc call-site
change (2 new args on an existing call, `docs/agents/system-auditor/flow/main.md:1173-1177`) IS
agent-father's zone. Route via PO-split, same precedent as
`docs/architecture-briefs/2026-08-14-market-watcher-eod-offhours-notebook-collision.md` §
`_note_to_agent_father` — agent-father must NOT implement the `scripts/` half itself.

**New, additive, backward-compatible contract for `scripts/auditor-notebook-commit.sh`:**
```
scripts/auditor-notebook-commit.sh "<msg>" <path1> [path2 ...] \
  [--markers-file <path>]   # NEW, optional — this cycle's $MARKERS_FILE. Omitted ⇒ §2b is a
                             # complete no-op (byte-identical to today) — every non-auditor caller
                             # (agents-architect's own notebook commit, agent-father, etc.) is
                             # unaffected.
  [--cycle-tag <value>]     # NEW, optional, reserved for the Phase-2 defense-in-depth check below.
```

**New Step 2b (inserted at the same point as the existing dead §2a block — after foreign-path
verify, before the "nothing to commit" check):**
```bash
# ── 2b. Plane-level emit-vs-claim backstop (NEW — closes the AC-4 unreachability from §4) ──
# Reachable-by-construction inputs only: (1) the "Anomalies: N new" line the notebook template
# ALREADY mandates every cycle (flow/main.md:1092) — this IS the artifact being committed right
# now, no new field to invent; (2) $MARKERS_FILE, whose population is baked into the emit
# script's OWN call site (`| tee -a "$MARKERS_FILE"`, flow/main.md:636) — not a separate step an
# LLM can narrate-and-skip once it DOES call emit-audit-signal.sh.
if [ -n "${MARKERS_FILE_ARG:-}" ]; then
  for _p in "${PATHS[@]}"; do
    case "$_p" in
      docs/agent-memory/notebooks/system-auditor.md)
        _declared_n=$(git diff --cached -- "$_p" \
          | grep -E '^\+.*Anomalies: [0-9]+ new' | grep -oE '[0-9]+' | head -1)
        _declared_n="${_declared_n:-0}"
        _real_signals=0
        [ -f "$MARKERS_FILE_ARG" ] && _real_signals=$(grep -cE \
          '^\[emit-signal\] (OK|OK-escalation-bypass|SKIP-dedup|OK e3-only|OK no-telegram) ' \
          "$MARKERS_FILE_ARG" 2>/dev/null || true)
        if [ "${_declared_n:-0}" -gt 0 ] 2>/dev/null && [ "${_real_signals:-0}" -eq 0 ]; then
          git restore --staged -- "${PATHS[@]}"
          echo "[auditor-commit] ABORT contract-plane-mismatch declared_anomalies=${_declared_n} markers_signal_count=0 markers_file=${MARKERS_FILE_ARG}"
          exit 1
        fi
        ;;
    esac
  done
fi
```
Matching bug-telegram (mirrors the script's existing `ABORT foreign-path-after-restore` handling,
which the flow doc's `flow/main.md:1188` "Verdict handling" bullet list ALREADY generically covers:
*"`[auditor-commit] ABORT ...` → bug-telegram ... not a normal skip, investigate"* — this new marker
slots into that existing branch, zero new RETURN-handling vocabulary for the agent to learn).

**Flow-doc change (`docs/agents/system-auditor/flow/main.md:1173-1177`):** add
`--markers-file "$MARKERS_FILE" --cycle-tag "$FIRE_TASK_ID"` to the existing call. Both variables
are ALREADY in scope at that exact point (`$MARKERS_FILE` initialized at Step 0d,
`flow/main.md:284`; `$FIRE_TASK_ID` computed earlier in the same Step 0d) — zero new state, zero new
step for the agent to remember.

**AC-4 (SPIKE's own, on failure-mode choice):** on mismatch, **REFUSE the commit** (`git restore
--staged`, exit 1) — not rewrite-counters-to-truth (would let the fabrication stand unflagged,
just silently "fixed"), not commit-plus-discrepancy-signal (weaker than refusal, and this SPIKE row
explicitly warns refusal must not just trade this bug for
`FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES`). It does not trade for that row because: (a) the
in-memory notebook content the agent already composed is NOT discarded — `git restore --staged`
only unstages, the working-tree file and its content survive intact; (b) the SAME
SendMessage-resume-with-explicit-execute mitigation already proven 7/7 across all 6 prior sub-shapes
applies verbatim here — a resumed agent re-reads the same staged content, actually runs the emit
sequence this time, and re-attempts the commit, exactly the recovery path already working; (c) the
ABORT is loud (bug-telegram + a distinct, greppable `contract-plane-mismatch` marker) — unlike
`FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES`'s own defect (a *silent* non-fire nobody is told about),
this one actively pages.

**Phase-2, explicitly NOT bundled into the P0 fix (sequencing note):** a defense-in-depth live
`.signal_queue.rows[]` cross-check via the ALREADY-BUILT-CORRECT `--cycle-tag` idempotency
predicate PO's pre-read found (`select(.audit_cycle_tag == $tag and .dedup_key == $dk)`, mirroring
`audit-output-contract.sh`'s own V1 logic) would catch the rarer "emit script said OK but the row
did not actually survive to orch-state.json" case. Recommend NOT reusing the full
`audit-output-contract.sh` script as a hard blocking call here until
`FIX-AUDIT-OUTPUT-CONTRACT-V4-V5-DEDUPSKIP-DENOMINATOR-FALSE-VIOLATION` (open, same script family,
known false-positive on legitimate dedup-only cycles) is fixed — wiring a known-buggy check into a
HARD commit-blocking gate would create new false blocks. Phase-1 (§ above) is self-contained and
does not depend on that sibling row; ship it first.

---

## 6. Why this specifically closes the confirmed shape, not a nearby one

Every one of the 10 catalogued occurrences shares the SAME shape: a genuine, non-zero
"Anomalies: N new" claim (or its free-text sibling "Signals posted: N") landing in a real notebook
commit, with zero real emit-signal invocation behind it. §5's gate reads exactly those two already-
mandatory facts (declared-N from the diff being committed; real-signal-count from the mechanically-
populated markers file) and needs NOTHING else — no new template field, no new agent behavior beyond
what the flow already requires, no dependency on the agent correctly invoking `audit-output-contract.sh`
or correctly formatting a bracketed line. It is reachable on every cycle because `auditor-notebook-
commit.sh` itself is already the one unconditionally-executed actuator (§4) — this fix rides that
existing guarantee instead of adding a new one.

---

## 7. AC-5 — Disposition of the 9 adjacent open rows

None are subsumed; this fix is genuinely new (confirms the SPIKE's own dedup_checked note). Relationship to each:

| Row | Subsumed? | Relationship |
|---|---|---|
| `FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES` | No | **At risk of confusion, flagged explicitly.** This fix's ABORT path produces the SAME surface symptom (commit doesn't fire) BY DESIGN on a genuine mismatch. Recommend the two use visibly distinct bug-telegram tags (`contract-plane-mismatch` vs that row's own unexplained-silent case) so monitoring doesn't conflate a working gate with the still-open silent-failure row. |
| `FIX-AUDIT-OUTPUT-CONTRACT-V3-DASHBOARDROWS-NO-INDEPENDENT-CROSSCHECK` | No | Different artifact (DASHBOARD.md via `emit-dashboard-row.sh`), different script (`audit-output-contract.sh` itself, not the commit gate). Same script family, worth doing, out of this fix's file list. |
| `FIX-AUDIT-OUTPUT-CONTRACT-V4-V5-DEDUPSKIP-DENOMINATOR-FALSE-VIOLATION` | No | Orthogonal bug, but a hard **sequencing dependency** for this brief's Phase-2 (§5) — noted there. |
| `FIX-AUDITOR-NOTEBOOK-SECOND-COMMIT-RETRO-REWRITES-PUBLISHED-OUTPUT-CONTRACT` | No | Different bug class (double-commit race rewriting an already-published line), immutability-guard/mode=warn concern — orthogonal. |
| `FIX-AUDITOR-DASHBOARD-MUTEX-RETRY-NEXT-TICK-NO-ACTUATOR` | No | DASHBOARD.md-specific, separate actuator. |
| `FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST` / `-FLOW-DRAFT-HEAL` / `-STEP0B-DETECTION` | No | Draft-persistence workstream, unrelated to emit-plane divergence. |
| `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` | No | Targets the COMPOSE step (`notebook-compose.sh`, unwired); this fix targets the already-wired COMMIT step (`auditor-notebook-commit.sh`). Complementary siblings in the same pipeline — recommend landing in the same agent-father/developer session for efficiency, not the same row. |
| `FIX-EMITSIGNAL-DEDUPKEY-GRAMMAR-UNVALIDATED-CALLER-FREETEXT-DEFEATS-7D-WINDOW` | No | dedup_key freetext validation inside a script that DOES run — orthogonal. |
| `FIX-AUDITOR-TIER1-HEARTBEAT-HANDWRITE-RECURS-SAME-DAY-AS-ITS-OWN-FLOW-FIX` | No | Cited by the SPIKE only as precedent that prose-only restatements recur same-day — this brief's fix is a script actuator specifically because of that precedent, not a doc restatement. |

**Recommendation to PO:** do not close any of the 9 off this brief. Mint the new row (§8) as an
independent P0/P1 sibling.

---

## 8. Standard Detection + handoff

**BUILD-STANDARD: not-applicable** (bug-fix/gate design, in-zone, no new primitives).

**Zone split (2 pieces, PO to route):**
1. `scripts/auditor-notebook-commit.sh` (+ optional shared helper in
   `scripts/lib/output-contract-invariant.sh`) — **developer / cross-service**.
2. `docs/agents/system-auditor/flow/main.md:1173-1177` (add 2 args to the existing call) +
   `flow/main.md:1184-1189` "Verdict handling" bullet (no new bullet needed, existing generic ABORT
   bullet already covers it — confirm only) — **agent-father**.

**New row to mint (PO):** `FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE`, P0 (same severity
class as the SPIKE that spawned it — this closes a live, actively-recurring finding-loss risk),
size S, owner `developer`+`agent-father` (2-file split per above), depends_on: none hard-blocking
for Phase-1; `FIX-AUDIT-OUTPUT-CONTRACT-V4-V5-DEDUPSKIP-DENOMINATOR-FALSE-VIOLATION` soft-blocks
Phase-2 only (§5).

---

## 9. Risk flags

- **Blast radius:** one script (additive contract, opt-in via a new flag) + one 5-line call-site
  edit in one flow doc. No schema change, no new files, no new agent-facing vocabulary.
- **False-positive risk of the new gate itself:** a genuine ALL_GREEN cycle (`declared_n == 0`)
  never engages the check (`-gt 0` guard) — matches the Notebook Append Gate's own existing
  condition (a) semantics (`flow/main.md:1061`), same threshold, no new edge case invented.
- **Regression risk if `--markers-file` is passed but the cycle legitimately used `--e3-only` mode
  markers (D-BCTC-EVAL/D-IMPROVE sites) which use a different marker prefix (`OK e3-only`):**
  already covered — the grep pattern in §5 explicitly includes `OK e3-only` in its alternation,
  matching the SAME pattern the Notebook Append Gate already uses at `flow/main.md:1062`, not a new
  one.
- **Scan clean:** dedup-checked (§1, §7), forensically re-verified against live disk state this
  cycle (§2 Sources A/B, §3), not from any agent's own self-report.

---

## RETURN
DONE: Root cause confirmed (both AC-2 branches, compounding, file:line proven) + structural fix
designed — `docs/architecture-briefs/2026-08-14-auditor-write-plane-divergence-root-cause.md`
ZONE: scripts/ (developer) + docs/agents/system-auditor/flow/ (agent-father)
NEXT: agent-father (flow-doc 2-arg call-site edit, §5/§8) | PO (route scripts/ half to developer per
PO-split precedent; mint `FIX-AUDITOR-NOTEBOOK-COMMIT-PLANE-CROSSCHECK-GATE`, §8; do not close the 9
adjacent rows, §7)
PIPELINE: continue
