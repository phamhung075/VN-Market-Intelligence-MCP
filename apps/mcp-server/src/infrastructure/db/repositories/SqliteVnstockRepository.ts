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

  getLatestFinancials(code: string): VnstockFinancials | null {
    try {
      const { getLatestFinancials } = require("../vnstockStore.js");
      return getLatestFinancials(code) ?? null;
    } catch {
      return null;
    }
  }

  getLatestTradingStats(code: string): VnstockTradingStats | null {
    try {
      const { getLatestTradingStats } = require("../vnstockStore.js");
      return getLatestTradingStats(code) ?? null;
    } catch {
      return null;
    }
  }

  getOfficers(code: string): VnstockOfficer[] {
    try {
      const { getOfficers } = require("../vnstockStore.js");
      return getOfficers(code) ?? [];
    } catch {
      return [];
    }
  }

  getShareholders(code: string): VnstockShareholder[] {
    try {
      const { getShareholders } = require("../vnstockStore.js");
      return getShareholders(code) ?? [];
    } catch {
      return [];
    }
  }

  getEvents(code: string): VnstockEvent[] {
    try {
      const { getEvents } = require("../vnstockStore.js");
      return getEvents(code) ?? [];
    } catch {
      return [];
    }
  }

  getLatestBalanceSheet(code: string): VnstockBalanceSheet | null {
    try {
      const { getLatestBalanceSheet } = require("../vnstockStore.js");
      return getLatestBalanceSheet(code) ?? null;
    } catch {
      return null;
    }
  }

  getLatestCashFlow(code: string): VnstockCashFlow | null {
    try {
      const { getLatestCashFlow } = require("../vnstockStore.js");
      return getLatestCashFlow(code) ?? null;
    } catch {
      return null;
    }
  }

  upsertFinancials(data: VnstockFinancials): void {
    try {
      const { upsertFinancials } = require("../vnstockStore.js");
      upsertFinancials(data);
    } catch {
      // best-effort
    }
  }

  upsertTradingStats(data: VnstockTradingStats): void {
    try {
      const { upsertTradingStats } = require("../vnstockStore.js");
      upsertTradingStats(data);
    } catch {
      // best-effort
    }
  }
}
