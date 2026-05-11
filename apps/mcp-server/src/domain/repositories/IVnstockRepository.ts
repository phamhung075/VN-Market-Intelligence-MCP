// apps/mcp-server/src/domain/repositories/IVnstockRepository.ts
// Task 1838b — Domain port for vnstock data access.
// Task 1871f — DDD fix: types extracted to domain/models/vnstockTypes.ts.

import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../models/vnstockTypes.js";
import type { VnstockEvent } from "../models/shared-types.js";

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
