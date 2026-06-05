// Package application contains the application layer DTOs and use cases.
package application

import (
	"errors"

	"github.com/vn-market-intelligence/kinh-dich-service/pkg/domain"
)

// ErrNotImplemented is returned when a use case is not yet wired to real implementation.
var ErrNotImplemented = errors.New("kinh-dich ReadingUseCase not implemented — wire reading_composer.ComposeReading before use")

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
// Returns ErrNotImplemented until wired to reading_composer.ComposeReading().
// This fail-loud behavior prevents silent fabrication of fake readings.
func (uc *ReadingUseCase) Execute(req ReadingRequest) (*ReadingResponse, error) {
	return nil, ErrNotImplemented
}
