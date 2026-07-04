// Package infrastructure — Telegram client implementation.
// Implements domain.TelegramPort via net/http POST to Telegram Bot API.
// AC-13: silent skip when token/chat ID is empty.
package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/vn-market-intelligence/alert-engine/pkg/domain"
)

// TelegramClient implements domain.TelegramPort.
type TelegramClient struct {
	botToken   string
	marketID   string
	workID     string
	bugID      string
	httpClient *http.Client
}

// NewTelegramClient creates a client from config.
func NewTelegramClient(cfg ServiceConfig) *TelegramClient {
	return &TelegramClient{
		botToken:   cfg.TelegramBotToken,
		marketID:   cfg.TelegramMarketID,
		workID:     cfg.TelegramWorkID,
		bugID:      cfg.TelegramBugID,
		httpClient: &http.Client{},
	}
}

// Send posts text to the specified channel.
// Returns false without error when token or chat ID is empty (AC-13).
func (c *TelegramClient) Send(ctx context.Context, channel domain.TelegramChannel, text string) (bool, error) {
	chatID := c.resolveChatID(channel)
	if chatID == "" || c.botToken == "" {
		// Silent skip — dev/test environment or missing config
		return false, nil
	}

	payload := map[string]string{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return false, nil
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", c.botToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return false, nil
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()

	return resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}

func (c *TelegramClient) resolveChatID(channel domain.TelegramChannel) string {
	switch channel {
	case domain.ChannelMarket:
		return c.marketID
	case domain.ChannelWork:
		return c.workID
	case domain.ChannelBug:
		return c.bugID
	default:
		return ""
	}
}
