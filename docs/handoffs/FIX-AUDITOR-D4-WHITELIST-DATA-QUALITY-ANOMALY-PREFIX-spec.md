# Fix Spec — FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX

**Task:** FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX · P2 · S · zone `apps/mcp-server/`
**Mode:** `supervised:true` + `plan_only:true` — this document is a PLAN only. `tasksMdJanitorJob.ts`, `handlers.md`, `audit-dimensions.md`, `system-map.json` are all UNTOUCHED by this cycle (verified — see closeout report).
**Produced by:** dev-mcp-server, 2026-08-08
**Handoff to:** po (adjudicates, then routes to a fix-authorized agent)
**Origin:** `origin_signal_id: sau-d4-data-quality-anomaly-dgc-q1-2026-not_found-20260725`, PO triage `po/triage-20260725T0645`, augmented `po/triage-20260728T13`
**BUILD-STANDARD:** not-applicable (whitelist-data fix, no new primitive; TDD unit-test extension only)

---

## 0. Live re-verification of the row's own citations

| Cited | Row says | Live (2026-08-08) |
|---|---|---|
| `KNOWN_LEGIT_PREFIXES` array | `:197-205` | **`:197-206`** (array literal spans 198-205 entries; `];` closes at 206) |
| `applyR1bFilter` call site | "around :602" | **`:603`** (`const { surviving, skipped } = applyR1bFilter(heldLocks, liveSessionIds, nowEpochSeconds);`) |
| `handlers.md` stale doc/code-gap note | `:19` | **confirmed `:19`**, text unchanged |
| `handlers.md` whitelist enumeration | `:49` | **confirmed `:49`** — already lists `cron-registration:*` (added 2026-08-07, see §2) |
| `audit-dimensions.md` stale doc/code-gap note | `:90` | heading at **`:88`**, body at **`:90`**, both stale (§2) |
| `audit-dimensions.md` whitelist enumeration | `:55` | **confirmed `:55`** — already lists `cron-registration:*` |
| `docs/agents/bctc-analyst/flow/cycle.md` reprocess guard | `:75` | **confirmed `:75`** — but see §1 correction: this line names a **signal**, not a lock kind |
| `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` table | `:120-147` | **confirmed** — `describe("Step R-1b — isKnownLegitPattern...")` block, `:119-150` (closing brace at 150) |
| Commit `e109f49f8` | claimed to exist, DONE_VERIFIED | **confirmed** — `e109f49f8119c5a1d9e8ade8594c3aca9c13668c`, 2026-07-08, "port D4 exclusion whitelist + 2-cycle debounce into tasksMdJanitorJob" |

---

## 1. Problem restatement — the row's premise is PARTIALLY STALE, re-derive from live state

**The row's specific cited lock, `data-quality-anomaly:DGC:Q1-2026`, is GONE.** Live-verified via `task_list_held(kind="sprint-task", expired=false)` (2026-08-08, this session): it does **not** appear in the current 12 held sprint-task locks. Its TTL (`claimed 2026-07-23T15:15:40Z`, `ttl_seconds=604800`) expired **2026-07-30T15:15:40Z** — 9 days ago. It was never released manually (the `.note` "DO NOT RELEASE" instruction is honored — nobody touched it; it simply expired naturally, which is in-bounds, TTL expiry is the MCP server's own lifecycle mechanism, not an agent action).

**A NEW, currently-live equivalent has already replaced it — under a DIFFERENT literal prefix.** The same live `task_list_held` call returns 3 held locks from `bctc-analyst` that are functionally the same class of thing (a data-quality escalation, board-row-less by design) but under the prefix **`bctc-dataquality:`** (not `data-quality-anomaly:`):

```
bctc-dataquality:vnindex-crosstool-mismatch      (claimed 2026-08-06, ttl 691200s/8d, expires 2026-08-15T00:19Z)
bctc-dataquality:HPG:operating-profit-zero       (claimed 2026-08-06, ttl 691200s/8d, expires 2026-08-15T00:19Z)
bctc-dataquality:DXG:persistent-absence          (claimed 2026-08-06, ttl 691200s/8d, expires 2026-08-14T18:09Z)
```

