// Package application — EvaluateAlertUseCase adapter.
package application

import (
	"context"
	"strconv"
	"time"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
	alertpipeline "github.com/vn-market-intelligence/alert-engine/pkg/module/alert_pipeline"
)

// EvaluateAlertUseCase is a thin adapter over the tested alert_pipeline module
// (FACTORY-ALERT-consolidate-dual-engines). It owns no evaluation logic of its
// own — mute/dedup/cooldown/classify/store/telegram all live in
// alertpipeline.Pipeline (pkg/module/alert_pipeline), which is the single
// tested source of truth. This type exists only to:
//
//  1. translate the HTTP-facing EvaluateAlertRequest/Response DTOs to/from the
//     domain-level AlertRequest/pipeline.Result shapes callers already depend
//     on (router.go, clients.ts-compatible JSON field names), and
//  2. inject the wall clock (`time.Now()`) at the one composition boundary
//     that is allowed to read it — the pipeline itself stays deterministic.
//
// Previously this type contained a full second inline orchestration
// (mute→dedup→cooldown→store→telegram) that duplicated alertpipeline.Pipeline
// with several behavioral divergences (ordering, store timing, no severity
// validation, inline channel routing). That duplication is retired; see
// docs/architecture/microservice/alert-engine/usecases.md for the
// reconciliation record.
type EvaluateAlertUseCase struct {
	pipeline *alertpipeline.Pipeline
}

// NewEvaluateAlertUseCase creates a new use case adapter over an already-wired
// Pipeline (constructed by the composition root, cmd/server/main.go).
func NewEvaluateAlertUseCase(pipeline *alertpipeline.Pipeline) *EvaluateAlertUseCase {
	return &EvaluateAlertUseCase{pipeline: pipeline}
}

// Execute evaluates an alert request by delegating to Pipeline.Run and mapping
// the result onto EvaluateAlertResponse (the shape callers — router.go,
// clients.ts field names — depend on).
func (uc *EvaluateAlertUseCase) Execute(ctx context.Context, req EvaluateAlertRequest) (EvaluateAlertResponse, error) {
	signalTypes := req.SignalTypes
	if signalTypes == nil {
		signalTypes = []string{}
	}

	domainReq := domain.AlertRequest{
		Stock:        req.Stock,
		Severity:     domain.AlertSeverity(req.Severity),
		Message:      req.Message,
		SignalTypes:  signalTypes,
		ActionCode:   req.ActionCode,
		SendTelegram: req.SendTelegram,
	}

	res, err := uc.pipeline.Run(ctx, domainReq, time.Now())
	if err != nil {
		return EvaluateAlertResponse{}, err
	}

	resp := EvaluateAlertResponse{
		Fired:        res.Fired,
		CooldownSec:  res.CooldownSec,
		Reason:       res.Reason,
		Fingerprint:  res.Fingerprint,
		Code:         req.Stock,
		TelegramSent: res.TelegramSent,
	}
	// alert_id: "Persisted alert row ID (empty string when not fired)" (openapi.yaml).
	if res.Fired {
		resp.AlertID = strconv.FormatInt(res.AlertID, 10)
	}
	return resp, nil
}
