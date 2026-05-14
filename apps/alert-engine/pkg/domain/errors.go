// Package domain — sentinel error types.
package domain

import "errors"

// ErrAlertEngine is the base sentinel for alert engine errors.
var ErrAlertEngine = errors.New("alert engine error")

// ErrAlertSuppressed is returned when an alert is suppressed by cooldown/mute/dedup.
type ErrAlertSuppressed struct {
	Reason string
}

func (e *ErrAlertSuppressed) Error() string {
	return "alert suppressed: " + e.Reason
}
