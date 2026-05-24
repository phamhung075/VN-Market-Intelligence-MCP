<!-- size-justification: 55L — telemetry scaffolding extracted from chef.md (S1 split); ENTRY/CLOSE/FAILED/SILENT/RETURN block specs + try/catch boundary declarations are operationally dense and non-reducible -->
> Parent: [./chef.md](./chef.md)

# Unified Agent — Chef Telemetry Spec

Defines all telemetry events emitted during a chef cycle. Referenced from chef.md at ENTRY, CLOSE, FAILED, and SILENT paths.

---

## ENTRY Telemetry

Immediately after Bootstrap, before any GATHER reads:

1. Construct `cycle_id = chef-{$DISH_TYPE}-{YYYYMMDDTHHmmZ}` from `$DISH_TYPE` and slot fire time (not wall-clock). Example: `chef-morning-20260519T0523Z`.
2. Emit:
   ```
   send_telegram(channel="work", message="[chef] START {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id}")
   ```
3. Store `cycle_id` and `slot_utc` in session state — reused verbatim in CLOSE and FAILED messages.

---

## Try/Catch Boundary

> **try block begins at ENTRY Telemetry — wraps Steps 0 through 7 inclusive.**
> Any unhandled exception exits the try block: emit FAILED (see below), then EXIT non-zero. No MARKET dish. No Step 8.
>
> **Failure modes that must produce FAILED telemetry (not silent exit):**
> - `tool-error` — MCP tool raised an exception after 1 retry
> - `signal-read-fail` — docs/signals/ unreadable or empty when signals expected
> - `self-abort-no-exception` — agent chose to stop mid-flow without an exception (e.g. English self-refusal prose). Emit `FAILED` with `reason="self-abort-no-exception"`. This is a PO-defined violation; it must be observable on WORK channel.

> **try block ends at end of Step 7 (WRITE DISH / send_telegram market).** Step 8 runs outside the try block — its errors fall through to cowork-boundary default rule (1 retry → BUG Telegram → EXIT).

---

## SILENT Telemetry (intraday, 0 clusters)

```
send_telegram(channel="work", message="[chef] SILENT intraday | slot={slot_utc} | cycle={cycle_id} | clusters=0")
```

`slot_utc` and `cycle_id` are from ENTRY session state. The try block ends here for the silent path — EXIT after this send.

---

## CLOSE Telemetry (success)

After notebook append in Step 8, emit:

```
send_telegram(channel="work", message="[chef] SENT {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id} | clusters={N} | convergence={true|false}")
```

Fields:
- `cycle_id` and `slot_utc` — from ENTRY session state (verbatim, no reconstruction)
- `N` — count of clusters that qualified in Step 1
- `convergence` — `true` if ≥1 cluster qualified in Step 1, `false` if 0 clusters (Morning/EOD/Evening publish with 0 clusters is still a SENT, not SILENT)

---

## FAILED Telemetry

Catch block (handles any unhandled exception from Steps 0–7):

1. ```
   send_telegram(channel="work", message="[chef] FAILED {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id} | reason={failure_reason}")
   ```
   `failure_reason` = exception message or tool name that raised, one line, no newlines.
2. ```
   send_telegram(channel="bug", message="[chef] {failure_reason}")
   ```
   Per cowork-boundary on_error rule.
3. EXIT non-zero. No partial MARKET dish. Do NOT proceed to Step 8.
