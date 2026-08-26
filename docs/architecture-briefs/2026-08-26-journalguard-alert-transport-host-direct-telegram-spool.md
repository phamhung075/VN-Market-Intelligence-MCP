# market-db-journal-guard Alert Transport — Host-Direct Telegram + Spool-and-Flush

**Task:** `FIX-JOURNALGUARD-ALERT-TRANSPORT-RUNS-ON-THE-PLANE-IT-MONITORS`
**Author:** architect (session `036ceaf1-bf34-46cd-92e4-8c6b213ff4bb`)
**Written:** 2026-08-26T09:51Z (`date -u`)
**Zone:** `scripts/` cross-service infra (no `apps/<service>` DDD layer involved — this is ops
tooling, same tier as the existing `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` and
`scripts/maybe-deploy-vps.sh`)
**BUILD-STANDARD:** not-applicable (bug-fix/refactor, in-zone, no new primitives beyond one new
shared bash lib that extends an existing 2x-duplicated pattern)
**Status:** design only — no code shipped this cycle. `next_agent: developer`.

---

## 0. Verdict

Confirmed at source, not re-derived: `send_telegram` (both the `call_tool` MCP path and the
`scripts/agents-flow/mcp-call.sh` HTTP bridge) executes `coreSend()` inside the `mcp-server`
container (`apps/mcp-server/src/infrastructure/notifiers/telegram.ts`). Both transports the fleet
has for reaching that tool are **downstream of the exact container this guard exists to monitor**
— `mcp-call.sh` is a different wire protocol (stateless HTTP-SSE vs. the gateway's stateful
protocol) to the **same process**, not an escape from it. There is no "call it a different way"
fix; the fix has to stop calling into `mcp-server` at all for this one alert.

**The fix family the row's own status_note names is already live in this repo, twice** —
`scripts/agents-flow/cowork-guaranteed-slot-firer.sh`'s `_escalate_failure()` and
`scripts/maybe-deploy-vps.sh` both POST directly to `https://api.telegram.org/bot<token>/sendMessage`
from the host, reading `TELEGRAM_BOT_TOKEN` + the channel's chat-id straight out of the repo-root
`.env` (gitignored, but present and host-readable — verified: `.env` has exactly 1
`TELEGRAM_BOT_TOKEN=` line and 3 channel-id lines). Per `always_extend_not_duplicate`: this brief
designs the **third** call site as an extraction into one shared lib, not a third bespoke inline
copy.

**AC-3 disposition (explicit, not silent):** the cowork-dispatcher `preflight-error-fallback.md`
instance is **OUT OF SCOPE** for this row. Reasoning in §4. A new backlog row is minted (§4.3) so
it is not left untracked.

---

## 1. Reuse audit (brownfield, before any new code)

| Existing call site | Mechanism | Reusable as-is? |
|---|---|---|
| `scripts/agents-flow/cowork-guaranteed-slot-firer.sh:151-245` (`_load_env`, `_bug_chat_id`, `_alert_cooldown_ok`, `_escalate_failure`) | direct curl, `.env`-sourced, 6h content+time cooldown, cooldown state file | Logic is right; **not directly callable** — it's inlined as private `_`-prefixed functions in one script, no shared lib exists yet. |
| `scripts/maybe-deploy-vps.sh:9,35-41` | direct curl, `.env`-sourced, no cooldown | Same core POST, no extraction either. |
| `apps/mcp-server/src/infrastructure/notifiers/telegram.ts` (`ENV_VAR_BY_CHANNEL`) | authoritative channel→env-var-name map (`market`→`TELEGRAM_INFO_MARKET_GROUP_ID`, `work`→`TELEGRAM_INFO_WORK_CHANNEL_ID`, `bug`→`TELEGRAM_REPORT_BUG_CHANNEL_ID`) | Source of truth for the *correct* names — the firer's own comment (2026-08-23) already found `docs/data/system-map.json .telegram_channels[]` still carries a drifted `TELEGRAM_BUG_CHAT_ID` alias. Any new resolver must accept the real key first, the drifted alias second (do not "clean up" by dropping it — that would silently re-disable exactly what the firer's fix closed). |

