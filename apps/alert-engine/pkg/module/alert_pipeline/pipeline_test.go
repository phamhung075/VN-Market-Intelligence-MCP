package alertpipeline

import (
	"context"
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
		Stock:       "VCB",
		Severity:    domain.SeverityHigh,
		Message:     "MACD bullish cross on VCB",
		SignalTypes: []string{"MACD_CROSS"},
		ActionCode:  "TA",
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
