> Parent: [guide-agent-definition.md](./guide-agent-definition.md)

# Knowledge, Signals & Inter-Agent Communication

---

## Knowledge Loading

```yaml
  knowledge:
    always_load:
      - path: docs/protocols/fail-loud-protocol.md
        fail_loud: true
    lazy_load:
      - path: docs/<bucket>/<file>.md
        trigger: <trigger-name>
        fail_loud: false
```

---

## Signals (Cowork only)

```yaml
  signals:
    consumes: [<signal-type>, ...]
    produces: [<signal-type>, ...]
```

---

## Inter-Agent Communication (Required)

Documents signal bus connections — who triggers this agent and who it triggers.

**Cowork agents (verbose format):**
```yaml
  inter_agent:
    receives_from:
      - agent: cron
        mechanism: scheduled_invocation
        trigger: market_hours_every_15min
      - agent: news-scout
        mechanism: signal_bus
        signal_type: urgent_news
        trigger: breaking_event
    sends_to:
      - agent: alert-commander
        mechanism: signal_bus
        signal_type: price_anomaly
        trigger: threshold_breached
      - agent: user
        mechanism: telegram_market
        trigger: eod_summary
```

**Dev agents (shorthand format):**
```yaml
  inter_agent:
    recv:
      - {from: pm, via: handoff+caveman, on: task_assigned}
    send:
      - {to: qa, via: tasks_md+caveman, on: impl_done}
      - {to: pm, via: caveman, on: blocked}
```

---

## Knowledge Load Failure Protocol (Inline, required)

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars):
1. `send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
```