**Decision:** extract a single shared helper, `scripts/lib/telegram-direct-send.sh`, at the same
tier as `scripts/lib/output-contract-invariant.sh` (an existing cross-cutting bash lib sourced by
both `scripts/audits/` and `scripts/agents-flow/` callers — same precedent, same directory).

**Non-goal, flagged not mandated:** refactoring the firer's and `maybe-deploy-vps.sh`'s existing
inline copies onto the new shared lib. Both are currently green, tested (firer: 53 hermetic
assertions) production paths for a P0 escalation mechanism; touching them for a DRY win alone
carries regression risk out of proportion to this row's scope. Recommended as a separate,
low-priority follow-up, not filed as a new row (pure tech-debt tidy-up, no live defect).

---

## 2. Design — new shared lib

**File:** `scripts/lib/telegram-direct-send.sh` (sourced, not executed standalone)

```bash
td_load_env()                    # sources .env additively into the current shell (verbatim
                                  # port of the firer's _load_env — same append-only while-read,
                                  # never clobbers already-exported vars from a stricter caller)

td_resolve_chat_id <channel>      # channel ∈ {market,work,bug}; resolves in this order:
                                  #   1. explicit override env (caller-specific, e.g.
                                  #      JOURNALGUARD_ALERT_CHAT_ID) — mirrors the firer's own
                                  #      FIRER_ALERT_CHAT_ID escape hatch
                                  #   2. the REAL .env key (TELEGRAM_REPORT_BUG_CHANNEL_ID for
                                  #      "bug", etc. — sourced from telegram.ts's
                                  #      ENV_VAR_BY_CHANNEL, the one authoritative map)
                                  #   3. the KNOWN-DRIFTED legacy alias (TELEGRAM_BUG_CHAT_ID) —
                                  #      kept per the firer's own 2026-08-23 finding, never
                                  #      "cleaned up" out of this resolver

td_send <channel> <message>       # td_load_env; resolve token + chat id; if either missing,
                                  # return 2 (BLOCKED) after loud stderr log (never silent);
                                  # curl -s -X POST https://api.telegram.org/bot<token>/sendMessage
                                  #   -d chat_id=<id> -d text=<message>
                                  # curl exit != 0, or a non-empty Telegram error body → return 1
                                  # (SEND-FAILED); success → return 0. NEVER echoes the token,
                                  # even on error (telegram.ts's own "never logged" rule, ported).
```

No cooldown logic in this shared lib itself — cooldown (or not) is a **caller** decision, kept
out of the shared primitive so the journal-guard caller (no cooldown, see §3) and any future
caller that wants one (like the firer, if it migrates later) both compose it on top rather than
fighting a built-in policy.

---

## 3. Design — journal-guard notify script + spool

**File:** `scripts/audits/journal-guard-alert-notify.sh`

```
Usage:
  journal-guard-alert-notify.sh --flush-only          # PASS-tick path: drain spool only
  journal-guard-alert-notify.sh "<verdict line>"       # FAIL/ERROR-tick path: flush then send

Spool file: docs/agent-memory/sessions/journal-guard-alert-spool.ndjson
  (same directory as the firer's own ALERT_STATE_FILE / *.log — established convention for
  cron-scoped host-side state, not a new location class)

Algorithm (both modes run the flush first — this is what makes AC-2 "no verdict line is lost"
true even when the loss and the recovery happen on different ticks):

1. FLUSH: for each NDJSON line in the spool file (oldest first):
     td_send bug "[market-db-journal-guard] (recovered, originally <ts>) <verdict line>"
     success → drop this line from the rewritten spool (temp-file + atomic mv, same idiom as
               the firer's ALERT_STATE_FILE — never edit the spool in place)
     failure → keep the line, stop attempting further flush this invocation (preserves order,
               avoids reordering deliveries; the next tick tries again)
2. If invoked in --flush-only mode: exit 0 (PASS ticks never originate a new alert).
3. Otherwise (a new verdict line was passed):
     td_send bug "[market-db-journal-guard] <verdict line>"
     success → log delivered, exit 0
     failure → append {ts, verdict_line} as one NDJSON line to the spool (create file/dir if
               absent), log "SPOOLED — will retry next tick", exit 1 (non-fatal to the cron
               prompt: this exit code means "not yet delivered", not "script broke")

Bounded growth (flagged risk, see §5): cap the spool at N=200 lines. On append, if the file
would exceed N, drop the OLDEST entries first and prepend one marker line
`{"dropped_older_than": "<ts of oldest kept>"}` — same "don't grow unbounded, don't drop silently"
shape as this repo's existing notebook-linecap-sweep / context-bloat-backstop conventions. A
200-line cap at 4 ticks/hour is >48h of continuous FAIL before anything is dropped — generously
past the 74-minute worst case measured so far.
```

