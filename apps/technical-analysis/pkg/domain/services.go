// Package domain — CalculateTAService orchestrates repo + calculator.
// Stub: body will be filled in P1-B bucket tasks.
package domain

// CalculateTAService is the domain service that wires a repository and calculator.
type CalculateTAService struct {
	repo       PriceHistoryRepository
	calculator TAIndicatorCalculator
}

// NewCalculateTAService constructs a CalculateTAService with the given adapters.
func NewCalculateTAService(repo PriceHistoryRepository, calculator TAIndicatorCalculator) *CalculateTAService {
	return &CalculateTAService{repo: repo, calculator: calculator}
}

// Compute fetches price history and delegates calculation to the calculator port.
// Stub — returns zero value until P1-B tasks implement the primitives.
func (s *CalculateTAService) Compute(symbol string, period int) (*TechnicalIndicators, error) {
	return &TechnicalIndicators{Symbol: symbol}, nil
}
