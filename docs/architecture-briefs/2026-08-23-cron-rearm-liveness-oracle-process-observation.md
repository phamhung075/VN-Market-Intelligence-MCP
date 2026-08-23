# Cron Re-Arm Liveness Oracle — Replace Self-Reported Bookkeeping With Process Observation

**Date:** 2026-08-23T09:35Z · **Author:** architect · **Type:** FIX, P0
**Row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE` (`task_board.ready[]`, zone `cross-service/`)
**Paired row:** `FIX-COWORK-DAILY-SLOT-SILENT-SKIP-...-GUARANTEED-ONLY` → brief `docs/architecture-briefs/2026-08-23-cowork-slot-durability-layer-inventory-and-miss-detection.md`. This row is the *trigger*; that one is the *amplifier*. Neither alone makes a CLI restart survivable.
**Spec SSOT this brief amends:** `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.3
**PLAN-ONLY.** No file outside `docs/architecture-briefs/` is touched by this brief.

---

## 1. PO's correction verified at source — confirmed, and it understates the case

PO's load-bearing claim was: *the three cron families do NOT share one threshold and they fail in OPPOSITE directions; the branch text is byte-identical in all three.* Re-read all three files verbatim:

| Skill | Step 1b.1 lines | `orphan_threshold_seconds` | Renewal hook | PRIMARY oracle named |
|---|---|---|---|---|
| `.claude/skills/cron-cowork-team/SKILL.md` | 82–103 | `7200` | yes — `cowork-tick-preflight.sh` ~line 246, fires on all 5 verdicts | session-presence |
| `.claude/skills/cron-detect-loop/SKILL.md` | 51–72 | `7200` | yes — dev-team/system-auditor per-tick blocks | session-presence |
| `.claude/skills/cron-standalone-team/SKILL.md` | 68–91 | `120` (tool minimum) | **none, by design** (its own §1.4 rationale) | session-presence |

Confirmed byte-identical in all three:

> `released:false` (fresh heartbeat — race) → treat conservatively as LIVE → **STOP, no-op.**

PO is right. The correction is stronger than stated, because the divergence is not the defect — it is a *symptom*. See §2.

## 2. Root cause — the guard has no oracle that observes the operating system

`2026-08-06-cron-rearm-cross-session-dedup.md` §1.3 justifies the design on two claims. Both are false.

**Claim 1 — "session-presence is the primary signal; the moment a session's CLI process actually dies, its presence row simply stops renewing."** A presence row is written only if something inside that session claims `session-presence:<SID>`. Absence therefore means *"nothing in that session ever claimed presence"*, which is not the same proposition as *"that session is dead"*.

Measured live 2026-08-23T09:18Z:
- `task_list_held(kind="session-presence")` → **2 rows** (`7be6b4cd`, `007e33e4`).
- `ps -eo pid,command | grep '[c]laude'` → **5 live CLI processes** (PIDs 2802, 42066, 42648, 71334, 78588).
- Session `88555d2e-…` holds `cron-registration:standalone-team`, is **absent from the roster**, and is **demonstrably alive** — its transcript `~/.claude/projects/<enc>/88555d2e-….jsonl` had an mtime **16 seconds old** at the moment of measurement.

**Claim 2 — "`task_force_release_orphan`'s threshold is a second, independent liveness check server-side."** It is not independent. It reads `heartbeat_at` on the *same marker row*, and that field is renewed only by the marker's own owner. When the owner dies the field freezes. `now - heartbeat_at < T` therefore evaluates *"the owner was alive T seconds ago"*, never *"the owner is alive"*. It is a lagging derivative of Claim 1's subject, not a second observer.

**Both oracles read bookkeeping the session wrote about itself. Neither observes the OS.** That single sentence is the root cause, and it explains the opposite-direction failures without needing two theories:

- **cowork / detect-loop (T=7200, renewal hook present):** the heartbeat is genuinely fresh while the owner lives, so oracle 2 dominates — and stays "fresh" for up to 2 h after death. → **false-LIVE**. Because the branch is terminal (`STOP, no-op`) and the operator does not re-run the skill, one wrong answer wedges the family until manual intervention. Measured cost 2026-08-23: **8 h 10 m** dispatcher outage; marker `ttl_seconds=691200` with no post-mortem renewal means the ceiling was **8 days**.
- **standalone (T=120, no renewal hook):** the heartbeat is *always* stale, so oracle 2 never blocks and the broken oracle 1 decides alone. → **false-DEAD → double-arm** (memory `feedback_cron_standalone_step1b1_presence_absence_false_dead_double_arm`, confirmed 2×).

