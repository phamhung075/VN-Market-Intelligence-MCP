# Archive — Sprints c141–c147 (2026-05-16 → 2026-05-17)

## SPIKE_1922 + SPRINT-1922 (c140–c141)
Empty-tables audit + sweep. 59 tables populated. 1922a-j all shipped. Commits: f5443212, 8f55c978, b50ef177, 12b8417b, 2c6e916f, c3f17a65, aceba3a5, 7f300f9e, 5dddcc03, a04fce54.

| Task | Title | Done |
|------|-------|------|
| 1922a | insider-transactions VPS proxy routing fix | 2026-05-16 |
| 1922b | vn-index-cache orphan retired | 2026-05-16 |
| 1922c | credit-data orphan retired | 2026-05-16 |
| 1922d | reputation-scores-writer daily cron | 2026-05-16 |
| 1922e | mention-velocity wired into pollNews | 2026-05-16 |
| 1922f | bond-maturity cron verify (NVL row confirmed) | 2026-05-17 |
| 1922h | imf-indicators Chrome UA fix | 2026-05-16 |
| 1922j | macro-indicators FRED startup backfill | 2026-05-16 |
| 1922-muasamcong | VPS proxy route deployed | 2026-05-16 |
| 1922-public-contracts | publicContractsJob weekly cron | 2026-05-16 |
| 1922-vnstock-events | 3-bug fix, 1,247 events ingested | 2026-05-16 |

## 1923a (c143)
Investment clock case-mismatch fix (Vietnam → vietnam). get_investment_clock_phase returns RECOVERY. Commit implicit.

## 1923-mw-gateway (c142)
Transient Docker downtime self-healed. RESOLVED.

## 1909c (c142)
DIG Q4-2025 BCTC reparse. confidence=68.75% ✓. DONE.

## 1924a/b/c/d (c144–c145)
Live VN CPI wired + parsePmiFromText() + getMacroExternal() + DB patch cpi=5.46. All GREEN.

## 1925a (c145)
LanceDB rag_entries.lance corrupt (lance-file-4.0.0). Fixed via db.drop_table() in container. 20,631 rows dropped. **NOTE: TNB c64 reports LanceDB 'LENC' magic error recurrence post-1925a — task 1930c created.**

## 1926a (c146)
verdictResolutionJob retry storm fix (26 reports). fetchHistory/fetchPrice null → false_positive. **NOTE: TNB c64 reports same 3 tickers (WATCHLIST-31/MACRO_GOLD/VNH) still re-firing after fix — task 1930a created.**

## 1927a (c147)
PMI fix: Bun.serve idleTimeout 120 + parsePmiFromText(). Commit 8d4716b7. Docker rebuild pending (blocked by 1928a).
