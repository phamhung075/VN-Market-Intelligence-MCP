package alertpipeline

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// ---------------------------------------------------------------------------
// In-memory mock ports — no real SQLite, no real Telegram API.
// ---------------------------------------------------------------------------

type mockRepo struct {
	recent       []domain.StoredAlert
	duplicate    bool
	stored       []domain.StoredAlert
	getRecentErr error
	dupErr       error
	storeErr     error
}

func (m *mockRepo) GetRecentAlerts(stock string, withinMinutes int) ([]domain.StoredAlert, error) {
	return m.recent, m.getRecentErr
}

func (m *mockRepo) HasDuplicateFingerprint(fingerprint string, withinMinutes int) (bool, error) {
	return m.duplicate, m.dupErr
}

func (m *mockRepo) StoreAlert(alert domain.StoredAlert) (int64, error) {
	if m.storeErr != nil {
		return 0, m.storeErr
	}
	m.stored = append(m.stored, alert)
	return int64(len(m.stored)), nil
}

type mockMute struct {
	muted bool
	err   error
}

func (m *mockMute) IsStockMuted(stock string) (bool, error) { return m.muted, m.err }

type sentMsg struct {
	channel domain.TelegramChannel
	text    string
}

type mockTelegram struct {
	sent []sentMsg
	skip bool
	err  error
}

func (m *mockTelegram) Send(ctx context.Context, channel domain.TelegramChannel, text string) (bool, error) {
	if m.err != nil {
		return false, m.err
	}
	if m.skip {
		return false, nil
	}
	m.sent = append(m.sent, sentMsg{channel: channel, text: text})
	return true, nil
}

// Compile-time assertions that the mocks satisfy the slim module ports.
var (
	_ AlertRepositoryPort = (*mockRepo)(nil)
	_ MutePort            = (*mockMute)(nil)
	_ TelegramPort        = (*mockTelegram)(nil)
)

func baseReq() domain.AlertRequest {
	return domain.AlertRequest{
		Stock:        "VCB",
		Severity:     domain.SeverityHigh,
		Message:      "MACD bullish cross on VCB",
		SignalTypes:  []string{"MACD_CROSS"},
		ActionCode:   "TA",
		SendTelegram: true,
	}
}

var fixedNow = time.Date(2026, 5, 24, 10, 0, 0, 0, time.UTC)

// ---------------------------------------------------------------------------
// AC-5: happy path — classify → fingerprint → no-dedup → no-cooldown → format → route.
// ---------------------------------------------------------------------------

func TestRun_HappyPath_Fires(t *testing.T) {
	repo := &mockRepo{}
	mute := &mockMute{}
	tg := &mockTelegram{}
	p := New(repo, mute, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), baseReq(), fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Fired {
		t.Fatalf("expected Fired=true, got reason=%q", res.Reason)
	}
	if res.Channel != domain.ChannelMarket {
		t.Errorf("channel=%q want=%q (high → market)", res.Channel, domain.ChannelMarket)
	}
	if res.Reason != "alert fired" {
		t.Errorf("reason=%q want=%q", res.Reason, "alert fired")
	}
	if len(tg.sent) != 1 {
		t.Fatalf("expected exactly one telegram send, got %d", len(tg.sent))
	}
	if tg.sent[0].channel != domain.ChannelMarket {
		t.Errorf("telegram channel=%q want=%q", tg.sent[0].channel, domain.ChannelMarket)
	}
	if tg.sent[0].text == "" {
		t.Error("telegram text must be non-empty")
	}
	if len(repo.stored) != 1 {
		t.Errorf("expected fired alert stored once, got %d", len(repo.stored))
	}
	if res.Fingerprint == "" {
		t.Error("fingerprint must be set on a fired alert")
	}
	if res.CooldownSec != 1800 {
		t.Errorf("CooldownSec=%d want=1800 (30min default cfg)", res.CooldownSec)
	}
	if res.AlertID != 1 {
		t.Errorf("AlertID=%d want=1 (first stored row)", res.AlertID)
	}
	if !res.TelegramSent {
		t.Error("expected TelegramSent=true when SendTelegram requested and port succeeds")
	}
}

