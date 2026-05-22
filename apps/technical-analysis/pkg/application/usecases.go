// Package application — use-case orchestrators (application layer).
// Stub: Execute returns zero-value response until P1-B tasks are complete.
package application

import "context"

// taComputer is the minimal domain-service interface the use case depends on.
type taComputer interface {
	Compute(symbol string, period int) (interface{ GetSymbol() string }, error)
}

// ComputeTAUseCase orchestrates the domain service for a single HTTP request.
type ComputeTAUseCase struct {
	service interface {
		Compute(symbol string, period int) (interface{}, error)
	}
}

// NewComputeTAUseCase constructs the use case with the given domain service.
// The service parameter is typed as interface{} to avoid an import cycle at stub stage.
func NewComputeTAUseCase(service interface{}) *ComputeTAUseCase {
	return &ComputeTAUseCase{}
}

// Execute processes a ComputeTARequest and returns a ComputeTAResponse.
// Stub — returns zero-value response with no error until P1-B tasks are complete.
func (uc *ComputeTAUseCase) Execute(_ context.Context, req ComputeTARequest) (ComputeTAResponse, error) {
	return ComputeTAResponse{Symbol: req.Symbol}, nil
}
