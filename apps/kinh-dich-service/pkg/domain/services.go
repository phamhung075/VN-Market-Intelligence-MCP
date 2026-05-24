// Package domain contains the business types and ports for the kinh-dich-service.
package domain

// ReadingService is the domain service for computing Kinh Dich readings.
// In the DDD pattern, this service orchestrates domain logic using injected ports.
type ReadingService struct {
	markov MarkovPort
}

// NewReadingService creates a new ReadingService with the given MarkovPort.
func NewReadingService(markov MarkovPort) *ReadingService {
	return &ReadingService{
		markov: markov,
	}
}

// GetMarkov returns the Markov port for use by the application layer.
func (s *ReadingService) GetMarkov() MarkovPort {
	return s.markov
}