// ---------------------------------------------------------------------------
// Reconciliation (FACTORY-ALERT-consolidate-dual-engines): Fired is decoupled
// from Telegram delivery — a fired alert is stored regardless of SendTelegram
// or delivery outcome (mirrors api/openapi.yaml: fired = gates passed AND
// recorded; telegram_sent = separately reported).
// ---------------------------------------------------------------------------

func TestRun_SendTelegramFalse_FiresAndStoresWithoutRouting(t *testing.T) {
	repo := &mockRepo{}
	tg := &mockTelegram{}
	req := baseReq()
	req.SendTelegram = false
	p := New(repo, &mockMute{}, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), req, fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Fired {
		t.Fatalf("expected Fired=true even when SendTelegram=false, got reason=%q", res.Reason)
	}
	if len(repo.stored) != 1 {
		t.Errorf("expected fired alert stored once regardless of SendTelegram, got %d", len(repo.stored))
	}
	if len(tg.sent) != 0 {
		t.Errorf("SendTelegram=false must never call TelegramPort.Send, got %d sends", len(tg.sent))
	}
	if res.TelegramSent {
		t.Error("expected TelegramSent=false when routing was never attempted")
	}
}

func TestRun_TelegramSkipped_StillFiresAndStores(t *testing.T) {
	repo := &mockRepo{}
	tg := &mockTelegram{skip: true} // e.g. missing bot token/chat id (AC-13 silent skip)
	req := baseReq()
	p := New(repo, &mockMute{}, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), req, fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Fired {
		t.Fatalf("expected Fired=true even when Telegram delivery is skipped, got reason=%q", res.Reason)
	}
	if len(repo.stored) != 1 {
		t.Errorf("expected fired alert stored once even on Telegram skip, got %d", len(repo.stored))
	}
	if res.TelegramSent {
		t.Error("expected TelegramSent=false when the port reports a skip")
	}
	if res.AlertID != 1 {
		t.Errorf("AlertID=%d want=1", res.AlertID)
	}
}

func TestRun_TelegramError_StillFiresAndStores(t *testing.T) {
	repo := &mockRepo{}
	tg := &mockTelegram{err: fmt.Errorf("network down")}
	req := baseReq()
	p := New(repo, &mockMute{}, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), req, fixedNow)
	if err != nil {
		t.Fatalf("Telegram delivery errors must never fail the evaluation, got: %v", err)
	}
	if !res.Fired {
		t.Fatal("expected Fired=true even when TelegramPort.Send errors")
	}
	if len(repo.stored) != 1 {
		t.Errorf("expected fired alert stored once even on Telegram error, got %d", len(repo.stored))
	}
	if res.TelegramSent {
		t.Error("expected TelegramSent=false when the port errors")
	}
}

// ---------------------------------------------------------------------------
// CooldownSec is a constant per Pipeline instance (the configured window),
// present on every branch — not conditional on the suppression reason.
// ---------------------------------------------------------------------------

