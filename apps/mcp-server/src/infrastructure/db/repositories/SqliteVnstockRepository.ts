// apps/mcp-server/src/infrastructure/db/repositories/SqliteVnstockRepository.ts
// Task 1838b — SQLite adapter for IVnstockRepository.
// Delegates to existing vnstockStore functions. No schema changes.

import type { Database } from "bun:sqlite";
import type { IVnstockRepository } from "../../../domain/repositories/IVnstockRepository.js";
import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../../domain/models/vnstockTypes.js";
import type { VnstockEvent } from "../../../domain/models/shared-types.js";

export class SqliteVnstockRepository implements IVnstockRepository {
  // db parameter reserved for future direct-query migration (Phase 2+).
  constructor(private readonly _db: Database) {}

  // Helper: safely call vnstockStore function with fallback
  private _callStore<T>(fnName: string, args: unknown[], defaultValue: T): T {
    try {
      const store = require("../vnstockStore.js");
      const fn = store[fnName];
      if (typeof fn !== "function") throw new Error(`Store function '${fnName}' not found`);
      return fn(...(Array.isArray(args) ? args : [args])) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  getLatestFinancials(code: string): VnstockFinancials | null {
    return this._callStore("getLatestFinancials", [code], null);
  }

  getLatestTradingStats(code: string): VnstockTradingStats | null {
    return this._callStore("getLatestTradingStats", [code], null);
  }

  getOfficers(code: string): VnstockOfficer[] {
    return this._callStore("getOfficers", [code], []);
  }

  getShareholders(code: string): VnstockShareholder[] {
    return this._callStore("getShareholders", [code], []);
  }

  getEvents(code: string): VnstockEvent[] {
    return this._callStore("getEvents", [code], []);
  }

  getLatestBalanceSheet(code: string): VnstockBalanceSheet | null {
    return this._callStore("getLatestBalanceSheet", [code], null);
  }

  getLatestCashFlow(code: string): VnstockCashFlow | null {
    return this._callStore("getLatestCashFlow", [code], null);
  }

  upsertFinancials(data: VnstockFinancials): void {
    this._callStore("upsertFinancials", [data], undefined);
  }

  upsertTradingStats(data: VnstockTradingStats): void {
    this._callStore("upsertTradingStats", [data], undefined);
  }
}
