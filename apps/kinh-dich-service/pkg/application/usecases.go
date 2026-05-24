// Package application contains the application layer DTOs and use cases.
package application

import (
	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// ReadingUseCase orchestrates the reading flow.
type ReadingUseCase struct {
	service *domain.ReadingService
}

// NewReadingUseCase creates a new ReadingUseCase.
func NewReadingUseCase(svc *domain.ReadingService) *ReadingUseCase {
	return &ReadingUseCase{
		service: svc,
	}
}

// Execute performs the reading use case.
// Stub implementation - will be wired to reading_composer module in B-bucket tasks.
func (uc *ReadingUseCase) Execute(req ReadingRequest) (*ReadingResponse, error) {
	// Stub: return a placeholder response
	// Real implementation will call reading_composer.ComposeReading()
	return &ReadingResponse{
		Stock:          req.StockCode,
		Hexagram:       1,
		Name:           "Stub",
		Trend:          "TRUNG TINH",
		Signal:         "GIU",
		Confidence:     0.5,
		ActionNote:     "Stub implementation",
		OverallReading: "Stub implementation - pending B-bucket primitive wiring",
		Timestamp:      "",
	}, nil
}
