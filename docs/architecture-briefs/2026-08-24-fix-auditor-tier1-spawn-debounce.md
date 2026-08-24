<!-- size-justification: ~330L — single-row P0 architecture brief covering a shell-script algorithm
change + a cron-prompt decision-logic rewrite + a 2-child dispatch split, each requiring worked
examples against a live-observed detail string (the coordinator's 07:36:32Z datapoint) to be
falsifiable rather than asserted; splitting the algorithm spec from the cron-prompt spec would
duplicate the shared field-contract table between two files for zero reuse benefit on a single-fix
brief. -->

# FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK — Per-Signature Spawn Debounce

**Date:** 2026-08-24
**Author:** architect
**Status:** DESIGN COMPLETE — zone=multi, split into 2 implementation rows (§7)
**Row:** `FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK` (P0)
**Governing rulings (read in full before touching this brief):** `po_ruling_20260824T0716Z`,
`po_addendum_20260824T0722Z` on the row itself; `expiry_hazard_20260824T0716Z` on
`docs/data/auditor-launchd-ack.json`'s rag-service `acked_memory[]` entry.

---

## 0. Non-negotiable constraint (AC-3, elevated by the addendum, not boilerplate)

The Tier-1 `mem_creep` FAILURE this row debounces is a **TRUE POSITIVE** — two real
`CONSTRAINT_MEMCG` OOM kills of pdf-extractor python3 child workers, invisible to every
Docker-plane probe (`OOMKilled` is main-PID-only). **This design debounces the SPAWN. It never
touches the VERDICT.** Every path below returns `verdict:"FAILURE"` on every failing tick,
unconditionally, exactly as today. `docs/data/auditor-tier1-last-healthy.json` is never written on
a FAILURE tick — unchanged, still the sole authority of `_write_heartbeat()`'s ALL_GREEN branch.

---

## 1. Live signal received during design (coordinator, 07:36:32Z) — folded into the spec

A second real tick fired while this brief was being written:
```
verdict=FAILURE, detail="mem_creep: mem >= 85% threshold (A-30 WARN boundary, mem-creep gate):
  vn-market-intelligence-mcp-pdf-extractor-1(86.56%) (also acknowledged-degraded, tracked:
  vn-market-intelligence-mcp-rag-service-1(90.80%) ); ", last_healthy_at age=379.3min
```
vs the immediately preceding tick, byte-identical except `86.90%→86.56%` and `91.40%→90.80%`. Two
things this proves, both load-bearing for §3:

1. **A naive full-string hash of `detail` (or of the whole `failures` blob) debounces nothing** — the
   percentages drift every tick, so the hash never repeats. The signature must exclude every
   numeric/status value and key ONLY on the stable identity: which check failed, for which
   UNACKNOWLEDGED entity.
2. **The acked-transparency clause is noise for signature purposes, not signal** — `rag-service` above
   is present in the detail string today only inside the `(also acknowledged-degraded, tracked: ...)`
   parenthetical (still suppressed by its own ack entry). It must NOT be folded into the signature.
   Concretely this makes §"expiry hazard" (below) work for free: the instant that ack goes STALE
   (`FU-RAG-DEPLOY-MEMORY` reaches `DONE_VERIFIED`, per `expiry_hazard_20260824T0716Z`), `rag-service`
   moves out of the acked clause and into the check's own primary breach list — which by construction
   changes the signature (`mem_creep:pdf-extractor` → `mem_creep:pdf-extractor,rag-service`) and forces
   an immediate spawn under AC-4, with zero special-casing. This is the concrete answer to the task's
   "hold for the second signature arriving" requirement — proven by construction in §3.3, not asserted.

The coordinator's own hand-discriminator ("spawn if a NEW dimension appears, suppress if
dimension+container set unchanged") is directionally exactly right and is what §3 formalizes. The one
correction: their rule as stated would still fold `rag-service` into "container set" today (it does
appear in the raw string), so it needs the same acked-exclusion this design applies — otherwise the
ack-expiry case above stops being a "new container" event and silently keeps debouncing. Adopt the
exclusion below, not the unqualified "container set" reading.

---

## 2. Both cron-prompt arms are one signal, and both must be defeated together

`.claude/skills/cron-detect-loop/register.md` Job 2's prompt today is a plain OR:
> `verdict=ALL_GREEN AND heartbeat age<=60min → SKIP. Otherwise (verdict=FAILURE, OR verdict=ALL_GREEN
> but heartbeat age>60min, OR unreadable) → SPAWN.`

On every FAILURE tick, arm 1 (`verdict=FAILURE`) alone already satisfies the OR — arm 2 is never even
reached. Per AC-3 the verdict can never become ALL_GREEN, so arm 2's stale-heartbeat clause is
permanently primed too (a FAILURE tick never refreshes the heartbeat, by design) but it is moot: it
only matters on the ALL_GREEN branch, which this design never touches. **The fix is not "add a third
OR clause" (an LLM narration risk — a later exception after an already-true `verdict=FAILURE → spawn`
clause can be skipped on a shallow read).** The fix restructures the FAILURE branch into a mandatory
read of a new authoritative field, ahead of any spawn decision, mirroring the Tier-2/3 pattern that
already moved this exact class of decision in-script (`run_tiered_probe()`'s `SKIP-SPAWN`/`SPAWN`
field) instead of leaving it to LLM arithmetic. See §5 for the literal replacement prompt text.