func TestRun_CooldownSec_PresentOnEveryBranch(t *testing.T) {
	cases := []struct {
		name string
		repo *mockRepo
		mute *mockMute
		req  func() domain.AlertRequest
	}{
		{"dedup", &mockRepo{duplicate: true}, &mockMute{}, baseReq},
		{"muted", &mockRepo{}, &mockMute{muted: true}, baseReq},
		{"invalid-severity", &mockRepo{}, &mockMute{}, func() domain.AlertRequest {
			r := baseReq()
			r.Severity = "bogus"
			return r
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := New(c.repo, c.mute, &mockTelegram{}, domain.DefaultCooldownConfig)
			res, err := p.Run(context.Background(), c.req(), fixedNow)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res.CooldownSec != 1800 {
				t.Errorf("CooldownSec=%d want=1800 on %s branch", res.CooldownSec, c.name)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Channel routing mirrors signal-classifier exactly: critical/high → market,
// medium/low → work.
// ---------------------------------------------------------------------------

func TestRun_ChannelRouting_MediumSeverityRoutesToWork(t *testing.T) {
	repo := &mockRepo{}
	tg := &mockTelegram{}
	req := baseReq()
	req.Severity = domain.SeverityMedium
	p := New(repo, &mockMute{}, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), req, fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Channel != domain.ChannelWork {
		t.Errorf("channel=%q want=%q (medium → work)", res.Channel, domain.ChannelWork)
	}
	if len(tg.sent) != 1 || tg.sent[0].channel != domain.ChannelWork {
		t.Errorf("expected one send to work channel, got %+v", tg.sent)
	}
}

// ---------------------------------------------------------------------------
// AC-5: dedup hit — fingerprint found → short-circuit, fired=false, no route.
// ---------------------------------------------------------------------------

func TestRun_DedupHit_ShortCircuits(t *testing.T) {
	repo := &mockRepo{duplicate: true}
	mute := &mockMute{}
	tg := &mockTelegram{}
	p := New(repo, mute, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), baseReq(), fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Fired {
		t.Fatal("expected Fired=false on dedup hit")
	}
	if res.Reason != "duplicate: fingerprint seen recently" {
		t.Errorf("reason=%q want dedup reason", res.Reason)
	}
	if len(tg.sent) != 0 {
		t.Errorf("dedup hit must not route, got %d sends", len(tg.sent))
	}
	if len(repo.stored) != 0 {
		t.Errorf("dedup hit must not store, got %d", len(repo.stored))
	}
}

// ---------------------------------------------------------------------------
// AC-5: mute hit — mute=true → short-circuit, fired=false, no route.
// ---------------------------------------------------------------------------

func TestRun_MuteHit_ShortCircuits(t *testing.T) {
	repo := &mockRepo{}
	mute := &mockMute{muted: true}
	tg := &mockTelegram{}
	p := New(repo, mute, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), baseReq(), fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Fired {
		t.Fatal("expected Fired=false on mute hit")
	}
	if res.Reason != "muted: stock is muted" {
		t.Errorf("reason=%q want mute reason", res.Reason)
	}
	if len(tg.sent) != 0 {
		t.Errorf("mute hit must not route, got %d sends", len(tg.sent))
	}
	if len(repo.stored) != 0 {
		t.Errorf("mute hit must not store, got %d", len(repo.stored))
	}
}

// ---------------------------------------------------------------------------
// Edge: cooldown suppression — same stock+signal within 30min → fired=false.
// Mirrors alert-pipeline-edge.json.
// ---------------------------------------------------------------------------

func TestRun_CooldownSuppression(t *testing.T) {
	repo := &mockRepo{
		recent: []domain.StoredAlert{{
			Stocks:      "VCB",
			SignalTypes: "MACD_CROSS",
			TriggeredAt: "2026-05-24T09:45:00Z", // 15min before now → within 30min window
		}},
	}
	p := New(repo, &mockMute{}, &mockTelegram{}, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), baseReq(), fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Fired {
		t.Fatal("expected Fired=false on cooldown suppression")
	}
	if res.Reason != "cooldown: same signal within 30min" {
		t.Errorf("reason=%q want cooldown reason", res.Reason)
	}
}

// ---------------------------------------------------------------------------
// Edge: invalid severity → not fired, no route.
// ---------------------------------------------------------------------------

func TestRun_InvalidSeverity(t *testing.T) {
	req := baseReq()
	req.Severity = "bogus"
	tg := &mockTelegram{}
	p := New(&mockRepo{}, &mockMute{}, tg, domain.DefaultCooldownConfig)

	res, err := p.Run(context.Background(), req, fixedNow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Fired {
		t.Fatal("expected Fired=false on invalid severity")
	}
	if len(tg.sent) != 0 {
		t.Errorf("invalid severity must not route, got %d sends", len(tg.sent))
	}
}