**Credential-missing path:** identical to the firer's `ESCALATION-BLOCKED` — logs loudly (own
stderr / a `journal-guard-alert-notify-error.log` beside the existing `*-error.log` siblings in
`docs/agent-memory/sessions/`), and **still spools the verdict line** (a missing credential today
does not mean it stays missing — once fixed, the next flush recovers everything queued).

---

## 4. Call-site changes (both must be edited together — the registration doc is a verbatim port)

1. `.claude/commands/crons/cron-market-db-journal-guard.md` — replace the
   `call_tool(server="vn-market", tool="send_telegram", ...)` step:
   - exit 0 (PASS): `bash scripts/audits/journal-guard-alert-notify.sh --flush-only`
   - exit 2 / 3 (FAIL/ERROR): `bash scripts/audits/journal-guard-alert-notify.sh "<verdict line>"`
   - the trailing `MCP: https://zenmidi.com/vn-market/mcp` directive becomes dead weight for this
     prompt (nothing in the new path calls it) — harmless to leave, cheap to drop; developer's call.
2. `.claude/skills/cron-standalone-team/register-job-market-db-journal-guard.md` — mirror the
   identical prompt edit (this file states explicitly it is a **verbatim port**; letting it drift
   from (1) reintroduces exactly the "guard shipped but never armed" class one layer up, on the
   registration copy instead of the runtime one).
3. `docs/policies/dev-standards.md` — extend the existing `**CANONICAL: market.db journal-mode
   guards**` block (line ~2026) with the new alert-transport pointer (per Script Persistence:
   every reusable script gets a CANONICAL pointer in its owning doc). Developer's job at land
   time, not done here (architect does not write code or land CANONICAL pointers for
   not-yet-existing scripts).

### 4.1 AC-1 — satisfied by construction
With `mcp-server` stopped, `verify-market-db-journal-mode.sh` still emits its verdict (it only
`docker exec`s the DB container, unrelated to `mcp-server`); the notify script's `td_send` is a
plain `curl` to `api.telegram.org` reading `.env` directly off the host filesystem — zero
dependency on `mcp-server`, the gateway, or the `vn-market` MCP connection. A forced exit-3 tick
(stop `mcp-server`, rerun the cron prompt by hand) delivers a real Telegram message. This is the
same live-verification precedent the original cron's own Notes section already used for the
now-replaced path (`message_id: 4809`) — the developer should re-run that same style of
proof-of-delivery against the new path before calling this done, not just trust the hermetic test.

### 4.2 AC-2 — satisfied by the flush-before-new-send ordering in §3
A verdict line is only ever in one of two states: delivered, or durably spooled (append-only,
atomic rewrite). It is never silently dropped. The PASS-branch `--flush-only` call means a
recovery does not have to wait for the *next* FAIL tick to flush a backlog — the very next
15-minute tick (whatever its own verdict) drains it.

### 4.3 AC-3 — cowork preflight-error-fallback: OUT OF SCOPE, new row minted

This is a **different failure class**, not a second instance of the same fix:
- The journal-guard problem is a **one-way notification** (`send_telegram`) with no state to
  coordinate — a direct HTTP POST is a complete substitute.