---

## 3. Design — `scripts/agents-flow/auditor-tier1-probe.sh`

### 3.1 New state file: `docs/data/auditor-tier1-spawn-debounce.json`

Own file, per the dispatch note ("must live in its own file, not in the heartbeat"). Also
**deliberately NOT folded into `docs/data/auditor-tier1-last-trigger.json`** — that file is a
verdict-transcription cross-check input for `audit-output-contract.sh` Arm B and stays byte-shape-
unchanged; adding fields there risks a downstream parse assumption this row has no way to audit.

```json
{
  "entries": [
    {
      "signature": "mem_creep:vn-market-intelligence-mcp-pdf-extractor-1",
      "first_seen_at": "2026-08-24T02:00:00Z",
      "last_seen_at": "2026-08-24T07:36:32Z",
      "last_spawn_at": "2026-08-24T02:00:00Z",
      "spawn_count": 1,
      "window_expires_at": "2026-08-24T03:00:00Z"
    }
  ]
}
```
Atomic tmp+mv write — same idiom as `_write_heartbeat`/`_write_trigger_file`. Missing/unreadable/
corrupt file is treated as `{"entries":[]}` (fail open to SPAWN, never fail closed to DEBOUNCED — see
§3.4). Test seam: `SPAWN_DEBOUNCE_FILE_PATH` env override, same naming convention as
`HEARTBEAT_FILE_PATH`/`TRIGGER_FILE_PATH`/`LAUNCHD_ACK_PATH`/`ORCH_STATE_PATH`.

### 3.2 Window: `SPAWN_DEBOUNCE_WINDOW_MIN` (default 60)

Reuses — does not reinvent — the "2x own cadence" convention this exact script already uses for
`_fresh_threshold_minutes_for_tier()` (tier1→60=2×30min, tier2→480=2×4h, tier3→2880=2×24h). Tier-1's
own cadence is 30min, so 2× = 60min. Deliberately conservative (not 2h/4h, both of which were
considered and rejected — see decision journal): AC-3 is paramount, this debounces a condition PO has
confirmed is a live true positive, and a 60min ceiling still cuts a persisting single signature from
48 spawns/day to at most 24 — a real reduction with a short re-adjudication horizon, retunable via the
env var without a design change if live burn data says otherwise post-ship. Even at the worst-case
tick, Tier-2's own independent gate re-audits the SAME 6 checks at least every 4h regardless of this
row (its `run_tiered_probe()` forces SPAWN unconditionally on any non-ALL_GREEN `checks_verdict`, no
freshness gate applies) — this row's window is a burn-reduction lever on top of that floor, not the
only backstop.

**Named residual gap, stated plainly, not hidden:** the Tier-1 SHELL probe cannot see anon-rss/child-
process OOM kills (that visibility gap is structural — Docker's own `OOMKilled` flag, and this exact
class of false-negative is already tracked at `FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED`
for a sibling container). A second real kill of the SAME container inside the debounce window would
not itself change the shell-visible signature and would be debounced — but the subagent spawned on
FIRST detection would have been equally blind to it (its own `verify-a30-mcp-memory-reclamation.sh`
reads the same OOMKilled/RestartCount fields). Debouncing the spawn does not worsen this pre-existing
kernel-visibility gap; it is orthogonal to it and out of this row's scope.

