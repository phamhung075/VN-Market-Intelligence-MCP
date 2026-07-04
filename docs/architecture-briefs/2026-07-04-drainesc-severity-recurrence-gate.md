# Drain-ESC Dispatch — Severity Floor + Recurrence DEDUP Gate

**Date:** 2026-07-04 | **Author:** architect | **Status:** DESIGN — for pm decomposition → dev → qa
**Task id:** `FIX-DRAINESC-SEVERITY-RECURRENCE-GATE` | **Zone:** `cross-service` (`scripts/` + `docs/agents/*.md` — no `apps/` code path)
**BUILD-STANDARD:** not-applicable (bug-fix/hardening gate on an existing agentic dispatcher, no new service/primitive)

## 1. Problem (brownfield-verified)

`docs/agents/dev-team/flow/drain-esc-dispatch.md` Step 3 spawns `model=claude-opus-4` bctc-analyst
for **every** `esc-deep-dive-request` signal that clears the Step 2 spawn-mutex — no severity check,
no recurrence check. Two independent gaps, both confirmed live:

1. **No severity floor.** `esc-4-nonop-heuristic.md` AC-2 (shipped, `ESC4-HEURISTIC-FIX-TAXBASIS-SOE`)
   already downgrades `context.severity` `HIGH → INFO` for SOE-conglomerate tickers when only the
   `non_operating_share` arm fires — and `main.md:112` correctly writes that downgraded value onto
   the emitted signal's top-level `severity` field. But `drain-esc-dispatch.md` never reads
   `row.severity` at all (Step 1, lines 31-38, extracts `trigger_id/ticker/quarter/report_id/
   guard_key/context/all_esc_fired` — **not** `severity`) — the downgrade is computed and stored but
   never consulted before spawning. An INFO-severity ESC-4 fire still burns an Opus run.