**This failure is live right now.** The standalone marker: `heartbeat_at` = 1787445687, age **30 948 s** against `T=120`; holder `88555d2e` absent from the roster but proven alive. A `/cron-standalone-team` invocation at this instant would classify a live session DEAD and double-arm all 6 crons. That is not a hypothetical replay — it is the current state of the system, and it is the second fixture in §6.

**Therefore:** tuning the thresholds cannot fix this. No value of `T` makes a self-reported heartbeat into an observation of a process. The fix must add an oracle that observes the OS.

## 3. Correction to the dispatch brief's oracle ranking — transcript-mtime must NOT be primary

The dispatch brief ranked the oracles as: *(1) transcript mtime — no blind window, correct primary; (2) process table — strong corroborator; (3) heartbeat/presence — corroboration only.* **Ranking (1) above (2) is wrong, and the incident itself disproves it.**

At the incident instant `00:41:06Z`, the dead session `2eaf4045`'s transcript mtime was `00:40:50Z` — **16 seconds old**. Any recency threshold above 16 s returns LIVE. Transcript mtime has a blind window in the DEAD direction that is *structurally guaranteed to be at its worst at a session restart*, for exactly the same reason `heartbeat_age` is: the predecessor died seconds ago, so its last write is maximally recent. Promoting transcript-mtime to PRIMARY reproduces the same outage with a smaller constant.

The three signals are not interchangeable and none is sound in both directions. Rank them by **what each can soundly prove**:

| # | Oracle | Soundly proves | Cannot prove | Blind window |
|---|---|---|---|---|
| **O1** | recorded PID absent from `ps`, or present with a different `(start_epoch, comm)` | **DEAD** | LIVE | **none** |
| **O2** | transcript `.jsonl` mtime within window `W` | **LIVE** | DEAD (idle ≠ dead) | none *in the LIVE direction* |
| **O3** | `heartbeat_age` / presence-roster membership | neither | both | up to `T`; roster undercounts |

Only **O1** is sound at t+1 s after death: a process cannot be running and absent from the process table. It is the only oracle with no threshold at all. **O1 is first.**

## 4. Design

### 4.1 Two-sided proof gate, with an explicit UNKNOWN branch

The current spec has **two** branches (LIVE / DEAD) and therefore *must* guess on ambiguity — and it guesses `conservatively as LIVE`, which is the branch that produced the 8 h outage. Adding a third branch is what removes the forced guess:

```
DEAD     iff O1 proves dead                        → release + register
LIVE     iff O2 proves live, or O1 matches (pid+start_epoch+comm all agree)
UNKNOWN  otherwise (no fingerprint recorded / transcript unreadable / transport error)
```

Same three branches, byte-identical text, in all three SKILL.md files.

### 4.2 UNKNOWN resolves by a *measured property*, not by an arbitrary per-family number

Asking "is a second armed copy harmful?" gives different answers per family — but the answer is a checkable property, not a tuning constant:

| Family | Cross-session per-tick mutex | Double-arm cost | `on_unknown` |
|---|---|---|---|
| cowork-team | **yes** — `cowork-tick-preflight.sh` Step 3 claims `cron:cowork:<tick>` (ttl 600) + Step 2.5 `pressure-state.json` tombstone | second dispatcher takes `LOST_ELECTION`, zero fan-out | `steal` |
| detect-loop | **yes** — `dev-team-tick-preflight.sh` `_step_fire_election()` claims `cron:dev-team:<tick>` | same | `steal` |
| standalone-team | **no** — verified: no `task_claim` / `cron:` mutex in `cron-agent-father.md`, `cron-claude-manager-helper.md`, `cron-db-data-integrity.md`; `cron-code-janitor.md` has only a local SKIP/SPAWN preflight, not a cross-session mutex | two concurrent real runs | `defer` **+ alarm** |

