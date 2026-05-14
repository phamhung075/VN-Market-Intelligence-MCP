// Package infrastructure — configuration loader.
package infrastructure

import (
	"os"
	"strconv"
)

// ServiceConfig mirrors TS ServiceConfig from infrastructure/config.ts.
type ServiceConfig struct {
	Port             int
	DBPath           string // market.db (readonly reads)
	OwnDBPath        string // alert_engine.db (write target)
	TelegramBotToken string
	TelegramMarketID string
	TelegramWorkID   string
	TelegramBugID    string
}

// LoadConfig reads configuration from environment variables.
// Env var names are identical to TS loadConfig (NFR-5).
func LoadConfig() ServiceConfig {
	port := 5006
	if p := os.Getenv("PORT"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			port = parsed
		}
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/market.db"
	}

	ownDBPath := os.Getenv("ALERT_ENGINE_DB_PATH")
	if ownDBPath == "" {
		ownDBPath = "./data/alert_engine.db"
	}

	return ServiceConfig{
		Port:             port,
		DBPath:           dbPath,
		OwnDBPath:        ownDBPath,
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramMarketID: os.Getenv("TELEGRAM_INFO_MARKET_GROUP_ID"),
		TelegramWorkID:   os.Getenv("TELEGRAM_INFO_WORK_CHANNEL_ID"),
		TelegramBugID:    os.Getenv("TELEGRAM_REPORT_BUG_CHANNEL_ID"),
	}
}