2. **No recurrence/known-root guard.** Live evidence in `docs/signals/signals.db` (`signals_processed`,
   queried directly, JSON1 confirmed available — sqlite3 3.43.2):
   - `MBB|Q1-2026|ESC-2` — 2 rows in the table (of "4th consecutive redispatch" per the emitter's own
     `recurrence_note`), byte-identical `context` (`assets_total=666711, liabilities_total=567490,
     equity_total=0, imbalance=0.1488`) on both. Root cause already diagnosed by PO
     (`REFLOW-MBB-Q1-2026`, backlog/BLOCKED, status_note: "OPTION (a) MINT REFLOW, NO Opus deep-dive
     ... same failure class as CTG") — a real board task already tracks this, but the dispatcher has
     no way to consult it, so it re-spawns every cycle the file-based guard (`guard_key`, 24h TTL)
     expires.
   - `GVR|Q1-2026|ESC-4` — 4 rows, same underlying finding (590.1 tỷ non-operating income, 23.5% of
     net profit, unchanged since 2026-06-07) but **`context`'s JSON keys drift every cycle**
     (`item_pct_NP` → `item_pct_of_net_profit` → `item_amount_bn_vnd` → …) because this `context` is
     freeform LLM-narrated prose+numbers, not a fixed-schema extraction like MBB's balance-sheet
     figures. **This is the load-bearing finding of this brief:** a literal
     `sha256(ticker+quarter+trigger_id+context)` fingerprint (the task's suggested design) would
     **never match** across GVR's 4 cycles despite being the same finding, because `context`'s shape
     itself is non-deterministic for narrative ESC types (ESC-1/ESC-4). An exact-content-hash gate
     alone is provably insufficient — confirmed against real production data, not assumed.

Neither gap is deploy-gated — both live entirely in flow-doc pseudocode + `scripts/agents-flow/
drain-signals.js`, per the task's own framing.

## 2. Design Decisions

### 2.1 GATE-A — severity floor

`effective_severity = row.severity` (top-level signal field, **not** `row.payload.severity` — it
does not exist there) when present and recognized; **fallback only** (row.severity missing/legacy/
unrecognized) = the max static per-ESC-id tier across `all_esc_fired`. The fallback never
*overrides* an explicit `row.severity` — it is purely a defensive net for malformed/legacy rows,
so the ESC-4 AC-2 `INFO` downgrade is always honored as authoritative. (A "max of both" design was
considered and rejected: it would silently re-escalate the very INFO-downgraded ESC-4 case this task
exists to fix — `ESC_DEFAULT_SEVERITY["ESC-4"]="HIGH"` would win a MAX-of-both comparison and defeat
AC-2. Confirmed by tracing the concrete GVR SOE example.)

Severity vocabulary: reuse the existing canonical SSOT —
`SignalSeverityEnum = z.enum(["CRITICAL","HIGH","MED","LOW","INFO"])`
(`apps/mcp-server/src/infrastructure/orchStateSchema.ts:172` — this is also the enum the
`.signal_queue.rows[].severity` field is documented against, `orchStateSchema.ts:179-181`, which
notes live legacy values e.g. "MEDIUM"/"WARN"/"P1" also occur — normalize case, and treat any
unrecognized token as `HIGH` fail-safe, never as suppressible, per the hard mandate).

```
SEVERITY_RANK          = { CRITICAL: 4, HIGH: 3, MED: 2, LOW: 1, INFO: 0 }
ESC_DEFAULT_SEVERITY    = {                      # fallback table — generic per ESC-*check-type*, NOT per ticker
  "ESC-1": "CRITICAL",   # suspected accounting manipulation
  "ESC-2": "HIGH",       # balance-sheet integrity fails
  "ESC-3": "HIGH",       # OCF/NP divergence
  "ESC-4": "HIGH",       # related-party/one-off (AC-2 downgrade already lives in row.severity, not here)
  "ESC-5": "MED",        # refine-confidence gate
}

norm = uppercase(row.severity ?? "")
effective_severity =
  norm in SEVERITY_RANK ? norm
  : (max-by-rank of ESC_DEFAULT_SEVERITY[id] for id in all_esc_fired, default "HIGH" if empty/unmapped)

IF SEVERITY_RANK[effective_severity] < SEVERITY_RANK["HIGH"]:
  → GATE-A FAIL: do not spawn Opus → Terminal Exit (§2.3) → EXIT handler
```

### 2.2 GATE-B — known-root DEDUP (state-location decision)

**Recommendation: two-tier check, BOTH tiers reuse existing state — zero new schema, zero new file,
no change required to `drain-signals.js`'s write path.** This is cheaper than *either* option framed
in the task ticket (board-row-exists alone, or a new content-fingerprint counter column):

**Tier 1 (primary, authoritative) — board-row-exists**, read-only `jq` against
`docs/data/orch/orch-state.json .task_board` (all lanes flattened, filtered on the row's OWN
`.status` field against `TERMINAL_SET` — `apps/mcp-server/src/infrastructure/orchStateSchema.ts:58-64`
— rather than which lane array it sits in, since lane↔status is not strictly 1:1). A row counts as
"already tracked" if ANY non-terminal task matches:
- `id == "REFLOW-<ticker>-<quarter>"` (exact — the convention PO is **already using in production**:
  `REFLOW-MBB-Q1-2026`, `backlog`, `status=BLOCKED` — BLOCKED is not in TERMINAL_SET, correctly "open"), or
- `id` starts with `"REFLOW-<ticker>-"` (tolerate quarter-format drift), or
- `guard_key` substring appears in `title`/`status_note`/`root_cause`, or
- `guard_key` appears in the row's `related[]` array.

This is **self-healing**: once PO/QA flips the REFLOW task to a `TERMINAL_SET` status (remediation
verified), Tier 1 stops blocking automatically — no stale-forever risk, no manual gate reset needed.

**Tier 2 (bootstrap safety net, only consulted when Tier 1 finds nothing)** — reuse the *existing*
`signals_processed` table (already populated by `drain-signals.js` §0a-1 for every file-sourced
`esc-deep-dive-request`; JSON1 confirmed live on the deployed sqlite3 build). Count prior rows with
identical `(type, ticker, quarter, trigger_id, context)` — exact `context` match, matching the task's
literal fingerprint intent, deliberately **not loosened** here: per §1's GVR finding, an exact-context
match will legitimately fail to catch narrative-ESC recurrences (ESC-1/ESC-4), but that is the safe
failure direction — Tier 2 under-triggers rather than over-suppressing a possibly-distinct finding,
consistent with "NEVER suppress a genuine FRESH finding." Tier 1 (which needs no context match at
all) is what actually stops the concrete MBB 4x-waste case once PO/router has minted the tracking
row — Tier 2 only closes the narrower gap *before* that row exists (cycle 1→2, before any human/
automation reacts).

```
board_hit = <Tier-1 jq query, see §3 exact filter>
IF board_hit:
  → known-root, tracked. GATE-B FAIL (no new signal needed — already tracked).
ELSE:
  recurrence_count = <Tier-2 query, via drain-signals.js --recurrence-count>
  IF recurrence_count >= 2:
    → GATE-B FAIL. Emit `reflow-needed-hint` signal (dev-team → po) so PO can mint
      REFLOW-<ticker>-<quarter> next cycle (closes the loop generically — no ticker hardcode).
  ELSE:
    → GATE-B PASS (first occurrence, or below threshold) → proceed to Step 3, Opus spawns.
```

**Why not add a fingerprint column to `drain-signals.js`'s write path (the ticket's other listed
option):** `json_extract` on the existing `payload` TEXT column already answers the Tier-2 query with
zero migration, zero new INSERT logic, and zero risk to the file's two previously-shipped production
bugs (`FIX-DRAIN-SIGNALS-DEDUP-PRUNE-STRCOMPARE`, the FAIL-LOUD fence) — both hardening episodes on
this exact write path. Touching that path again for a read-only concern is unjustified risk for zero
functional gain. The ONE necessary addition to `drain-signals.js` is a **read-only CLI subcommand**
(§3.2) that runs the Tier-2 COUNT query safely (bound-value escaping, matching the existing
`sqlEsc()` convention in the same file — `feedback_signal_payload_shell_injection`: bound-param only,
never raw shell interpolation of agent-authored `ticker`/`quarter`/`trigger_id`/`context` fields).

### 2.3 Terminal Exit (shared cleanup — both gates converge here on FAIL)

Both GATE-A and GATE-B failure paths must, in order: release `spawn_key` (claimed in Step 2 — **not
explicitly called out in the task's own one-line fix_spec, but required for contract coherence**: it
guards the Opus *spawn decision*, and if gates decide not to spawn it must be freed immediately, not
left to its 7200s TTL, so a later legitimate retry — e.g. after the board row closes — is not
needlessly blocked); release `guard_key` (task explicitly mandates this for GATE-A, and the existing
Step 5 already releases it unconditionally on the Opus-spawn path — keeping it consistent means
bctc-analyst may re-emit the same cheap signal file next cycle, which is fine: the waste being cut is
the expensive Opus spawn, not the cheap file-emit-then-gate cycle); mark row terminal using the
**existing** Step 6 branch (`row.source=="dashboard"` → RESOLVED; `row.source=="file"` → no-op,
already archived).

## 3. Target file changes (for pm/dev — precise change points)

### 3.1 `docs/agents/dev-team/flow/drain-esc-dispatch.md`

- **Step 1 (lines 31-38):** add one line — `severity = row.severity` (top-level field, sibling of
  `row.payload`, per `main.md:107-113`'s `signal_row` shape — currently unread).
- **Insert new §GATE-A and §GATE-B blocks between the current line 55 (`EXIT handler`, end of Step 2)
  and line 57 (`# 3. Spawn bctc-analyst...`)** — i.e. exactly where the task specifies ("BETWEEN Step 2
  and Step 3"). Content: §2.1's pseudocode (GATE-A), §2.2's pseudocode (GATE-B, Tier 1 jq filter below
  + Tier 2 CLI call), §2.3's Terminal Exit as a named sub-step both gates reference (avoid duplicating
  the release+mark-terminal logic twice).
- **Tier-1 jq filter** (exact, parameterized — no raw interpolation of ticker/quarter/guard_key into
  the jq program text; use `--arg`):
  ```bash
  jq --arg rid "REFLOW-${ticker}-${quarter}" --arg tk "$ticker" --arg gk "$guard_key" '
    [ .task_board | to_entries[] | select(.value|type=="array") | .value[]?
      | select((.status // "BACKLOG") as $st
               | (["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"] | index($st) | not))
      | select((.id == $rid)
               or ((.id // "") | startswith("REFLOW-" + $tk + "-"))
               or ((.related // []) | any(. == $rid))
               or (((.title // "") + " " + (.status_note // "") + " " + (.root_cause // "")) | contains($gk)))
    ] | length > 0
  ' docs/data/orch/orch-state.json
  ```
  Terminal-status list here MUST stay byte-identical to `TERMINAL_SET`
  (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:58-64`) — if that SSOT changes, this filter
  drifts; dev should consider this a cross-reference to flag, not duplicate silently.
- **Tier-2 CLI call:**
  ```bash
  jq -n --arg t "esc-deep-dive-request" --arg tk "$ticker" --arg q "$quarter" --arg tr "$trigger_id" \
    --argjson ctx "$context" '{type:$t,ticker:$tk,quarter:$q,trigger_id:$tr,context:$ctx}' \
    | node scripts/agents-flow/drain-signals.js --recurrence-count
  # stdout: "count=<n>" — parse n; n=0 on any degradation (db missing/locked, bad JSON) — never blocks
  ```
- **`reflow-needed-hint` signal** (emitted only on the Tier-2 bootstrap path, i.e. board_hit=false AND
  recurrence_count>=2): reuse the same Cross-Team Signal Directory Write-tool pattern dev-team already
  has Bash/Write access for (unlike bctc-analyst). No new routing-table row needed in
  `drain-signals.md` §0a-3 — the existing `"any other" → PO Step 0-SIG, unknown types logged"` fallback
  already covers it; adding a dedicated row is optional polish, not required for correctness (keeps
  the file-touch count minimal, per the task's 2-file scope).
- Header comment (top-of-file size-justification, lines 1-8): append one line documenting this change,
  matching the file's own established convention (see BGFAN-1/FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH
  precedents already in that same comment block).

### 3.2 `scripts/agents-flow/drain-signals.js`

**No change to the existing drain path (lines 1-125, unchanged, zero regression risk).** Add ONE
self-contained CLI subcommand, inserted immediately after line 18 (`const PROCESSED_BY = ...`, i.e.
before the existing line 20 `if (!fs.existsSync(DB))` full-drain gate) — deliberately given its OWN
tiny escape helper rather than reordering/reusing the existing `sqlEsc()` (defined later, line 32):
this file has two prior production-bug postmortems on exactly this kind of edit
(`FIX-DRAIN-SIGNALS-DEDUP-PRUNE-STRCOMPARE`, the FAIL-LOUD fence) — minimizing the structural diff to
the already-hardened drain path is the safer trade, a few duplicated lines is an acceptable cost.

```js
// GATE-B recurrence-count subcommand (FIX-DRAINESC-SEVERITY-RECURRENCE-GATE, 2026-07-04).
// Read-only bootstrap safety-net query for drain-esc-dispatch.md GATE-B Tier 2 (used ONLY when
// GATE-B Tier 1 — board-row-exists — finds nothing). Reuses the SAME signals_processed table this
// script already populates in §0a-1 — no schema change, no write. Self-contained escape helper
// (independent of sqlEsc() below) to avoid touching the existing hardened drain-mode code path.
// Usage: printf '%s' '{"type":"esc-deep-dive-request","ticker":"MBB","quarter":"Q1-2026",
//   "trigger_id":"ESC-2","context":{...}}' | node scripts/agents-flow/drain-signals.js --recurrence-count
// Prints "count=<n>" (n=0 on any degradation) and exits 0. SELECT-only. SAFE-JSON: args read from
// stdin JSON, never shell-interpolated raw (feedback_signal_payload_shell_injection: bound-param only).
if (process.argv[2] === '--recurrence-count') {
  const escB = (s) => String(s ?? '').replace(/'/g, "''");
  try {
    const args = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));   // matches orch-state-hook-prewrite.mjs convention
    if (!fs.existsSync(DB)) { console.log('count=0'); process.exit(0); }
    const contextText = JSON.stringify(args.context ?? null);
    const sql = `SELECT COUNT(*) FROM signals_processed WHERE type='${escB(args.type)}' ` +
      `AND json_extract(payload,'$.ticker')='${escB(args.ticker)}' ` +
      `AND json_extract(payload,'$.quarter')='${escB(args.quarter)}' ` +
      `AND json_extract(payload,'$.trigger_id')='${escB(args.trigger_id)}' ` +
      `AND json_extract(payload,'$.context')='${escB(contextText)}';`;
    const n = parseInt(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim(), 10);
    console.log(`count=${Number.isFinite(n) ? n : 0}`);
  } catch (e) {
    console.log('count=0');   // graceful degrade — never blocks the GATE-B caller
  }
  process.exit(0);
}
```
This must come BEFORE the existing line 20 gate so `node scripts/agents-flow/drain-signals.js`
(no args, the existing every-tick invocation) is entirely unaffected (`process.argv[2]` is
`undefined` in that call, the new `if` is skipped) — verify with AC7 below.

## 4. Acceptance Criteria (pm/dev/qa)

- **AC1 (GATE-A blocks sub-HIGH):** fresh `esc-deep-dive-request` with `effective_severity` < HIGH
  (e.g. ESC-4 `INFO` per the shipped AC-2 SOE downgrade, or any `LOW`/`MED` token) → NO Opus spawn;
  `spawn_key` AND `guard_key` both released; row terminal; one `[ESC-DISPATCH] SKIP ... below HIGH
  floor` log line.
- **AC2 (GATE-A/B pass — novel HIGH, no recurrence):** fresh row, `effective_severity >= HIGH`, no
  open board row, `recurrence_count < 2` → Opus **DOES** spawn (regression guard against
  over-suppression — the hard mandate).
- **AC3 (GATE-B Tier 1 blocks — the concrete MBB regression fixture):** same
  `(ticker,quarter,trigger_id)` recurs while `REFLOW-<ticker>-<quarter>` (or any non-terminal row
  referencing `guard_key`) is open → NO Opus spawn, `[ESC-DISPATCH] recurrence known-root...` log,
  both locks released, row terminal. Use the LIVE `REFLOW-MBB-Q1-2026` (status=BLOCKED) + the two
  real `MBB|Q1-2026|ESC-2` `signals_processed` rows as the fixture.
- **AC4 (GATE-B Tier 2 blocks — bootstrap net):** no board row yet, but `signals_processed` already
  holds >=2 rows with identical `(type, ticker, quarter, trigger_id, context)` → NO Opus spawn;
  `reflow-needed-hint` emitted to `po`; row terminal.
- **AC5 (GATE-B Tier 2 passes on count==1):** no board row, first-ever occurrence → Opus spawns
  (never suppress a genuine first finding).
- **AC6 (self-healing):** board row transitions to a `TERMINAL_SET` status → Tier 1 stops blocking
  even though historical `recurrence_count` remains >=2 — regression test for the "stuck forever"
  risk flagged in §2.2.
- **AC7 (drain-mode regression guard):** `node scripts/agents-flow/drain-signals.js` (no args) on a
  fixture inbox produces byte-identical stdout/DB effects pre- and post-change — the new CLI branch
  must not alter default execution.
- **AC8 (injection safety):** `ticker`/`quarter`/`trigger_id`/`context` fixtures containing a
  single-quote (e.g. `"MB'B"`) do not error or inject — count query still runs correctly (escaped) or
  degrades to `count=0`, never a shell/SQL break.
- **AC9 (no ticker hardcode):** test fixtures cover at least 2 distinct tickers/quarters (not just
  MBB) proving no per-ticker branching was introduced — matches the hard mandate.

## 5. Dependencies / sequencing

Single atomic unit — both files change together (drain-esc-dispatch.md's GATE-B calls the new
drain-signals.js subcommand; landing one without the other breaks the flow doc's own pseudocode
contract). No deploy gate (flow-doc + script only, no `apps/` touch, no rebuild). Independent of the
currently-BLOCKED `REFLOW-MBB-Q1-2026`/`W5-FU-CTG-REFINE` deploy-gated work — this fix makes that
existing BLOCKED row *actually* suppress redispatch once shipped, but does not depend on it landing
first.
