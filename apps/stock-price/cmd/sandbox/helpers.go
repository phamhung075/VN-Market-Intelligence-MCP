// Package main — stock-price sandbox scenario runner (helpers).
package main

import "fmt"

// floatPtrEqual compares two *float64 pointers — true if both nil or both non-nil with equal values.
func floatPtrEqual(a, b *float64) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// ptrVal formats a *float64 as string for error messages.
func ptrVal(p *float64) string {
	if p == nil {
		return "nil"
	}
	return fmt.Sprintf("%v", *p)
}
