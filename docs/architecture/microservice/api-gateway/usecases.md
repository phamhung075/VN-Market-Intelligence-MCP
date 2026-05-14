# api-gateway — Use Cases

## AggregateHealthUseCase
- **File:** `apps/api-gateway/pkg/application/aggregate.go`
- **Input:** none
- **Output:** `AggregatedHealth`
- Orchestrates `AggregateHealthService.aggregate()`

## ServiceHealthUseCase
- **File:** `apps/api-gateway/pkg/application/aggregate.go`
- **Input:** `serviceName: string`
- **Output:** `ServiceHealthResult | null`
- Looks up service in registry, runs single health check
- Returns `null` if service key not found