Encode this as one field, `has_fire_election_mutex`, in **one shared table inside the probe script** — not as three numbers in three docs. The divergence then lives in data, in one place, justified by a property anyone can re-verify. Standalone's `defer` is explicitly a *temporary* state: the durable fix is to give it the missing per-tick mutex, after which it also becomes `steal`. Track as a follow-on row, **not** a blocker for this one.

### 4.3 No branch of this guard may terminate silently

This is load-bearing and independent of which branch wins. The 8 h 10 m cost was not caused by the wrong answer alone — it was caused by the wrong answer being **unobservable**. Today every failure path ends in `STOP, no-op` plus a log line nobody reads. Even a perfect oracle is occasionally wrong; the system must notice.

- `UNKNOWN` and `DEFER` → `send_telegram(channel="bug", …)` **and** a `docs/signals/` row.
- Dedup on `(family, marker_owner_session)` with a cooldown, reusing the existing `docs/signals/` dedup-key convention — do **not** invent a new suppression mechanism (avoids alarm spam on a multi-terminal host).

Same class as memory `feedback_cron_armed_but_wrong_prompt_variant` and `project_host_suspension_causes_multiday_cron_silence_backlog_flush`.

### 4.4 `orphan_threshold_seconds` is demoted to what it actually is: a write-side CAS guard

Once the probe decides, `task_force_release_orphan` is called **only on a `DEAD` verdict**, and it is no longer being asked *"is the owner alive"* — it is being asked *"has anything changed since I read the marker"*. So it takes the tool minimum, **`120` in all three families**. Uniform, justified, no more arbitrary per-family numbers. This is the concrete answer to *"one spec, two opposite failure modes."*

**Replaces the byte-identical bad branch text, verbatim, in all three files:**

> A `DEAD` verdict followed by `released:false` is a transient write conflict, **never** a re-interpretation as LIVE. Retry once after the remaining window (bounded, ≤120 s). Still `released:false` → `UNKNOWN` → §4.3 alarm. Under no circumstance does this path fall through to `STOP, no-op`.

### 4.5 Marker payload must carry what the probe needs (it currently does not)

Only cowork's marker has `registering_process`; `cron-registration:detect-loop` and `cron-registration:standalone-team` have **no process fingerprint at all** — so O1 has zero wiring for 2 of 3 families. The dispatch brief's "half the wiring is built" is optimistic; it is one third.

And cowork's existing encoding is broken. Live value:

```
"registering_process": "ppid-42648-start-Dim_23_aoû_02:40:51_2026_-host-admins-MBP.lan"
```

Three defects in one string: **(a)** locale-formatted month/day (`Dim`, `aoû`) from `ps -p $PPID -o lstart=` under `LC_TIME=fr_FR.UTF-8` — if `LC_TIME` ever differs between the arming and probing invocations, the fingerprint compares unequal for the *same* process, spuriously firing Step 1a's SIBLING-PROCESS DEFER; **(b)** not machine-parseable to an epoch without locale-aware parsing; **(c)** `2026_-host` — trailing pad from `tr -s ' ' '_'`.

Replace with a structured object:

```json
"registering_process": {
  "fp_version": 2,
  "pid": 42648,
  "start_epoch": 1787445651,
  "comm": "claude",
  "host": "admins-MBP.lan",
  "session_id": "<SID>",
  "transcript": "/Users/admin/.claude/projects/<encoded-cwd>/<SID>.jsonl"
}
```

Add it to **all three** `Step 1c` claim payloads. Backward compat: `registering_process` absent, or a string, or `fp_version != 2` → pre-v2 → O1 **unavailable** → `UNKNOWN` (never a guess), and route through Step 1a's **existing** backfill branch (`task_release` + `task_claim`), never a fresh claim — a fresh claim would steal a live peer's marker.

Note: `$PPID` inside these skills' Bash blocks is the `claude` CLI process — verified live (bash pid 4286 → ppid 42648 → `comm=claude`). The existing field name says `ppid-`, which invites the next reader to mis-bind it; the v2 key is `pid`.

### 4.6 Verified locale-free primitives (all measured on this host, 2026-08-23)

```bash
# process start epoch — LC_ALL=C on BOTH commands is mandatory
raw=$(LC_ALL=C ps -p "$PID" -o lstart=)          # "Sun Aug 23 02:40:51 2026"
start_epoch=$(LC_ALL=C date -j -f "%a %b %d %T %Y" "$raw" +%s)   # 1787445651
```