### 3.3 Signature contract (the observable behavior — implementation may vary)

`signature = sorted, "|"-joined list of "<checkname>:<sorted,comma-joined UNACKED entity names>"
tokens, one per FAILING check this tick.` Per-check rules:

| Check | Entity-bearing? | Rule |
|---|---|---|
| `docker_ps` | yes | entity = bare service name(s), stripped of their `(status)` suffix |
| `mem_creep` | yes | entity = bare container name(s) from the check's own **unacked** breach list — the `(also acknowledged-degraded, tracked: ...)` clause and everything after it is dropped from the signature entirely, not just its percentages |
| `launchd_agents` | yes | entity = bare label(s), same acked-clause exclusion as `mem_creep` |
| `health_3000` / `health_3001` / `disk` | no | signature token is the bare checkname alone — no per-tick body text (HTTP code, curl exit, df%) feeds the signature; none of these three carry multi-entity structure worth debouncing more finely than "this check is failing" |

**Worked example (the live 07:36:32Z datapoint, §1):** `detail = "mem_creep: mem >= 85% threshold
(A-30 WARN boundary, mem-creep gate): vn-market-intelligence-mcp-pdf-extractor-1(86.56%) (also
acknowledged-degraded, tracked: vn-market-intelligence-mcp-rag-service-1(90.80%) ); "` →
signature = `"mem_creep:vn-market-intelligence-mcp-pdf-extractor-1"`. Stable across every tick where
only the percentages move. **If rag-service's ack later goes STALE** (expiry hazard), the SAME raw
`_check_mem_creep()` output moves rag-service out of the acked clause into the primary breach list —
signature becomes `"mem_creep:vn-market-intelligence-mcp-pdf-extractor-1,vn-market-intelligence-mcp-
rag-service-1"`, which is BY CONSTRUCTION a new/changed signature (AC-4) → immediate spawn, no code
path added for this case specifically. This is the proof, not an assertion, that the design "holds for
the second signature arriving."

**Recommended implementation, not mandated verbatim:** do NOT regex-parse the pretty-printed prose
`$failures`/`$out` strings generically — a generic `\([^)]*\)` strip mishandles the nested
`"(...(...)...)"` shape of the acked clause (verified against the worked example above: naive global
paren-stripping leaves a dangling stray `)` and, worse, tokenizes boilerplate prose words like "mem"/
"threshold" as if they were entity names). Two safe alternatives, either acceptable:
(a) anchor-strip each check's own KNOWN, literal, already-quoted-above message prefix (fragile only if
that check's echo wording changes, and fails SAFE — a stale anchor just makes the signature look
"always new," degrading to "debounce does nothing," never to a false suppression); or
(b) (recommended) thread a clean, parenthesis-free, prose-free entity-name accumulator out of each of
the 3 entity-bearing check functions' own existing per-entity loops (`_check_docker_ps`,
`_check_mem_creep`, `_check_launchd_agents` already iterate entity names one at a time to build
`$bad`/`$breach` — appending a second, bare-name-only var costs one line per function, zero behavior
change to the existing `$bad`/`$breach`/return-code contract). (b) has no prose-coupling risk and is
the developer child row's recommended path; either is acceptable as long as the observable contract in
this table + the worked example (as a mandatory test fixture) hold.

### 3.4 `_spawn_debounce_decision(signature)` — called ONLY from `run_probe()`'s own top-level
(non-suppressed) FAILURE branch

Gated behind the **exact same** `[ "$suppress_heartbeat" != "suppress_heartbeat" ]` test already used
for `_write_trigger_file`/`_write_heartbeat` — not a new flag. This is a proven, zero-incremental-risk
isolation: `run_tiered_probe()` (Tier-2/3) always calls `run_probe "suppress_heartbeat"`, and so does
`orch-sentinel-lite-probe.sh`'s `run_orch_sentinel_lite_probe()` (confirmed by reading it — it already
calls `run_probe "suppress_heartbeat"` for the exact same non-interference reason). Both are therefore
provably unaffected by construction, no new isolation logic needed. `verify-a30-mcp-memory-
reclamation.sh` sources this file only for `_mem_headroom_mib`/`MEM_FLOOR_MIB`, never calls
`run_probe()` — also unaffected.

