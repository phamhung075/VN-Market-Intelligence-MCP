//go:build tools

// Package tools pins build-time and runtime dependencies so go mod tidy retains
// them in go.mod even before the composition root (cmd/server/main.go) exists.
// This file is excluded from normal builds via the "tools" build tag.
// Remove this file once cmd/server/main.go (P1-A2) imports chi and modernc-sqlite directly.
package tools

import (
	_ "github.com/go-chi/chi/v5"
	_ "modernc.org/sqlite"
)