Verified: pid 42648 → `1787445651` → `2026-08-23T00:40:51Z`, matching the incident timeline exactly. Without `LC_ALL=C`, `ps` prints `Dim 23 aoû …` and `date -j -f` fails to parse it.

**Implementation traps, all measured:**

1. **macOS `ps` has no `etimes`.** Verified: `ps: etimes: keyword not found`. Only `etime` (`DD-HH:MM:SS`) and `lstart` exist. Do not port a Linux `etimes` idiom.
2. **Never test `ps` by exit code through a pipe.** `LC_ALL=C ps -p 99999 -o lstart= | sed …` reported `rc=0` because `$?` came from `sed`. And `ps -p 999999` prints `process id too large` to stderr rather than a clean not-found. **Test for empty stdout**, captured before any pipe.
3. **`stat -f '%m'` (epoch), never `stat -f '%Sm'`.** Verified: `%Sm` on this host prints `23 aoû 11:03` for a file whose UTC mtime is `09:03Z` — a locale trap and a UTC-offset trap in the same field. Host is **CEST (UTC+2), `LC_TIME=fr_FR.UTF-8`**; memory `user_location` records GMT+7 and is wrong for this host.
4. **`ps lstart` carries the same locale trap as `stat -f '%Sm'`.** The dispatch brief named the `stat` trap only. Both must be wrapped.
5. **PID reuse.** Never check pid alone — require the full `(pid, start_epoch, comm)` triple to agree.
6. **Transcript path: record it, do not re-derive it.** The encoding (`/`→`-`, `_`→`-`, `.`→`-`) is fragile. The arming session knows its own cwd and SID, so it records the absolute path at claim time. Pre-v2 markers fall back to a glob `~/.claude/projects/*/<SID>.jsonl` (4 project dirs on this host — cheap, and immune to the encoding rules changing). The probe must **never** re-implement the encoding.

### 4.7 The probe script

`scripts/agents-flow/cron-marker-liveness-probe.sh` — one script, three families, invoked identically from all three Step 1b.1 blocks:

```bash
bash scripts/agents-flow/cron-marker-liveness-probe.sh --family cowork-team|detect-loop|standalone-team
```

- One line of JSON on stdout: `{verdict, family, marker_owner_session, evidence:{o1,o2,o3}, recommended_action}`, `verdict ∈ DEAD|LIVE|UNKNOWN|NO_MARKER|SELF|ERROR`.
- Exit code follows the fleet's existing tick-preflight idiom (`0` = terminal, no LLM read needed; non-zero = LLM continues) — composes with `cowork-tick-preflight.sh` rather than inventing a convention.
- **Reuses `scripts/agents-flow/mcp-call.sh`** for `task_list_held`. Do not reinvent the transport — that helper's own header says *"Built ONCE per architect risk note R1 — do not reinvent this transport per script."*
- Emits every oracle's raw evidence even when it did not decide, so a wrong verdict is diagnosable from the log alone.

## 5. Files, owners, sequencing