Decision table:
| Case | `spawn_decision` | Ledger write |
|---|---|---|
| No entry for this signature (new or changed) | `SPAWN` | insert/replace entry: `first_seen_at/last_seen_at/last_spawn_at = now`, `spawn_count = 1`, `window_expires_at = now + SPAWN_DEBOUNCE_WINDOW_MIN` |
| Entry exists, `now < window_expires_at` | `DEBOUNCED` | update `last_seen_at := now` only — `window_expires_at`/`spawn_count`/`last_spawn_at` untouched (AC-5: a sliding window would never expire) |
| Entry exists, `now >= window_expires_at` | `SPAWN` | `last_seen_at := now`, `last_spawn_at := now`, `spawn_count += 1`, `window_expires_at := now + SPAWN_DEBOUNCE_WINDOW_MIN` |
| Ledger file missing/unreadable/unwritable | `SPAWN` | fail OPEN, log the reason — never silently suppress on an I/O fault, same rule every sibling pre-gate script already follows (Auditability Contract, `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md` §5.3) |

### 3.5 `run_probe()` JSON shape — additive only, ALL_GREEN branch untouched

FAILURE branch gains exactly two new keys, `verdict`/`detail`/`last_healthy_at`/exit-code(1) all
byte-identical to today:
```json
{"verdict":"FAILURE","detail":"...","last_healthy_at":"...","spawn_decision":"SPAWN|DEBOUNCED","signature":"..."}
```
ALL_GREEN branch: **zero new keys** — deliberately not folded in, so every existing ALL_GREEN
assertion in `auditor-tier1-probe.test.sh` (40+ cases) needs no update. `spawn_decision`/`signature`
are absent/empty when `suppress_heartbeat=="suppress_heartbeat"` (Tier-2/3 inner call) — the field's
mere presence is not load-bearing for anything outside the Tier-1 top-level FAILURE path.

---

## 4. Design — `docs/agents/system-auditor/flow/tier1-probe.md`

Add a short top-of-file pointer (mirrors the existing "NEVER write ... last-healthy.json" restatement
style, L20-28): a spawned Tier-1 cycle, by construction, already passed the pre-gate with
`spawn_decision:"SPAWN"` — the debounce affects CADENCE only, this file's own checks/verdicts run at
their existing full fidelity every time this subagent DOES launch, unconditionally. No functional
change to any A-xx check, no functional change to `docs/agents/system-auditor/flow/main.md`'s Tier
Dispatch (confirmed by reading it — the pre-gate's JSON is consumed only by the cron prompt, never by
this file or `main.md`, both of which the subagent reads only AFTER it has already been launched).

---

## 5. Design — `.claude/skills/cron-detect-loop/register.md` Job 2 (the actual armed prompt)

Replace the "Otherwise (...): spawn" clause with a mandatory field read. New prompt logic (literal
text for the CronCreate `prompt:` string, register.md owns the exact formatting):

```
Run: bash scripts/agents-flow/auditor-tier1-probe.sh and read its one-line JSON verdict
(fields: verdict, detail, last_healthy_at, spawn_decision, signature).
If verdict=ALL_GREEN: passive-health-masking guard, UNCHANGED from today — compute heartbeat age from
  docs/data/auditor-tier1-last-healthy.json's .last_healthy_at; age<=60min -> done, no spawn;
  age>60min or unreadable -> spawn.
Else (verdict=FAILURE): read spawn_decision from THIS tick's own JSON directly, do not re-derive it.
  spawn_decision=="DEBOUNCED" -> done, log '[cron-detect-loop] T1 FAILURE DEBOUNCED (signature=<signature>)',
    do NOT spawn a subagent.
  spawn_decision=="SPAWN", or spawn_decision missing/unparseable (fail-open — an older probe-script
    version or a read fault must never silently suppress) -> Launch subagent (subagent_type=system-auditor).
    Read and execute docs/agents/system-auditor/flow/main.md
    AUDIT_TIER=1
    MCP: https://zenmidi.com/vn-market/mcp
```
This satisfies §2: arm 1 (old unconditional `verdict=FAILURE → spawn`) no longer exists as a bare OR
clause — it is replaced by a mandatory field read. Arm 2 (ALL_GREEN + stale heartbeat) is untouched
and structurally unreachable from the FAILURE branch (mutually exclusive on `verdict`), so it can never
re-arm a spawn the debounce just suppressed.