`docs/agents/bctc-analyst/flow/cycle.md:75` (the row's own cited origin for the lock kind) names a **signal** — `"a bctc-data-quality-anomaly signal to dev-team (Cross-Team Signal Directory pattern...)"` — not a `task_claim` lock kind at all. A repo-wide grep for `task_claim` calls in `docs/agents/bctc-analyst/` finds only two documented lock-minting call sites (`esc-coverage-guard.md:43` → `esc-datacov:*`, `main.md:119` → `esc-deepdive:*`); no flow doc documents a `data-quality-anomaly:*` or `bctc-dataquality:*` `task_claim`. **The lock-kind naming this class of escalation uses is undocumented and has already drifted once** (from the row's cited `data-quality-anomaly:` shape to the currently-live `bctc-dataquality:` shape) between 2026-07-19 (cycle.md's dated introduction) and 2026-08-06 (when the current 3 locks were claimed) — this is **direct, concrete proof of the row's own root-cause framing**: *"A static prefix list cannot track lock kinds that agents mint later."* It just happened again, under a renamed prefix, before this fix even landed.

**This is already firing, right now, unresolved.** `docs/agent-memory/notebooks/system-auditor.md` top section (`## d4-auto · 2026-08-08T03:00:02.589Z`, i.e. TODAY's D4 cycle) shows:
```
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence
```
6 candidates (both `not_found` and `pipeline_mismatch` facets, all 3 locks). No prior `## d4-auto` section exists in the current notebook window to match against (R-4b 2-cycle debounce), so **nothing has emitted to `signal_queue` yet** (confirmed: zero `sau-d4-*bctc-dataquality*` rows in the hot file or `docs/data/orch/archive/2026-08.json`). **If this same candidate set recurs at the next daily cycle (~2026-08-09T03:00Z) while today's line is still the most-recent `D4 candidates:` entry, it WILL emit** — a brand-new false-positive batch (6 rows, 2 facets × 3 locks), separate from and in addition to the already-archived `data-quality-anomaly:DGC:Q1-2026` batch (4 rows, 2026-07-25/27/28, `RESOLVED`/`READ` in `docs/data/orch/archive/2026-07.json`).

**Implication for the fix shape:** covering only the row's literally-named `data-quality-anomaly:` prefix (per deliverable point 1, verbatim) would ship a fix that is **already obsolete against currently-forming live signal** — it would do nothing for tomorrow's likely emission. §4 covers both prefixes.

---

## 2. Stale doc drift (deliverable point 4) — confirm/correct

Both `handlers.md:19` and `audit-dimensions.md:88-90` assert the code was never updated to implement the R-1b/R-4b spec. **FALSE**, confirmed via `git log`:

- `e109f49f8` (2026-07-08, same calendar day as the doc's own "as of 2026-07-08" framing) — ported R-1b exclusion whitelist + R-4b 2-cycle debounce into `tasksMdJanitorJob.ts` (`isKnownLegitPattern`, `isLiveConcurrentSession`, `applyR1bFilter`, `applyR4bDebounce`, wired at `runTasksMdJanitor` `:585-608` and `:727-730`).
- `86b31eccd` (2026-08-07) — a SECOND, more recent landing added `cron-registration:` to the code's `KNOWN_LEGIT_PREFIXES` (TASK_602). Notably, **this commit touched only the code file + its test file** — `handlers.md`/`audit-dimensions.md` picked up `cron-registration:*` via a **separate** commit (not this one), i.e. the doc-plane sync for that addition already happened out-of-band from the code-plane change. This is live proof of exactly the failure mode deliverable point 3 warns about ("or it re-drops on the next port") — it already happened once, one day before this task was even dispatched.

The "Known doc/code gap (2026-07-08...)" framing in both docs is dead weight that actively misleads a future reader into thinking D4-R1b/R4b are unimplemented. §5 replaces it with a corrected status note (kept, not deleted, for provenance — same convention as the DOC-AUDIT precedent spec, `docs/handoffs/FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE-spec.md`).

---

## 3. `pipeline_mismatch` category-error claim (po_second_facet_20260728) — REFUTED against live code

The row's `po_second_facet_20260728` field claims the `pipeline_mismatch` emission is a **category error** (comparing `.head.active_task_id`, a dev-team dispatch-plane field, against a different-agent/different-plane escalation lock) that a whitelist entry alone **cannot** silence — asserting it needs the R-1b exclusion consulted separately.

**This is refuted by `git blame` on the exact code path.** `tasksMdJanitorJob.ts:628-645` (the `heldLocks.length > 0 && activeTaskId !== null` branch — the one that applies whenever ANY sprint-task lock is held, which is always true today, 12 locks held):

```
fc398b8a84 (2026-05-21) 628: } else if (heldLocks.length > 0 && activeTaskId !== null) {
e109f49f81 (2026-07-08) 632:   for (const lock of survivingLocks) {
```

`for (const lock of survivingLocks)` — **not** `heldLocks`. `survivingLocks` is the exact post-R-1b-filtered set (`applyR1bFilter(heldLocks, ...)`, assigned at `:604`) that `R-3`'s `not_found` check also iterates (`:669`, `for (const lock of survivingLocks)`). Both the `not_found` (R-3) and `pipeline_mismatch` (R-2, the per-lock loop) candidate-producing loops read from the **same** post-whitelist array. `git blame` shows this `survivingLocks` scoping on the R-2 loop was introduced in the **same commit** (`e109f49f81`, 2026-07-08) that ported the R-1b filter itself — it did not exist as `heldLocks`-scoped before that and get "fixed later"; R-1b and this gating landed atomically.

**Conclusion:** a single `KNOWN_LEGIT_PREFIXES` entry (however sourced — see §4) causes `applyR1bFilter` to drop the matching lock at R-1b, so it never enters `survivingLocks`, so it is evaluated by **neither** R-2's per-lock mismatch loop **nor** R-3's `not_found` loop. **One whitelist entry silences both emissions** — deliverable point 1's "both emissions" requirement is satisfied structurally by the existing R-1b gate; no separate `pipeline_mismatch`-specific code change is needed.

(The *conceptual* observation underlying the claim — that comparing a dev-task dispatch field against an unrelated agent's escalation lock is not a natural apples-to-apples comparison — is sound as a design critique. It is exactly *why* the R-1b whitelist exists as a pre-filter in front of both R-2 and R-3. The claim that fails against live code is narrower and more specific: that whitelisting is *insufficient* to silence `pipeline_mismatch`. It is sufficient, and has been since the same commit that introduced R-1b.)

**Only one case is NOT covered by R-1b, and it does not apply here:** `runTasksMdJanitor:619-627` — the `heldLocks.length === 0 && errors.length === 0` branch (task_list_held returns *nothing at all* held) emits a `pipeline_mismatch` directly, unfiltered, unconditionally, by design (D4-R1/AC-4 — "empty held-lock set but a dispatch head is active" is itself the signal, independent of any specific lock's identity). This branch is unreachable whenever ANY sprint-task lock is held (true today — 12 held) and is not a `data-quality-anomaly`/`bctc-dataquality`-specific concern; no change proposed here.

---

## 4. Design decision (deliverable point 2) — system-map.json SSOT, NOT a structural pattern-match

**Decision: option (b) — promote `KNOWN_LEGIT_PREFIXES` to `docs/data/system-map.json`, single source read by code; both docs stop duplicating the literal list and instead point at the SSOT.**

### Why not option (a) — generalized structural pattern-match on `<kind>:<TICKER>:<PERIOD>[:ESC-N]`

The row itself frames the 3 known kinds as sharing that shape. **Live data refutes generality of the shape itself**: `bctc-dataquality:vnindex-crosstool-mismatch` (one of the 3 *currently held* locks, §1) is **not** ticker/period-shaped at all — it is `<kind>:<free-text-description>`. A regex keyed on the `<TICKER>:<PERIOD>` shape would **not** have matched this real, currently-forming false positive. Loosening the shape further (e.g. "any colon-separated string") to catch it would make the match too broad: this repo's `intent:*`/`cron:*`/`session-presence*`/`commit-mutex*` kinds are ALSO colon-shaped, and a sufficiently loose structural regex risks silently whitelisting a genuinely orphaned lock from a future bug (some agent mints `stale-claim:XYZ` by mistake) — this repo's own standing lessons treat *false negatives* (masked failures) as worse than a few recurring low-severity false positives (`feedback_passive_health_masks_dead_data`, `feedback_composite_score_masks_dead_detector_pruned_table`). The acceptance criterion's negative control ("a genuinely orphaned NON-whitelisted sprint-task lock must STILL trip D4") is explicit about not wanting blanket suppression — a kind-agnostic structural regex is exactly that risk.

### Why option (b) fits

1. **CLAUDE.md governance fit, verbatim.** "System Data — Never Hardcode": *"All structural data (services, agents, zones, channels, sources, watchlist) lives in `docs/data/system-map.json`."* A curated list of "lock-kind prefixes this system currently trusts as legit persistent/escalation locks" is exactly this class of structural fact.
2. **Existing, proven precedent in this exact codebase — do not invent a new pattern.** `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` (`WATCHLIST-DB-SYSMAP-DRIFT-FIX`, 2026-07-11) already solved the identical problem class (a hardcoded TS array that drifted from `system-map.json`'s SSOT) with `loadWatchlistSeedFromSystemMap(path)`: module-load-time `readFileSync` + `JSON.parse`, fail-open on error, exported for direct unit-test coverage of the fallback path (see `WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts:179`, `loadWatchlistSeedFromSystemMap("/nonexistent/path/system-map.json")`). §5 mirrors this pattern exactly, with **one deliberate divergence**: watchlist's fail-open target is `[]` (an empty watchlist just seeds nothing, safe); this fix's fail-open target must be a **non-empty fallback constant** (an empty whitelist would un-suppress every currently-known legit pattern and reintroduce the exact flood this whole subsystem exists to prevent) — see §5 `FALLBACK_KNOWN_LEGIT_PREFIXES`.
3. **Directly resolves deliverable point 3 (doc-sync).** Once the list is data, not code, `handlers.md`/`audit-dimensions.md` stop needing to carry a literal copy that can drift — they name the SSOT path once. "Byte-identical" (per acceptance) becomes structural (one file, read three ways) rather than a manually-maintained invariant across 3 files — which is the literal failure mode that created this very bug (list authored 2026-07-08, never revisited).
4. **Minimal blast radius.** `isKnownLegitPattern(bareId): boolean` and `applyR1bFilter(...)` keep their exact existing signatures and matching logic (simple prefix `.startsWith()` — unchanged). Only where `KNOWN_LEGIT_PREFIXES`'s *value* comes from changes. All 27 existing passing tests in `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` continue to exercise the same call surface unmodified.

---

## 5. Verbatim diffs

### 5a. `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (lines 192-206 → replaced; 208-211 UNCHANGED)

**Before:**
```ts
/**
 * Known-legit kind/pattern list per handlers.md §Step R-1b item 1: persistent /
 * guard / escalation locks that are board-row-less OR held concurrently with any
 * active task BY DESIGN. Prefix-matched (glob) except the "-singleton" suffix.
 */
const KNOWN_LEGIT_PREFIXES: readonly string[] = [
  "cron:",
  "cron-registration:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "session-presence",
  "commit-mutex",
  "intent:",
];

export function isKnownLegitPattern(bareId: string): boolean {
  if (bareId.endsWith("-singleton")) return true;
  return KNOWN_LEGIT_PREFIXES.some(prefix => bareId.startsWith(prefix));
}
```

**After:**
```ts
/**
 * Known-legit kind/pattern list per handlers.md §Step R-1b item 1: persistent /
 * guard / escalation locks that are board-row-less OR held concurrently with any
 * active task BY DESIGN. Prefix-matched (glob) except the "-singleton" suffix.
 *
 * FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX (2026-08-08): SSOT moved
 * to docs/data/system-map.json `.project.coordination.known_legit_lock_prefixes`
 * (CLAUDE.md "System Data — Never Hardcode"). A hardcoded TS array duplicated
 * verbatim across this file + handlers.md + audit-dimensions.md is the root
 * cause of this fix — authored once (2026-07-08), never revisited when
 * bctc-analyst minted new escalation-lock kinds later, including a renamed
 * prefix (`data-quality-anomaly:` -> `bctc-dataquality:`) some time before
 * 2026-08-08. FALLBACK_KNOWN_LEGIT_PREFIXES below is a defense-in-depth
 * safety net ONLY (mirrors this file's own "never suppress LESS on this
 * path's absence" philosophy — see listSessionPresence's failure-mode
 * comment above); it is NOT the source of truth — add new prefixes to
 * system-map.json, not here.
 */
const FALLBACK_KNOWN_LEGIT_PREFIXES: readonly string[] = [
  "cron:",
  "cron-registration:",
  "po-triage-",
  "esc-datacov:",
  "esc-deepdive:",
  "data-quality-anomaly:",
  "bctc-dataquality:",
  "session-presence",
  "commit-mutex",
  "intent:",
];

const DEFAULT_SYSTEM_MAP_PATH = "docs/data/system-map.json";

/**
 * Loads the known-legit lock-prefix whitelist from docs/data/system-map.json
 * (SSOT). Mirrors loadWatchlistSeedFromSystemMap() (infrastructure/db/
 * seedWatchlist.ts) — identical relative-to-cwd path resolution (works
 * in-container via the docs/data volume mount, and in local `bun test` via
 * the apps/mcp-server/docs -> ../../docs symlink).
 *
 * On any failure (missing file, malformed JSON, missing/empty key) returns
 * FALLBACK_KNOWN_LEGIT_PREFIXES — deliberately NOT an empty array (unlike
 * loadWatchlistSeedFromSystemMap's fail-open-to-[] contract): an empty
 * whitelist here would un-suppress every currently-known persistent/guard
 * lock kind and flood signal_queue — the exact regression this subsystem
 * exists to prevent. Exported for direct unit testing (fallback-path
 * coverage, mirrors WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts:179's pattern).
 */
export function loadKnownLegitPrefixesFromSystemMap(
  path: string = DEFAULT_SYSTEM_MAP_PATH,
): readonly string[] {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as {
      project?: { coordination?: { known_legit_lock_prefixes?: string[] } };
    };
    const list = parsed.project?.coordination?.known_legit_lock_prefixes;
    if (!Array.isArray(list) || list.length === 0) {
      console.warn(
        `[tasks-md-janitor] WARN: ${path} .project.coordination.known_legit_lock_prefixes ` +
        `missing/empty — using FALLBACK_KNOWN_LEGIT_PREFIXES`,
      );
      return FALLBACK_KNOWN_LEGIT_PREFIXES;
    }
    return list;
  } catch (err) {
    console.warn(
      `[tasks-md-janitor] WARN: could not load ${path} (${(err as Error).message}) — ` +
      `using FALLBACK_KNOWN_LEGIT_PREFIXES`,
    );
    return FALLBACK_KNOWN_LEGIT_PREFIXES;
  }
}

const KNOWN_LEGIT_PREFIXES: readonly string[] = loadKnownLegitPrefixesFromSystemMap();

export function isKnownLegitPattern(bareId: string): boolean {
  if (bareId.endsWith("-singleton")) return true;
  return KNOWN_LEGIT_PREFIXES.some(prefix => bareId.startsWith(prefix));
}
```

No new imports required — `readFileSync` is already imported (`:47`). `isKnownLegitPattern`, `isLiveConcurrentSession`, `applyR1bFilter`, `runTasksMdJanitor` bodies: **zero changes**.

---

### 5b. `docs/data/system-map.json` — new key `.project.coordination.known_legit_lock_prefixes`

Insertion point: end of `.project`, immediately after `"watchlist": [...]` closes (live line 1755 `]`, before line 1756 `}`).

**Before** (live tail, `:1748-1757`):
```json
      {
        "ticker": "DBC",
        "company": "Dabaco",
        "sector": "Agriculture / Livestock",
        "exchange": "HOSE",
        "active": true
      }
    ]
  }
}
```

**After:**
```json
      {
        "ticker": "DBC",
        "company": "Dabaco",
        "sector": "Agriculture / Livestock",
        "exchange": "HOSE",
        "active": true
      }
    ],
    "coordination": {
      "known_legit_lock_prefixes": {
        "_note": "SSOT for tasksMdJanitorJob.ts KNOWN_LEGIT_PREFIXES (D4-R1b exclusion whitelist) — read by apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts loadKnownLegitPrefixesFromSystemMap(). docs/agents/system-auditor/{handlers,audit-dimensions}.md reference this array by pointer, never duplicate it. Adding a new legit persistent/escalation lock-kind prefix: edit ONLY this array.",
        "_trigger": "a new agent-minted persistent/guard/escalation task_claim lock-kind prefix appears that should be excluded from D4's held-lock/board-row reconciliation",
        "prefixes": [
          "cron:",
          "cron-registration:",
          "po-triage-",
          "esc-datacov:",
          "esc-deepdive:",
          "data-quality-anomaly:",
          "bctc-dataquality:",
          "session-presence",
          "commit-mutex",
          "intent:"
        ]
      }
    }
  }
}
```

**Note on JSON shape:** code (§5a) reads `.project.coordination.known_legit_lock_prefixes` expecting a bare `string[]`, but this proposed structure nests it one level deeper at `.project.coordination.known_legit_lock_prefixes.prefixes` (to carry the `_note`/`_trigger` metadata this file's own convention uses at the top level, e.g. `_ssot`/`_trigger` at `:2-4`). **Whoever implements must pick ONE and make code + this JSON agree** — either (i) keep the metadata wrapper and change §5a's code to read `.project.coordination.known_legit_lock_prefixes.prefixes`, or (ii) drop the wrapper and make `known_legit_lock_prefixes` the bare array directly (simpler code, loses inline `_note`/`_trigger` — acceptable since `system-map-query/SKILL.md`'s Update Protocol table, §5d, can carry that context instead). **This spec recommends (ii) — bare array — for consistency with every other `.project.*` array in this file (`watchlist`, `zones`, `channels`, `data_sources` are all bare arrays, no per-array metadata wrapper)**; the `_note`/`_trigger` convention in this file applies at the document root only, not per-array. Implementer: use the bare-array form; §5a's code already matches that.

---

### 5c. `docs/agents/system-auditor/handlers.md`

**Before** (`:19`):
```markdown
As of 2026-07-08 (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE triage) the spec below (Steps R-1b, R-4b) is CORRECTED but the code has **NOT yet been updated to match** — this is a known doc/code gap, tracked as a follow-up code task for `dev-mcp-server`. Until that lands, the 6+ recurring false-positive batches (esc-datacov:*, cron:dev-team:*, dev-team-cron-singleton) will keep firing daily. Also note: the code's `listHeld()` currently calls `listHeldTasks({ kind: "sprint-task" })` WITHOUT `expired: false` — the "+2L expired:false filter" fix documented in the size-justification above was applied to THIS spec doc only and was never carried into the code; verify/apply both when the code fix lands.
```

**After:**
```markdown
**RESOLVED 2026-07-08** (same day as this spec's own correction) — the code was ported in commit `e109f49f8` (`isKnownLegitPattern`, `isLiveConcurrentSession`, `applyR1bFilter`, `applyR4bDebounce`, `expired:false` on both `listHeld`/`listSessionPresence`). Further extended `2026-08-07` (`86b31eccd`, `cron-registration:*`) and `2026-08-08` (FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX, `data-quality-anomaly:*`/`bctc-dataquality:*` + whitelist SSOT moved to `docs/data/system-map.json`). This section previously read "code has NOT yet been updated to match" — that claim went stale the same day it was written and was never corrected until now; do not trust prose staleness claims in this doc without re-checking `git log` on `tasksMdJanitorJob.ts`.
```

**Before** (`:48-50`):
```markdown
1. **Known-legit kind/pattern** — `bare_task_id` matches (glob, prefix unless noted) any of:
   `cron:*` (covers `cron:dev-team:*`, `cron:auditor-t1`, `cron:auditor-t2`, `cron:auditor-t3`), `cron-registration:*` (FIX-CRON-REARM-CROSS-SESSION-DEDUP, 2026-08-07 — cross-session cron dedup markers, same class as `cron:*`, covers `cron-registration:cowork-team`/`detect-loop`/`standalone-team`), `*-singleton` suffix (covers `dev-team-cron-singleton`), `po-triage-*`, `esc-datacov:*`, `esc-deepdive:*`, `session-presence*`, `commit-mutex*`, `intent:*`.
   These are persistent/guard/escalation locks that are board-row-less OR held CONCURRENTLY with any active task BY DESIGN — see `feedback_esc3_held_lock_no_board_row_is_legit` and the `debounce_and_exclusion_spec`/`recur_20260703T0300` notes on task `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE`. (`session-presence`/`commit-mutex`/`intent:*` are currently unreachable given Step R-1's `kind: "sprint-task"` filter — kept as a defense-in-depth safety net if that filter is ever widened.)
```

**After:**
```markdown
1. **Known-legit kind/pattern** — `bare_task_id` matches (glob, prefix unless noted) any prefix in the **SSOT list**: `docs/data/system-map.json` `.project.coordination.known_legit_lock_prefixes` (FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX, 2026-08-08 — this list is READ from that file by `tasksMdJanitorJob.ts`, never hand-duplicated here; this section stopped being the enumeration source of truth on that date). At time of writing it contains: `cron:*` (covers `cron:dev-team:*`, `cron:auditor-t1/-t2/-t3`), `cron-registration:*` (cross-session cron dedup markers), `*-singleton` suffix (covers `dev-team-cron-singleton` — handled by a separate suffix check, not this array), `po-triage-*`, `esc-datacov:*`, `esc-deepdive:*`, `data-quality-anomaly:*`/`bctc-dataquality:*` (bctc-analyst data-quality escalations — two prefixes because the agent renamed this lock-kind mid-flight, 2026-07-19 to sometime before 2026-08-06; see FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX spec §1), `session-presence*`, `commit-mutex*`, `intent:*`. **Always re-read `system-map.json` for the current live list — this prose is illustrative, not authoritative, and will go stale exactly like the old hardcoded array did if hand-edited without touching the SSOT.**
   These are persistent/guard/escalation locks that are board-row-less OR held CONCURRENTLY with any active task BY DESIGN — see `feedback_esc3_held_lock_no_board_row_is_legit` and the `debounce_and_exclusion_spec`/`recur_20260703T0300` notes on task `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE`. (`session-presence`/`commit-mutex`/`intent:*` are currently unreachable given Step R-1's `kind: "sprint-task"` filter — kept as a defense-in-depth safety net if that filter is ever widened.)
```

---

### 5d. `docs/agents/system-auditor/audit-dimensions.md`

**Before** (`:55`, table row):
```markdown
| D4-R1b | Exclusion whitelist (`cron:*`, `cron-registration:*`, `*-singleton`, `po-triage-*`, `esc-datacov:*`, `esc-deepdive:*`, `session-presence*`, `commit-mutex*`, `intent:*`) + live-concurrent-session guard | Held locks matching either filter are excluded from D4-R2/D4-R3 entirely (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE; `cron-registration:*` added FIX-CRON-REARM-CROSS-SESSION-DEDUP 2026-08-07) |
```

**After:**
```markdown
| D4-R1b | Exclusion whitelist (SSOT: `docs/data/system-map.json` `.project.coordination.known_legit_lock_prefixes` — never enumerated inline here, see handlers.md §Step R-1b) + live-concurrent-session guard | Held locks matching either filter are excluded from D4-R2/D4-R3 entirely (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE; `cron-registration:*` added FIX-CRON-REARM-CROSS-SESSION-DEDUP 2026-08-07; `data-quality-anomaly:*`/`bctc-dataquality:*` added + whitelist promoted to system-map.json SSOT FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX 2026-08-08) |
```

**Before** (`:88-90`):
```markdown
### Known doc/code gap (2026-07-08, FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE)

This spec (D4-R1b exclusion whitelist + D4-R4b debounce) is CORRECTED as of 2026-07-08, but the live code (`apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`) has NOT been updated to implement it yet — that is a `dev-mcp-server` code task, outside agent-father's zone (`apps/**` is forbidden for agent-father). Until the code lands, the 6+ recurring false-positive batches (esc-datacov:*, cron:dev-team:*, dev-team-cron-singleton) will keep firing daily unchanged.
```

**After:**
```markdown
### Resolution history (was: "Known doc/code gap", 2026-07-08 — STALE, corrected 2026-08-08)

This spec (D4-R1b exclusion whitelist + D4-R4b debounce) was corrected 2026-07-08 and shipped to code the SAME day (`e109f49f8`) — the prior version of this note claimed the code was "NOT yet been updated to implement it" for a full month after that stopped being true; do not trust it, always re-check `git log -- apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`. Whitelist entries added since: `cron-registration:*` (2026-08-07, FIX-CRON-REARM-CROSS-SESSION-DEDUP). `data-quality-anomaly:*`/`bctc-dataquality:*` (2026-08-08, FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX) — this same task also moved the whitelist's source of truth from a TS literal (duplicated across this file, handlers.md, and the code) to `docs/data/system-map.json` `.project.coordination.known_legit_lock_prefixes`, so future additions touch one file, not three.
```

---

### 5e. `apps/mcp-server/src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts` (extends the `:119-150` table per acceptance)

**Before** (`:133-144`, inside `it("covers each documented pattern class individually", ...)`):
```ts
    it("covers each documented pattern class individually", () => {
      expect(isKnownLegitPattern("cron:auditor-t1")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t2")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t3")).toBe(true);
      expect(isKnownLegitPattern("dev-team-cron-singleton")).toBe(true);
      expect(isKnownLegitPattern("po-triage-2026-07-08")).toBe(true);
      expect(isKnownLegitPattern("esc-datacov:VCB:Q1-2026:ESC-3")).toBe(true);
      expect(isKnownLegitPattern("esc-deepdive:GVR:ESC-4")).toBe(true);
      expect(isKnownLegitPattern("session-presence:abc123")).toBe(true);
      expect(isKnownLegitPattern("commit-mutex:orch-state")).toBe(true);
      expect(isKnownLegitPattern("intent:dev-mcp-server:fix-d4")).toBe(true);
    });
```

**After** (adds the two new prefixes + a negative control disproving blanket suppression, per acceptance's negative-control requirement):
```ts
    it("covers each documented pattern class individually", () => {
      expect(isKnownLegitPattern("cron:auditor-t1")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t2")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t3")).toBe(true);
      expect(isKnownLegitPattern("dev-team-cron-singleton")).toBe(true);
      expect(isKnownLegitPattern("po-triage-2026-07-08")).toBe(true);
      expect(isKnownLegitPattern("esc-datacov:VCB:Q1-2026:ESC-3")).toBe(true);
      expect(isKnownLegitPattern("esc-deepdive:GVR:ESC-4")).toBe(true);
      // FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX (2026-08-08):
      // the row's originally-cited lock kind (now TTL-expired, no longer held)...
      expect(isKnownLegitPattern("data-quality-anomaly:DGC:Q1-2026")).toBe(true);
      // ...and its currently-live renamed equivalent (3 locks held as of
      // 2026-08-08 — vnindex-crosstool-mismatch is NOT ticker:period-shaped,
      // proving a structural-shape regex would have missed this real case):
      expect(isKnownLegitPattern("bctc-dataquality:HPG:operating-profit-zero")).toBe(true);
      expect(isKnownLegitPattern("bctc-dataquality:vnindex-crosstool-mismatch")).toBe(true);
      expect(isKnownLegitPattern("session-presence:abc123")).toBe(true);
      expect(isKnownLegitPattern("commit-mutex:orch-state")).toBe(true);
      expect(isKnownLegitPattern("intent:dev-mcp-server:fix-d4")).toBe(true);
    });

    // Negative control (acceptance criterion): a lock kind that superficially
    // resembles the whitelisted escalation shape but is NOT an actual known
    // prefix must still trip D4 — proves this fix does not blanket-suppress.
    it("does NOT exclude a lookalike-but-unknown escalation-shaped lock id (no blanket suppression)", () => {
      expect(isKnownLegitPattern("bogus-escalation:XYZ:Q1-2026:ESC-1")).toBe(false);
      expect(isKnownLegitPattern("data-quality-anomaly-typo:DGC:Q1-2026")).toBe(false);
    });

    // Fallback-path coverage (mirrors WATCHLIST-DB-SYSMAP-DRIFT-FIX.test.ts:179's
    // loadWatchlistSeedFromSystemMap("/nonexistent/path...") pattern) — confirms
    // a missing/corrupt system-map.json degrades to the safety-net constant,
    // never to an empty (i.e. suppress-nothing) whitelist.
    it("loadKnownLegitPrefixesFromSystemMap falls back to FALLBACK_KNOWN_LEGIT_PREFIXES on missing file", () => {
      const prefixes = loadKnownLegitPrefixesFromSystemMap("/nonexistent/path/system-map.json");
      expect(prefixes.length).toBeGreaterThan(0);
      expect(prefixes).toContain("data-quality-anomaly:");
      expect(prefixes).toContain("bctc-dataquality:");
    });
```

(Requires adding `loadKnownLegitPrefixesFromSystemMap` to the existing named import block at the top of the test file, alongside `isKnownLegitPattern`/`applyR1bFilter`/etc.)

---

## 6. Acceptance-criteria verification plan

| Acceptance clause | How this fix satisfies it |
|---|---|
| Live cycle with `data-quality-anomaly:DGC:Q1-2026` held emits ZERO D4 rows + logs the SKIP line | Lock is presently expired/unheld, so this exact scenario cannot be RAW-verified live today — covered by unit test (§5e) instead; the SKIP log line (`tasksMdJanitorJob.ts:606`, unchanged) fires for any `isKnownLegitPattern`-true bare id, format unaffected by this fix |
| Negative control: genuinely orphaned non-whitelisted lock still trips D4 | §5e new test; existing `NEGATIVE_CONTROL_TASK_IDS` (`TASK_1996` etc.) continue to pass unchanged (fallback/SSOT list is a superset addition, not a broadening of match logic) |
| Unit tests extend `:120-147` table | §5e |
| Code whitelist and both doc lists byte-identical / single-sourced | Structural via §5b (SSOT) + §5c/5d (docs stop enumerating, point at SSOT instead) |
| **Additional, not in the row but required by "verify everything live":** the CURRENTLY forming `bctc-dataquality:*` false-positive (§1) must also stop | Covered — both prefixes land in the same SSOT array (§5b) and fallback (§5a) |

Post-landing verification (for whoever implements + qa): next daily D4 cycle (~03:00Z) should show `D4 SKIP: bctc-dataquality:<id> — known-legit-pattern` (×3) in the job's debug log and zero new `sau-d4-*bctc-dataquality*`/`sau-d4-*data-quality-anomaly*` rows in `signal_queue`.

---

## 7. Implementation notes for whoever ships this

- 4 files change: `tasksMdJanitorJob.ts` (§5a), `system-map.json` (§5b), `handlers.md` (§5c), `audit-dimensions.md` (§5d), plus the test file (§5e) — 5 total.
- `system-map-query/SKILL.md`'s "Update Protocol" table (`:136-148`) does not currently have a row for lock-prefix changes — optional nice-to-have, add `| New legit lock-kind prefix | .project.coordination.known_legit_lock_prefixes |` if convenient; not required by this task's acceptance.
- Resolve the JSON-shape decision flagged in §5b (bare array recommended) before writing code — code and data must agree on one shape.
- Do not fold in a cleanup of the undocumented `bctc-dataquality:`/`data-quality-anomaly:` lock-kind-naming drift itself (§1) — that is a `bctc-analyst` flow-doc concern (document one canonical lock-kind name and stop the agent renaming it ad hoc), out of `dev-mcp-server`'s zone and out of this task's scope. Flagging for PO to consider a follow-up row.
- TDD: RED first (add §5e's new `expect()` calls against the CURRENT code — they fail since `data-quality-anomaly:`/`bctc-dataquality:` are not yet in `KNOWN_LEGIT_PREFIXES`), then land §5a+§5b together (code depends on the JSON key existing), confirm GREEN, then land §5c+§5d (docs, no runtime dependency, can be same or separate commit).

---

## 8. PO PLAN REVIEW — 2026-08-15T05:54:35Z (po, dev-team review-lane SECONDARY-drain)

Verdict: **core design RATIFIED, implementation AUTHORIZED, 3 binding corrections (AC-5/6/7) required in the same pass.** The board row carries these as appended `acceptance` clauses; this section is their full rationale. Row fields: `po_plan_review_20260815T055435`, `po_goahead_20260815T055435`.

### 8.1 What I verified at source (not from the review note)

PLAN REVIEW — po 2026-08-15T05:54Z, dispatched by dev-team review-lane SECONDARY-drain. This is a PLAN review (plan_only:true), NOT a code sign-off.

PLAN-ONLY HONORED — VERIFIED, not relayed: `git log --oneline --since=2026-08-08T05:51:27Z` (this row's claimed_at) on tasksMdJanitorJob.ts returns ZERO commits. Two commits touched other listed paths and are unrelated peer work: 15492ff61 (cowork per-tick SSOT, touches system-map.json .project cowork keys) and d89392752 (orch-sentinel VPS route set, touches audit-dimensions.md). `git status --porcelain` clean on all 4 files. No code was edited. Good.

PREFIX COVERAGE — PASSES the test my own po_fold_20260811T1237Z set: the spec does NOT merely cover the row's known-wrong titled prefix. §5a fallback, §5b SSOT array and §5e tests all carry BOTH `bctc-dataquality:` AND `data-quality-anomaly:`; `esc-datacov:`/`esc-deepdive:` were already whitelisted at tasksMdJanitorJob.ts:201-202 and stay. dev-mcp-server independently caught the prefix rename before I flagged it (its 2026-08-08 note predates my 08-11 fold).

CORE DESIGN DECISION — SOUND, ratified. Option 2b (promote KNOWN_LEGIT_PREFIXES to docs/data/system-map.json `.project.coordination.known_legit_lock_prefixes`, non-empty fail-open fallback) is the right call and is correctly argued. Its rejection of option 2a (a structural `<kind>:<TICKER>:<PERIOD>` regex) rests on real evidence I re-checked: the live lock `bctc-dataquality:vnindex-crosstool-mismatch` is NOT ticker/period-shaped, so a shape regex would have missed the very FP that was forming — and loosening it further would risk false-negatives on a genuinely orphaned lock, which this repo's standing lessons rank as worse. Fail-open-to-NON-EMPTY (never `[]`) is also right: an empty whitelist un-suppresses every known guard lock and floods signal_queue.

NOT RATIFIED AS WRITTEN — 2 defects, both of which let this ship with the SSOT silently inert while 100% of the stated acceptance reads GREEN. Now binding as AC-5 (§5b verbatim block contradicts §5b prose and §5a's reader — wrapper vs bare array; mismatch degrades to fallback behind a console.warn, and since the fallback ALREADY carries both new prefixes, the FP is still suppressed, the D4 SKIP lines still print, and every test still passes while system-map.json is never read) and AC-6 (§5e cannot detect that: its only loader test targets the FALLBACK path via /nonexistent/path, and all isKnownLegitPattern assertions pass identically under SSOT or fallback — a positive-path sentinel test is required). Plus AC-7, a PO design decision overriding §5a: module-scope `const ... = load...()` in a DAILY-CRON job inside a long-lived process means system-map.json edits are inert until container restart — the seedWatchlist precedent does not transfer because seeding is startup-scoped by design. Together AC-5/6/7 are the difference between "one SSOT file" and "three hardcoded copies became one hardcoded copy plus a decorative JSON key".

LIVE STATE 2026-08-15T05:54Z — RE-VERIFIED, urgency framing in this row's older notes is now STALE, do not re-derive from them: all 3 `bctc-dataquality:*` locks cited in my 08-11 fold have TTL-EXPIRED (task_list_held kind=sprint-task expired=false returns 10 locks, none `bctc-dataquality:*`). Hot signal_queue carries ZERO `sau-d4-*` rows. The false positive is currently DORMANT, not firing — the "2-per-day recurring FP into PO's inbox" framing that drove P3->P2 is not true today. It WILL recur the next time bctc-analyst mints the prefix (it held these ~8d at a stretch, 2026-08-06 to 08-14), so the fix stays warranted at P2, but nobody is being flooded right now: implement it properly rather than fast.

DISPOSITION: implementation AUTHORIZED — plan_only true->false, po_goahead_20260815T055435 stamped, next_agent/owner -> dev-mcp-server, row stays in review[] (SECONDARY-drain is its proven live picker; ready[] with supervised:true + plan_only:false would be a READY-XOR stranding shape). Spec §5a/§5b/§5e must be corrected IN THE SAME PASS as the code — the spec is the artifact a future porter reads, and shipping code that diverges from it re-opens the doc/code drift this row's own deliverable point 4 exists to close.

### 8.2 AC-5 / AC-6 / AC-7 — the three binding corrections

- AC-5 (po 2026-08-15, MANDATORY — spec self-contradiction): the SSOT must be PROVEN LIVE-READ, not merely present. Spec §5b's verbatim "After" JSON block contradicts §5b's own closing prose AND §5a's code: the block nests the list at `.project.coordination.known_legit_lock_prefixes.prefixes` (wrapper form (i)) while §5a reads `.project.coordination.known_legit_lock_prefixes` as a bare `string[]` and the prose recommends bare-array form (ii). An implementer copy-pasting the verbatim block — which is the stated purpose of a "verbatim diffs" section — ships a shape mismatch that trips `!Array.isArray(list)` and silently returns FALLBACK_KNOWN_LEGIT_PREFIXES behind a `console.warn`. Because the fallback already contains BOTH new prefixes, every §5e test still passes, the `D4 SKIP` log lines still appear, and §6's entire acceptance table still reads GREEN while the SSOT is dead code. Required: rewrite §5b's verbatim block to the bare-array form so verbatim == recommendation == §5a's reader, and move the `_note`/`_trigger` text to system-map-query/SKILL.md's Update Protocol table (§7 already contemplates that row).

- AC-6 (po 2026-08-15, MANDATORY — untestable-by-construction): add a POSITIVE-path SSOT test that FAILS if system-map.json is not actually read. §5e as written cannot detect the AC-5 failure at all: its only `loadKnownLegitPrefixesFromSystemMap` test deliberately exercises the FALLBACK path (`/nonexistent/path/system-map.json`), and every `isKnownLegitPattern(...)` assertion passes identically whether the SSOT or the fallback supplied the list. No test in the suite distinguishes "SSOT read" from "SSOT silently unread". Required: assert against the REAL `docs/data/system-map.json` that the returned list is NOT deep-equal to FALLBACK_KNOWN_LEGIT_PREFIXES — simplest sound form: put one sentinel prefix in system-map.json that is deliberately ABSENT from the fallback constant, and assert `isKnownLegitPattern("<sentinel>...") === true`. Without this, AC-5 can regress at any future edit and nothing goes red.

- AC-7 (po 2026-08-15, MANDATORY — PO design decision, overrides §5a): the whitelist MUST be re-read per janitor cycle, not once at module load. §5a proposes `const KNOWN_LEGIT_PREFIXES = loadKnownLegitPrefixesFromSystemMap()` at module scope. `tasksMdJanitorJob` is a DAILY CRON (`cronConfig.ts:198`, `'0 3 * * *'`) invoked from `schedulerJobTable.ts:953-957` inside the long-lived scheduler process, so a module-scope const is evaluated exactly once at container start: every later edit to system-map.json is silently inert until the next rebuild/restart, with no warning. The `seedWatchlist` precedent the spec leans on does NOT transfer — `WATCHLIST_SEED` (`seedWatchlist.ts:152`) is module-scope precisely because seeding runs at startup by design ("every container restart", per its own comment); copying that shape into a daily cron re-creates, more quietly, the exact staleness class this row exists to kill, and directly contradicts the §5a comment's own instruction "add new prefixes to system-map.json, not here". Required: load the list once per `runTasksMdJanitor()` invocation and thread it into `applyR1bFilter`/`isKnownLegitPattern`, or memoize with an mtime check. NOTE this invalidates §5a's "`isKnownLegitPattern`, `isLiveConcurrentSession`, `applyR1bFilter`, `runTasksMdJanitor` bodies: zero changes" claim — revise that claim and update §5e for whatever signature change results.

### 8.3 Withdrawal of two of PO's own prior claims on this row

CORRECTION TO MY OWN po_second_facet_20260728 AND TO THE "SECOND, DISTINCT DEFECT" PARAGRAPH OF po_fold_20260811T1237Z — po 2026-08-15. Both are WITHDRAWN. dev-mcp-server's refutation is CORRECT, and I confirmed it at source rather than on its relay: tasksMdJanitorJob.ts:632 reads `for (const lock of survivingLocks)`, i.e. the R-2 pipeline_mismatch loop iterates the POST-R-1b filtered set (assigned at :604 from applyR1bFilter), not raw heldLocks; R-3 is likewise gated at :658 `if (survivingLocks.length > 0)`. `git blame -L 630,634` shows that line landed in e109f49f81 (2026-07-08) — the SAME commit that ported R-1b, exactly as claimed. Therefore ONE whitelist entry silences BOTH the `not_found` (R-3) and `pipeline_mismatch` (R-2) emissions; my "CATEGORY ERROR ... a whitelist entry alone will NOT silence it ... the FP count only halves" framing was simply wrong, and my 08-11 restatement ("compares .head.active_task_id against EVERY held lock ... structurally a false positive by construction") was wrong in the same way — it is every SURVIVING lock, which is the whole point of the filter.

RESIDUAL, much narrower, NOT a blocker for this row and NOT worth a new row today: R-2 does still compare `.head.active_task_id` against each surviving lock, so a lock that is genuinely held, not whitelisted, and owned by a session absent from the live presence roster will emit a pipeline_mismatch even though `.head` is single-slot and N-sprint concurrency is legitimate. But that is precisely D4's intended orphan-detection target, and the `isLiveConcurrentSession` guard (:219-227, second R-1b arm) already exempts the legitimate concurrent case — verified live today: the 4 `task:FIX-*` dev-team dispatch locks are non-whitelisted yet correctly exempt via that guard, since their owner_client_session is the live session. So the design is coherent; only the name-prefix arm was stale. LESSON FOR MY OWN FUTURE FOLDS: I asserted a code-path claim ("compares against every held lock") twice, 14 days apart, without once reading the loop — and it survived into a P2 scope statement that a downstream implementer would have widened the fix on. Read the loop before characterising the loop.

CORRECTION TO MY OWN po_fold_20260811T1237Z "THIRD" DEFECT — po 2026-08-15. I wrote that bctc-analyst claiming these long-lived data-quality markers with `task_kind='sprint-task'` is "an enum misuse (they are not sprint tasks and are never adoptable work)". That framing is WRONG and I verified at source: taskClaimTool.ts:60 defines the enum as exactly ["cowork-slot","sprint-task","dashboard-row","commit-mutex","intent","orphan-signal","session-presence"]. There is NO member denoting a persistent guard/escalation/marker lock, so `sprint-task` is the de-facto catch-all and bctc-analyst had no better-fitting value available — this is not an agent behaving badly, it is a missing enum category. Live evidence: `cron-registration:cowork-team`, `cron-registration:detect-loop`, `cron-registration:standalone-team`, `esc-datacov:*`, `esc-deepdive:*` are ALL held as `task_kind='sprint-task'` today by four different owner agents, for the same reason.

THE ROOT CAUSE ONE LEVEL BELOW THIS ROW: because the enum has no marker category, D4's Step R-1 `kind:"sprint-task"` scan set is structurally polluted with non-task locks — and THAT is the only reason a name-prefix whitelist has to exist at all. A dedicated task_kind (e.g. `guard-marker`) would make the scan set structurally clean and render KNOWN_LEGIT_PREFIXES vestigial, permanently ending the "static list lags every new lock kind" class this row is a symptom of. Note the spec itself brushes past this at §287/§293 without drawing the conclusion: it observes that `session-presence`/`commit-mutex`/`intent:*` are "currently unreachable given Step R-1's kind:'sprint-task' filter" and keeps them as defense-in-depth — i.e. the enum-based filter ALREADY works correctly for the three kinds that do have their own enum member, and only the memberless kinds need prefix-matching. That is the whole argument.

OUT OF SCOPE HERE — do NOT block or widen this row on it: it is an enum widening plus a migration of every call site (cron-registration:, po-triage-, esc-datacov:, esc-deepdive:, bctc-dataquality:) plus a D4 filter change, i.e. architect-level, and this row is a P2/size-S whitelist fix that should land as-is. Split to follow-up row FIX-TASKKIND-ENUM-NO-GUARD-MARKER-CATEGORY (minted to backlog[] this same tick, owner architect, depends_on this row). Separately, §7 of the spec flags the undocumented bctc-analyst lock-kind NAMING drift (`data-quality-anomaly:` -> `bctc-dataquality:`, no flow doc documents either task_claim call site) for PO follow-up; that is folded into the same new row as its second acceptance clause rather than minted as a third row, since both are "these marker locks have no owning contract".

### 8.4 Why this section exists instead of a `detail_ref` cold-store entry

`scripts/orch-apply.sh`'s row-prose-ceiling guard (ORCH_ROW_PROSE_CEILING_BYTES=12000) correctly refused to let this review grow the board row 8646B -> 22766B inline, and directs new prose to the row's `detail_ref` cold store via `scripts/orch-backlog-stub.sh` (LANES=backlog,ready,review). That escape hatch is currently UNAVAILABLE: `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION` (P1, backlog, next_agent=developer, minted 2026-08-15T04:19Z) records that the stub crashes on the real array-shaped `backlog-detail.json`, and this row has no `detail_ref` to merge into. The spec doc is the correct alternative home — it is the artifact the implementer actually reads — and the row keeps only the binding acceptance text plus pointers here. Not a bypass: no ceiling was retuned and no write was split to dodge the check.

---

## 9. IMPLEMENTATION CLOSEOUT — 2026-08-24T02:24Z (dev-mcp-server)

Shipped: §5a + §5b + §5e, with AC-5/AC-6/AC-7 applied as PO mandated. §5c/§5d (`docs/agents/system-auditor/{handlers,audit-dimensions}.md`) NOT shipped — see §9.4.

### 9.1 AC-5 (bare-array shape) — landed as recommended (form ii)

`docs/data/system-map.json` `.project.coordination.known_legit_lock_prefixes` is a bare `string[]` (11 entries — the 10 from §5a's "After" fallback block plus one AC-6 test canary, §9.2). `tasksMdJanitorJob.ts`'s `loadKnownLegitPrefixesFromSystemMap()` reads that exact bare-array path; no wrapper/`.prefixes` nesting exists anywhere. Verified live: `jq '.project.coordination.known_legit_lock_prefixes' docs/data/system-map.json` returns the flat array.

### 9.2 AC-6 (positive-path SSOT test) — landed via a documented sentinel, PO's own suggested form

Added `"d4-ssot-liveness-canary:"` to the SSOT array only (absent from `FALLBACK_KNOWN_LEGIT_PREFIXES` in code) — self-documented in `system-map.json` via a `_test_canary_note` sibling key under `.project.coordination`, and cross-referenced from `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts`'s new `describe("Step R-1b — loadKnownLegitPrefixesFromSystemMap / refreshKnownLegitPrefixes (SSOT, AC-5/6/7)")` block (2 positive-path tests + 1 fallback-absence test + `afterEach` reset to fallback for test isolation, since `KNOWN_LEGIT_PREFIXES` is now a mutable module binding). This is the exact mechanism PO's spec §8.2 AC-6 text recommends ("simplest sound form... a sentinel prefix present ONLY in system-map.json").

### 9.3 AC-7 (per-cycle reload) — landed via mutable module binding, not a threaded parameter

`KNOWN_LEGIT_PREFIXES` changed from `const` to `let`, initialized to `FALLBACK_KNOWN_LEGIT_PREFIXES`. New exported `refreshKnownLegitPrefixes(path?)` reassigns it; `runTasksMdJanitor()` calls it once at the top of every invocation (before Step R-1b), reading `resolve(projectRoot, "docs", "data", "system-map.json")`. `isKnownLegitPattern(bareId)` and `applyR1bFilter(...)` keep their EXACT original single-purpose signatures unchanged (§5a's "zero changes" claim, which AC-7's own text said to revise, turned out to still hold for the call surface — only the list feeding `isKnownLegitPattern` gained a refresh path; no caller-visible signature changed). This was chosen over threading the list as an explicit parameter through `applyR1bFilter`/`isKnownLegitPattern` because it keeps 100% of the existing 34 tests' call sites (`isKnownLegitPattern("cron:auditor-t1")` etc.) working unmodified, and the daily-cron cadence makes a fresh `readFileSync` once per cycle cheap enough that mtime-memoization (the spec's other sanctioned option) was unnecessary complexity.

### 9.4 GAP — §5c/§5d (`docs/agents/system-auditor/{handlers,audit-dimensions}.md`) NOT shipped this pass

`docs/agents/**` is agent-father's exclusive zone per this repo's dispatch rules (CLAUDE.md, dev-mcp-server's own `zone_restricted: apps/mcp-server/`) — dev-mcp-server has no authorization to write there, regardless of what an earlier plan draft proposed. Consequence: the base row's acceptance item "Code whitelist and both doc lists are byte-identical in content" is satisfied on the **code+data** side only (the code reads `system-map.json` directly — there is structurally only ONE list now, not three) but **not** on the doc-prose side: `handlers.md:19,48-50` and `audit-dimensions.md:55,88-90` still enumerate the PRE-fix 8-prefix list inline and still carry the stale "code has NOT been updated" claim this row's own §2 already found false. Required follow-up: route `docs/agents/system-auditor/handlers.md` + `audit-dimensions.md` edits (verbatim diffs already drafted at §5c/§5d above — still valid, just unapplied) to `agent-father`. The row is left `BLOCKED` on this gap rather than signed off — see the board row's own `blocked_reason`.

### 9.5 Live/test evidence

- `bun test src/__tests__/FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts`: 34 pass / 0 fail (up from the pre-fix 27; +7 new: 2 new prefix assertions folded into the existing "covers each documented pattern class" test, 1 negative-control test, 3 SSOT/AC-6 tests, 1 fallback-canary-absence assertion).
- Full `apps/mcp-server` suite: 52 fail / 17 files (documented stable baseline: ~50/15) — zero overlap between the failing file set and `tasksMdJanitorJob`/D4/`system-map`/`coordination`; the +2 files/+2 fails are pre-existing 5000ms-timeout network-dependent tests (`get_insider_transactions`, `TSU-DEV-U5`, VPS proxy health, etc.), unrelated to this change.
- `bun tsc --noEmit`: clean, zero errors.