| # | File | Change | Owner |
|---|---|---|---|
| 1 | `scripts/agents-flow/cron-marker-liveness-probe.sh` | **NEW** — §4.1/§4.2/§4.6/§4.7 | `developer` (root `scripts/` → zone-detect Tier-2 line 34) |
| 2 | `scripts/agents-flow/cron-marker-liveness-probe.test.sh` | **NEW** — §6 fixtures | `developer` |
| 3 | `.claude/skills/cron-cowork-team/SKILL.md` | Step 1a fingerprint v2; Step 1b.1 → probe; Step 1c payload | `agent-father` |
| 4 | `.claude/skills/cron-detect-loop/SKILL.md` | Step 1b.1 → probe; Step 1c payload gains `registering_process` | `agent-father` |
| 5 | `.claude/skills/cron-standalone-team/SKILL.md` | Step 1b.1 → probe; Step 1c payload gains `registering_process`; §1.4 rationale rewritten (T=120 is no longer a liveness decision) | `agent-father` |
| 6 | `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.3 | Amend the two false claims (§2) | `architect` |

**Sequencing is load-bearing:** 1+2 land **before** 3/4/5. If the SKILL.md files cite a probe that does not exist, this becomes the exact doc-lies-about-runtime class already tracked as `FIX-CRONCREATE-CONTRACT-DIVERGENCE-…` — which, conveniently, edits these same three files and is already `depends_on`-gated behind this row, so the ordering serialises correctly.

**Do not fix one family and leave two divergent.** All three SKILL.md edits ship in one `agent-father` pass. That divergence *is* the bug.

## 6. Verification gate

Row gate: *"probe script exists and replays the 20260823 corpse case as DEAD, plus all three SKILL.md Step 1b.1 cite it."* Two fixtures, both from measured live state — the pair is mandatory, because one direction alone re-proves nothing:

**F1 — the 2026-08-23 corpse (false-LIVE direction).** Marker `cron-registration:cowork-team`, owner `2eaf4045`, `heartbeat_age=328 s` (well inside `T=7200`), owner absent from the presence roster, recorded pid absent from `ps`, transcript mtime **16 s** old. → assert `verdict=DEAD`. Note the transcript is *fresh* in this fixture: F1 fails against any design that ranks O2 above O1, which is precisely why §3 reorders them.

**F2 — the live standalone false-DEAD (false-DEAD direction).** Marker `cron-registration:standalone-team`, owner `88555d2e`, `heartbeat_age=30 948 s` (≫ `T=120`), owner absent from the presence roster, recorded pid **present** with matching `start_epoch` and `comm=claude`. → assert `verdict=LIVE`.

F1 + F2 passing under **one** spec is the whole thesis of this row: one guard shape, both directions, no per-family threshold.

**F3** — pre-v2 marker (`registering_process` absent or a string) → `verdict=UNKNOWN`, alarm fired, **no** silent `STOP`.
**F4** — locale: the suite runs under `LC_TIME=fr_FR.UTF-8` and asserts `start_epoch` parses identically to a `LC_ALL=C` run.
**F5** — all three `SKILL.md` Step 1b.1 blocks invoke the probe, and `grep -c 'orphan_threshold_seconds: 7200'` across `.claude/skills/cron-*/SKILL.md` returns **0**.

Tests mock `ps`/`stat`/`mcp_call` — zero real invocations, mirroring the `auditor-tier1-probe.test.sh` pattern.

## 7. Risk flags

- **R1 — unreadable peer transcript** (different macOS user, sandboxed path). Must degrade to `UNKNOWN`, never to LIVE or DEAD. Not observed on this single-user host, but must be coded.
- **R2 — PID reuse.** Mitigated only by the full `(pid, start_epoch, comm)` triple. A pid-only check is a correctness bug, not an optimisation.
- **R3 — `LC_ALL=C` must wrap both `ps` and `date -j -f`.** One missed wrapper reintroduces the exact locale defect this brief exists to remove.
- **R4 — fingerprint version skew.** Step 1a's SIBLING-PROCESS fast path compares fingerprints by string equality. Changing the shape breaks that comparison for markers written by an older session. The compare must be `fp_version`-aware, and v1→v2 must route through the existing backfill branch.
- **R5 — alarm spam** on a host running several terminals. Bounded by the `(family, marker_owner_session)` dedup key in §4.3.
- **R6 — standalone stays `defer`-on-UNKNOWN until it gets a per-tick mutex.** This is a known, accepted, *narrowed* residual: today it is wrong in both directions; after this fix it is wrong in at most one, and loudly. Do not let the follow-on block this row.

**BUILD-STANDARD:** not-applicable (BUG-FIX, in-zone, no new primitives).
**Zone:** `cross-service/` — `scripts/agents-flow/` (developer) + `.claude/skills/cron-*/` (agent-father). Multi-owner; PM splits by owner, sequenced 1+2 → 3+4+5.

## RETURN

```
DONE: Technical design complete — root cause corrected (no OS-observing oracle), dispatch brief's oracle ranking corrected (O1 process-absence before O2 transcript-mtime), one spec for all three families
ZONE: cross-service/ (multi-owner: developer + agent-father)
NEXT: pm | split by owner — (1) developer: probe script + tests; (2) agent-father: three SKILL.md edits, MUST land after (1)
BRIEF: docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md
PIPELINE: continue
```