`.claude/commands/crons/cron-system-auditor.md` (the manual/ad-hoc reference doc) intentionally does
NOT carry any pre-gate logic today (confirmed by reading it — its own header says so explicitly,
"keeps this file simple for one-off manual setup") — no change needed there.

---

## 6. Non-goals restated (unchanged from the row, held here for the implementer)

Do not add an `acked_memory[]` entry for pdf-extractor (refused 3x by PO, dmesg-confirmed true
positive). Do not touch `MEM_FLOOR_MIB`/`WARN_PCT`. Do not touch pdf-extractor's own memory code. Do
not touch `run_tiered_probe()` (Tier-2/3) — proven unaffected by construction (§3.4), no edit needed.
Do not add a `scripts/git-hooks/pre-commit` shape-guard for the new debounce file in this pass —
mirrors the trigger file's own precedent (prose-only sole-writer contract, "no shape-guard needed...
yet") since a stray hand-write here only ever perturbs SPAWN CADENCE, never the health verdict itself
(unlike the heartbeat file, whose ALL_GREEN semantic IS the thing a bad write could falsify) — flagged
as a legitimate future hardening, not done here for scope discipline.

---

## 7. Split — developer / agent-father, per AC-6's owner precedent

Files span `scripts/agents-flow/` (developer, per `zone-detect` Tier-2: root/`scripts/` → developer)
and `docs/agents/system-auditor/` + `.claude/skills/cron-detect-loop/` (agent-father, the established
owner of agent-flow/cron-registration prose in this repo — see `FIX-A21-PREDBOUND-2-...` precedent).
**Divergence from the A21 precedent, stated explicitly:** A21's two children were fully independent
(`depends:[]` each) because they fixed the SAME bug pattern in two unrelated standalone artifacts with
no runtime coupling. Here the two halves form ONE integrated runtime contract — the script emits
`spawn_decision`/`signature`, the cron prompt reads them — so the agent-father child depends on the
developer child landing first. §3.5/§5's fail-open default makes the ordering safe either way (a
missing field just means "spawn," never "silently suppress"), but sequencing removes the coupling risk
entirely rather than merely bounding it.

This row (`FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK`) becomes the
umbrella: `depends=[FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT,
FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT]`, `next_agent=qa` once both children reach
review (joint AC: the field-contract table in §3.3/§3.5 matches literally between the shipped script
output and the shipped prompt text — the one thing neither child can verify in isolation). Not marked
`supervised:true` — unlike A21, this row was explicitly router-hand-dispatched to architect at P0 by
PO's own ruling with no supervision request, and the live burn (§0, §1) argues against adding a new
PO-gate the ruling did not ask for; if PO wants a supervision gate before dispatch, that is a fast
one-field flip on the umbrella row, not a redesign.

---

## RETURN

```
DONE: Designed a per-signature spawn debounce for Tier-1 (verdict stays FAILURE unconditionally, AC-3
honored as the paramount clause) — new docs/data/auditor-tier1-spawn-debounce.json ledger, normalized
signature contract excluding percentages/status codes/acked-entity noise (worked + proven against the
live 07:36:32Z coordinator datapoint and the rag-service ack-expiry hazard), 60min window (2x Tier-1's
own cadence, reusing the existing _fresh_threshold_minutes_for_tier convention, not inventing a new
one), and a cron-prompt rewrite that replaces (not appends to) the old FAILURE->spawn OR-arm so the
stale-heartbeat arm can never re-fire behind it. Split into 2 dependent implementation rows per AC-6.
ZONE: multi (scripts/agents-flow/ -> developer; docs/agents/system-auditor/ + .claude/skills/cron-detect-loop/ -> agent-father)
NEXT: developer (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT), then agent-father
(FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-2-FLOWDOC-CRON-PROMPT, depends on the first), then qa on the umbrella
row for the joint field-contract cross-check.
HANDOFF: docs/architecture-briefs/2026-08-24-fix-auditor-tier1-spawn-debounce.md
PIPELINE: continue
```
