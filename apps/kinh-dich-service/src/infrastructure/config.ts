/**
 * Kinh Dich Service — Infrastructure Config
 */

export interface ServiceConfig {
  port: number;
  dbPath: string;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(Bun.env['PORT'] ?? '5005', 10),
    dbPath: Bun.env['DB_PATH'] ?? './data/market.db',
  };
}
