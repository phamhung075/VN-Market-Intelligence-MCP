/**
 * Kinh Dich Service — Infrastructure Config
 */

export interface ServiceConfig {
  port: number;
  dbPath: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '5005', 10),
    dbPath: process.env['DB_PATH'] ?? './data/market.db',
  };
}