- The cowork-dispatcher chain that aborted 4+ consecutive ticks
  (05:15/05:30/05:45/06:00Z, 2026-08-25) depends on `mcp-server` for **state-mutating
  coordination primitives** — `task_claim`/`task_heartbeat` session-presence registration (Step
  0b.1), per-tick leader election (Step 0b.2, `leader-lock.md`), signal drain (Step 0a), slot-claim
  tokens (Step 4.6), and the tick-snapshot write (Step 4.7). None of these have a "call it a
  different way" fix — a raw curl cannot substitute for a distributed claim/heartbeat/dedup
  primitive. Fixing this properly means designing a host-side (file-based or otherwise
  MCP-independent) leader-election-and-drain fallback, or a deliberate policy decision to accept
  an outage-window gap and backfill after `mcp-server` recovers (consistent with this repo's
  already-documented `project_host_suspension_causes_multiday_cron_silence_backlog_flush`
  precedent for a structurally similar total-outage class).
- That redesign touches `work-tick.md`, `leader-lock.md`, `slot-claim.md`, `tick-snapshot.md`,
  and `telemetry.md` — five flow docs, not one alert call site. It does not fit inside this row's
  `size: M` / single-script scope, and PO's own dedup scan on this row explicitly found no
  existing row covering it.

**Action taken (not left to prose alone):** minted `FIX-COWORK-PREFLIGHT-FALLBACK-NO-MCP-INDEPENDENT-PATH`
into `task_board.backlog[]` this cycle (see Terminal Shape below), `next_agent: architect`,
`priority: P1`, referencing this brief and the exact 4-tick evidence window, so the finding has a
scheduled process reading it instead of sitting only in this file.

---

## 5. Risk flags

- **Security:** `TELEGRAM_BOT_TOKEN` must never appear in logs — `td_send` must not run under
  `set -x`, and any error path must print the *reason* (missing var name, curl exit code), never
  the interpolated URL. Ported directly from `telegram.ts`'s own "never logged" rule.
- **No dedup/cooldown on this path (deliberate, not an oversight):** the MCP-side
  `sendTelegramBug`'s `isDuplicateReport()` 4h dedup is itself backed by a `getDb()` call inside
  `mcp-server` — i.e. it was *already* coupled to the same dead plane during a real outage, so
  bypassing it here is not a regression against what actually worked before. Alert volume is
  bounded by the existing cron cadence (≤1 attempt per 15-minute tick), unchanged from today.
- **Spool unbounded growth:** capped at 200 lines (§3) with an explicit drop-marker, matching this
  repo's established bounded-growth idiom rather than introducing a new unbounded file class.
- **Atomicity:** spool rewrite uses temp-file + atomic `mv`, matching `ALERT_STATE_FILE`'s existing
  idiom — safe even though concurrent invocation is not expected (single cron owns this file).
- **DDD / layering:** none applicable — pure ops/bash tier, same as the two existing precedents;
  no production TypeScript service code touched.

---

## 6. Test strategy (developer's job to write, specified here per architect's test-strategy duty)

`scripts/audits/journal-guard-alert-notify.test.sh` — hermetic, mirroring
`cowork-guaranteed-slot-firer.test.sh`'s pattern (fake `CURL_BIN`, fake `.env`, zero real network):
1. Fresh spool, successful send → spool stays empty, exit 0.
2. Fresh spool, failing send (fake curl returns non-200 / non-zero) → one NDJSON line appended,
   exit 1.
3. Pre-populated spool + `--flush-only` + fake curl now succeeding → spool drains to empty, no
   new message originated.
4. Pre-populated spool + a new FAIL verdict + fake curl succeeding for both → both delivered in
   order (flush before new), spool ends empty.
5. Missing `TELEGRAM_BOT_TOKEN` → loud stderr log, verdict line still spooled (not dropped),
   exit 2.
6. 200+ line spool → oldest entries dropped with the marker line, cap holds.

## RETURN
DONE: Technical design complete — host-direct-Telegram + spool-and-flush transport for
market-db-journal-guard, decoupled from mcp-server; AC-3 explicitly dispositioned OUT of scope
with a new tracked backlog row.
ZONE: scripts/ (cross-service infra)
NEXT: developer — implement `scripts/lib/telegram-direct-send.sh` +
`scripts/audits/journal-guard-alert-notify.sh` + test, then mirror-edit both cron prompt files
(§4), then land the `dev-standards.md` CANONICAL pointer (§4 item 3).
HANDOFF: this brief (row has no `docs/handoffs/` file — status_note is the handoff per the
direct-PO-mint convention)
PIPELINE: continue
