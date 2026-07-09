package main

import (
	"encoding/json"
	"math"
)

// ---------------------------------------------------------------------------
// Moving Average runner — scenario JSON shapes
// ---------------------------------------------------------------------------

// maNullableFloat unmarshals a float that may be null in JSON (for NaN-price case).
type maNullableFloat struct {
	Valid bool
	Val   float64
}

func (n *maNullableFloat) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		n.Valid = false
		n.Val = math.NaN()
		return nil
	}
	var f float64
	if err := json.Unmarshal(data, &f); err != nil {
		return err
	}
	n.Valid = true
	n.Val = f
	return nil
}

type maSingleInput struct {
	Closes  []float64 `json:"closes"`
	Period  int       `json:"period"`
	MAType  string    `json:"maType"`
	MATypes []string  `json:"maTypes"`
}

type maExpectedCase struct {
	Name     string    `json:"name"`
	SMA      []float64 `json:"sma"`
	EMA      []float64 `json:"ema"`
	Length   int       `json:"length"`
	AllRoute bool      `json:"allRoute"`
	Error    *string   `json:"error"`
}

type maExpected struct {
	SMA       []float64        `json:"sma"`
	EMA       []float64        `json:"ema"`
	Length    int              `json:"length"`
	Tolerance float64          `json:"tolerance"`
	Error     *string          `json:"error"`
	Cases     []maExpectedCase `json:"cases"`
}
