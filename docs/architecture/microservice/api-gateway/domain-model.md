# api-gateway — Domain Model

## Types

### HealthStatus
```typescript
type HealthStatus = 'ok' | 'degraded' | 'down'
```

### ServiceHealthResult
```typescript
interface ServiceHealthResult {
  service: string           // Service key from registry (e.g. 'mcp', 'pdf')
  status: HealthStatus
  latencyMs: number         // Response time in ms (-1 if failed)
  error?: string            // Error message on non-ok
}
```

### AggregatedHealth
```typescript
interface AggregatedHealth {
  status: HealthStatus                    // Overall system health
  services: Record<string, HealthStatus>  // Per-service status map
  latencies: Record<string, number>       // Per-service latency map
  checkedAt: string                       // ISO timestamp
}
```

### ServiceConfig
```typescript
interface ServiceConfig {
  name: string       // Service key
  baseUrl: string    // e.g. "http://mcp-server:3000"
  healthPath: string // Always "/health"
  timeoutMs: number  // Always 2000ms
}
```

## Repository Ports

### HealthCheckPort
```typescript
interface HealthCheckPort {
  checkHealth(service: ServiceConfig): Promise<ServiceHealthResult>
}
```

### ServiceRegistryPort
```typescript
interface ServiceRegistryPort {
  getAllServices(): ServiceConfig[]
  getService(name: string): ServiceConfig | undefined
}
```

## Domain Service

### AggregateHealthService
- **File:** `apps/api-gateway/src/domain/services.ts`
- Constructor: `(checker: HealthCheckPort, registry: ServiceRegistryPort)`
- Method: `aggregate(): Promise<AggregatedHealth>`

**Logic:**
1. Fans out health checks to all configured downstream services via `Promise.allSettled()`
2. Maps failed checks to `status: 'down'`, `latencyMs: -1`
3. Overall status:
   - All ok → `'ok'`
   - All down → `'down'`
   - Mixed → `'degraded'`
4. Returns `AggregatedHealth` with ISO timestamp
