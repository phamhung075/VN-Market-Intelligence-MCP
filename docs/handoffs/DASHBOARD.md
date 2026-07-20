# DASHBOARD

## A-20: pdf-extractor event-loop stall
Severity: warn | Date: 2026-07-20
Location: pdf-extractor container | Details: Multi-probe 0/3 passed — all in-container probes HTTP 000 | Impact: PDF extraction pipeline stalled; BCTC extraction blocked; recurring since 2026-07-19 | Root cause: Event-loop stall in pdf-extractor service (under investigation, A-20 recurring)

## A-21: mcp-server restart count increased
Severity: warn | Date: 2026-07-02
Location: mcp-server container | Details: RestartCount=4 (baseline 3) | Impact: Gradual restart pattern may indicate memory/crash issue | Root cause: Unknown (investigate memory/crash logs)
