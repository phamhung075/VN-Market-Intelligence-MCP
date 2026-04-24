/**
 * API Gateway Microservice — Entry Point
 *
 * DDD wiring: Config → Infrastructure → Domain → Application → Interface
 * Port: 4000 (configurable via $PORT)
 */

import { AggregateHealthService } from './domain/services.js';
import { HTTPHealthChecker, StaticServiceRegistry } from './infrastructure/health_checker.js';
import { AggregateHealthUseCase, ServiceHealthUseCase } from './application/usecases.js';
import { createRouter } from './interface/handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);

// Service URLs: configurable via environment (for docker-compose service names)
const serviceUrls: Record<string, string> = {
  mcp:   process.env['MCP_URL']   ?? 'http://mcp-server:3000',
  pdf:   process.env['PDF_URL']   ?? 'http://pdf-extractor:5001',
  rag:   process.env['RAG_URL']   ?? 'http://rag-service:5002',
  ta:    process.env['TA_URL']    ?? 'http://technical-analysis:5003',
  macro: process.env['MACRO_URL'] ?? 'http://macro-indicators:5004',
  stock: process.env['STOCK_URL'] ?? 'http://stock-price:5000',
};

const registry = new StaticServiceRegistry(serviceUrls);
const checker = new HTTPHealthChecker();
const healthService = new AggregateHealthService(checker, registry);

const aggregateUseCase = new AggregateHealthUseCase(healthService);
const serviceHealthUseCase = new ServiceHealthUseCase(registry, checker);

const app = createRouter(aggregateUseCase, serviceHealthUseCase, registry);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`api-gateway running on port ${PORT}`);
