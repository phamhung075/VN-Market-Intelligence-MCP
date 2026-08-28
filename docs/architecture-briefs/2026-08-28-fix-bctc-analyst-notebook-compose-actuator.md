# Brief: bctc-analyst notebook-compose ACTUATOR — wire scripts/notebook-compose.sh + scoped Bash grant

**Date:** 2026-08-28T23:40:00Z
**Author:** architect (dev-team design-track dispatch, session-123eed97)
**Tracking row:** `FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR` (P1, size M, zone multi)
**Chain:** po → architect → developer → qa (this brief = architect deliverable; developer implements; QA verifies AFTER, as a separate agent)

---

## 1. Root cause (live-verified this cycle, not narrated)

**The doc-only remedy for S51 was falsified — the notebook is STILL settling at 2 sections instead of 3.**

- `docs/agent-memory/notebooks/bctc-analyst.md` currently holds **2 sections** (`## c187`, `## c186`), verified this cycle via `grep -c '^## c'` = 2 — the exact off-by-one the S51 remedy text ("NOT 2") was supposed to prevent.
- S51 (`FIX-NOTEBOOK-RETENTION-MANUAL-COMPOSE-DRIFT`, 2026-08-15) diagnosed the real root cause: **`bctc-analyst` has no Bash grant, so the AC-2 WHILE-loop retention is LLM-composed from prose every cycle with no deterministic actuator** — the model applies `>= 3` instead of `> 3` and settles at 2 (confirmed failure mode in the skill's own worked note, `.claude/skills/notebook-write/SKILL.md`).
- S51's remedy was **doc-only** ("exactly 3 sections after this write, current+2 prior, NOT 2" added to `stage-log-notify.md`) — the actual fix (wire `scripts/notebook-compose.sh` + grant a scoped Bash tool) was deferred and **never minted as a tracked task**. The doc remedy was falsified 11 days later (c187 → 2 sections).
- Same fleet-wide class: `news-scout`/`agents-architect`/`digest-predict` show the same noisy section counts; this row is the bctc-analyst member of the class, and `scripts/notebook-compose.sh` already exists as the blessed generic actuator (system-auditor pilot, wired 2026-08-14).

**Actuator readiness (smoke-verified this cycle):** `scripts/notebook-compose.sh` needs **zero code change**. Ran it against a copy of the LIVE 2-section bctc-analyst notebook + a new `## c188` section:

```
$ bash scripts/notebook-compose.sh <notebook-copy> <new-section> 3 60
[notebook-compose] OK sections=3 dropped=0 lines=28 bytes=8329 direction=newest_first
```

- Direction self-derives correctly (`newest_first` — c187 at top, c186 below).
- Retention converges to exactly 3 (`sections=3`).
- Section-cap 60 (AC-2a) is ample for the ≤10L bctc-analyst template — **do NOT copy system-auditor's 150** (that was a PO ruling for RAW-PROBE sections; bctc-analyst does not need it).

## 2. Design

### Change 1 — Wire the actuator into `docs/agents/bctc-analyst/flow/stage-log-notify.md` (§5a)

Mirror the system-auditor wiring verbatim-in-shape (`docs/agents/system-auditor/flow/main.md` §Notebook write, wired `78a43bf3c` 2026-08-14), adapted to bctc-analyst's simpler cycle:

1. **c<NNN> derived in bash, never LLM-chosen** (FIX-AGENT-NOTEBOOK-UUID-PROVENANCE: never session-UUID-derived; deterministic increment from the file's own headings):
   ```bash
   LAST_N=$(grep -oE '^## c[0-9]+' "$NB_PATH" | grep -oE '[0-9]+' | sort -n | tail -1)
   NEXT_N=$(( ${LAST_N:-0} + 1 ))
   UTC_STAMP="$(date -u +"%Y-%m-%dT%H:%MZ")"
   ```
2. **Model authors ONLY the new section body** into a scratch file whose heading line is machine-built (`## c${NEXT_N} · ${UTC_STAMP}`) — the sole free-form surface, matching the ≤10L template already in §5a.
3. **ONE actuator call:**
   ```bash
   bash scripts/notebook-compose.sh docs/agent-memory/notebooks/bctc-analyst.md <new-section-file> 3 60
   ```
4. **Branch on the `[notebook-compose]` marker** (grep first `^\[notebook-compose\]` line):
   - `OK ...` / `WARN ...` → proceed to Commit (§5d), embedding the marker in the commit message (below).
   - `ABORT ...` (`single-section-overage` / `internal-invariant-violated`) → notebook untouched by construction; BUG telegram `[bctc-analyst] notebook-compose ABORT — <marker>`; log `[NOTEBOOK-GATE-ABORT]` for next cycle; **skip the commit**; continue the rest of the flow. NEVER fall back to a narrated Write.
   - `ERROR ...` (`bad-usage` / `notebook-not-found` / ...) → flow-wiring bug; BUG telegram; continue the rest of the flow.
5. **Remove the No-Bash fallback timestamp note** (§"Notebook timestamp guard" line 16): with Bash granted, `date -u` is primary and authoritative; the MCP-`fetchedAt` fallback is deleted (it was a workaround for the missing grant, now false).
6. **§5d Commit — embed the marker as runtime-execution proof** (same as system-auditor's `[${COMPOSE_MARKER#\[notebook-compose\] }]` suffix):
   ```
   git commit -m "chore(memory/bctc-analyst): notebook YYYY-MM-DD [${COMPOSE_MARKER#\[notebook-compose\] }]" \
     -- docs/agent-memory/notebooks/bctc-analyst.md
   ```
   This makes every post-fix commit `git log --grep='notebook-compose'`-searchable — the verification gate is the commit itself, not a doc-grep.

### Change 2 — Scoped Bash grant shape (`.claude/agents/bctc-analyst` → `.claude/agents/bctc-analyst.md` + tools package)

The grant is the enabler S51 deferred. Shape it narrowly:

- **`tools:` line** → `Read, Write, Edit, Bash, mcp__gateway__call_tool`
- **Description rewrite (MANDATORY, same commit)** — the current description says *"No other filesystem writes permitted except docs/analysis-briefs/{TICKER}.md on mode=release and data/bctc-analysis-cache/"*; that claim is falsified the moment Bash is granted (the exact CRITICAL-01 class from `docs/agent-memory/health/team-tool-recheck-2026-08-11-1253.md` and the PO ruling in `FIX-COWORK-AGENT-DESC-STALE-VS-DELIBERATE-BASH-GRANT`: **the Bash grant is accepted, the DESCRIPTION TEXT is the defect — declare the real write set**). New write-set declaration: notebook compose + commit via the actuator (below), analysis-briefs on mode=release, bctc-analysis-cache, signal files.
- **Bash scope declaration** — add a Bash row to `docs/agents/tools/package/bctc-analyst.md` mirroring the system-auditor package row:
  - PERMITTED: `date -u` (timestamp), `grep`/`sort`/`tail`/`wc` against the notebook path (c<NNN> derivation + AC-5 verification), `bash scripts/notebook-compose.sh <notebook-path> <new-section-body-file> 3 60` (the ONE compose actuator), `git add`/`git commit` for the notebook path only (5d, mutex-guarded).
  - FORBIDDEN: docker, network, arbitrary file writes, `rm -rf`, and **any enumeration/inspection of `docs/signals/`** — the drain-misread class (`FIX-BCTC-ANALYST-READS-DRAIN-MOVE-AS-SIGNAL-WRITE-LOSS-4-CYCLES`, PO sign-off 2026-08-15) must NOT be reopened by this grant. The main.md "SIGNAL-FILE WRITE VERIFICATION" block's verification-premise rule (trust the Write tool's own return; never re-Read a prior-cycle signal path) STANDS unchanged.

### Change 3 — Verification gates

| Gate | Mechanic | Owner | Fails how |
|---|---|---|---|
| VG-1 flow runtime | §5a branches on `[notebook-compose]` marker; ABORT → BUG telegram + skip commit, no narrated-Write fallback | agent (every cycle) | bypass = class recurrence |
| VG-2 commit-time | marker embedded in commit message; `git log --grep='notebook-compose' -- docs/agent-memory/notebooks/bctc-analyst.md` returns every post-fix commit | git history | missing marker = actuator bypassed |
| VG-3 CI mechanical | `scripts/audits/agent-bash-grant-coverage.sh --check` — grant↔demand now consistent; **developer re-runs `--update` so the grandfathered bctc-analyst baseline entry drops** (it exists today because flow demanded Bash while frontmatter didn't; once granted, the entry is stale and must be dropped per the baseline's own `_note` contract) | CI (agent-bash-grant-coverage job) | stale baseline entry / check fail |
| VG-4 smoke/replay | replay compose against a COPY of the live 2-section notebook + new section → assert `OK sections=3` and `grep -c '^## '` == 3 | developer (pre-commit) | any non-3 result |
| VG-5 live QA | first post-wire bctc-analyst cycles each commit exactly 3 sections with the marker | qa (separate agent, after developer) | recurrence at 2 |

**BUILD-STANDARD: not-applicable** (BUG-FIX in-zone wiring of an existing actuator; no new service, no new primitives, no new interfaces — the script is reused as-is).

## 3. Files (developer implementation scope)

| Path | Action |
|---|---|
| `docs/agents/bctc-analyst/flow/stage-log-notify.md` | §5a rewire (Change 1) + remove no-Bash fallback + §5d marker embedding |
| `.claude/agents/bctc-analyst.md` | tools line += Bash; description declares the real write set (Change 2) — **same commit as the grant** (CI CHECK 2) |
| `docs/agents/tools/package/bctc-analyst.md` | new Bash scope row (permitted/forbidden, Change 2) |
| `docs/data/agent-bash-grant-coverage-baseline.json` | drop bctc-analyst entry via `bash scripts/audits/agent-bash-grant-coverage.sh --update` (VG-3) |
| `docs/agents/bctc-analyst/flow/main.md` | narrow amendment of the "SIGNAL-FILE WRITE VERIFICATION" block: Bash is now scoped-granted but the write-verification premise rule (never re-Read a prior-cycle signal path) is UNCHANGED; the "no Bash/Glob grant" sentence becomes false and must be reworded |
| `scripts/notebook-compose.sh` | **NO code change** (smoke-verified). Optional: update the header "Owning flow" line to list bctc-analyst as a second wired caller |
| `docs/agents/shared/debug-logger-protocol.md` (OPTIONAL) | line 23 lists bctc-analyst as "Bash-less" — reword to "scoped-Bash" (shared file; agent-father zone — route if not in developer's commit zone) |

## 4. Risk flags

1. **Sibling row conflict (must surface to PO):** `FIX-BCTC-ANALYST-STAGELOG-NOTIFY-NO-BASH` (BACKLOG, low) premises that the fix is a *flow-doc rewrite removing* the Bash blocks ("NOT a Bash grant"). This row rules the opposite: **grant scoped Bash**. The sibling row's proposed remedy is now wrong — implement THIS row, and PO should close/supersede the sibling (do NOT land both).
2. **Drain-misread regression** (`FIX-BCTC-ANALYST-READS-DRAIN-MOVE-AS-SIGNAL-WRITE-LOSS-4-CYCLES`): the scoped grant explicitly FORBIDS `docs/signals/` enumeration; main.md's verification-premise rule is preserved. The grant is for the notebook compose path only.
3. **Zone:** `.claude/agents/*.md` is nominally agent-father's lifecycle zone, but this row's `files[]` explicitly includes `.claude/agents/bctc-analyst` → in-scope for the developer here (same precedent as `476646c4e` / `610110e16` which modified agent files from tracked fix rows).
4. **Description↔tools CHECK 2:** landing the Bash grant without the description amendment fails CI (`agent-bash-grant-coverage.sh --check`). The two edits are one atomic change.
5. **No new MCP tools / no gateway changes** — commit-mutex at 5d already uses `mcp__gateway__call_tool` (already granted).

## 5. Handoff

- **next_agent: developer** (zone-detect Tier-2: files span docs/agents/ + .claude/agents/ + scripts/ + docs/data/ → generic `developer`).
- QA is a separate later agent — do NOT dispatch qa from this row's flip.
- Decision journal entry (DJ-GATE-1): `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-architect-7.md` STEP architect-S57.
- Architect notebook: `docs/agent-memory/notebooks/architect.md` appended.
