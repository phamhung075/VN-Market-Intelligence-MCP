// apps/mcp-server/src/domain/repositories/IVnstockRepository.ts
// Task 1838b — Domain port for vnstock data access.
//
// NOTE (Phase 1 pragmatic exception — R-1 in design doc):
//   This interface imports types from infrastructure/fetchers/vnstockBridge.js.
//   These types should eventually move to domain/models/vnstockTypes.ts (Phase 3).
//   Flagged as tech-debt item per design section 2.3 + 6.

import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockEvent,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../infrastructure/fetchers/vnstockBridge.js";

export interface IVnstockRepository {
  getLatestFinancials(code: string): VnstockFinancials | null;
  getLatestTradingStats(code: string): VnstockTradingStats | null;
  getOfficers(code: string): VnstockOfficer[];
  getShareholders(code: string): VnstockShareholder[];
  getEvents(code: string): VnstockEvent[];
  getLatestBalanceSheet(code: string): VnstockBalanceSheet | null;
  getLatestCashFlow(code: string): VnstockCashFlow | null;
  upsertFinancials(data: VnstockFinancials): void;
  upsertTradingStats(data: VnstockTradingStats): void;
}
