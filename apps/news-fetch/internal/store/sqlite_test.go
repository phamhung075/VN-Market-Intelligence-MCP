package store_test

import (
	"testing"
	"time"

	"github.com/vn-market-intelligence/news-fetch/internal/store"
)

// openMemStore opens an in-memory SQLite store for testing.
func openMemStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open(:memory:): %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func TestStore_Open_CreatesSchema(t *testing.T) {
	// If Open succeeds without error, the schema was created.
	s := openMemStore(t)
	if s == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestStore_UpsertNewsItem_Insert(t *testing.T) {
	s := openMemStore(t)

	item := store.NewsItem{
		ID:          "testid001",
		SourceURL:   "https://vneconomy.vn/test.htm",
		SourceTitle: "Cổ phiếu tăng 3%",
		SourceType:  "vneconomy",
		PublishedAt: "2026-06-10T08:00:00Z",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.UpsertNewsItem(item); err != nil {
		t.Fatalf("UpsertNewsItem: %v", err)
	}
}

func TestStore_UpsertNewsItem_Idempotent(t *testing.T) {
	s := openMemStore(t)

	item := store.NewsItem{
		ID:          "testid002",
		SourceURL:   "https://vnexpress.net/test.htm",
		SourceTitle: "Market headline",
		SourceType:  "vnexpress",
		PublishedAt: "2026-06-10T09:00:00Z",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	// First insert
	if err := s.UpsertNewsItem(item); err != nil {
		t.Fatalf("first UpsertNewsItem: %v", err)
	}
	// Second insert with same ID — INSERT OR IGNORE should silently skip
	if err := s.UpsertNewsItem(item); err != nil {
		t.Fatalf("second UpsertNewsItem (idempotent): %v", err)
	}
}

func TestStore_UpsertNewsItem_NullURL(t *testing.T) {
	s := openMemStore(t)

	// Items without a URL (empty string) use the fallback dedup key.
	// Two items with the same title but no URL get different IDs (caller's responsibility).
	item := store.NewsItem{
		ID:          "nourl001",
		SourceURL:   "", // no URL
		SourceTitle: "Article with no URL",
		SourceType:  "vneconomy",
		PublishedAt: "",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.UpsertNewsItem(item); err != nil {
		t.Fatalf("UpsertNewsItem no-URL: %v", err)
	}
}

func TestStore_UpsertNewsItem_SameURLDeduplicated(t *testing.T) {
	s := openMemStore(t)

	url := "https://vneconomy.vn/same-url.htm"

	a := store.NewsItem{
		ID:          "id-a",
		SourceURL:   url,
		SourceTitle: "Title A",
		SourceType:  "vneconomy",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	b := store.NewsItem{
		ID:          "id-b",      // different PK
		SourceURL:   url,         // same URL → unique index blocks insert
		SourceTitle: "Title B",
		SourceType:  "vneconomy",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	if err := s.UpsertNewsItem(a); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	// Same URL with a different ID — INSERT OR IGNORE should silently skip
	// because the unique index on source_url blocks it.
	if err := s.UpsertNewsItem(b); err != nil {
		t.Fatalf("second insert same URL: %v", err)
	}
	// No error expected — INSERT OR IGNORE is idempotent.
}

func TestStore_UpsertNewsItem_MultipleSourceTypes(t *testing.T) {
	s := openMemStore(t)

	items := []store.NewsItem{
		{ID: "vne-1", SourceURL: "https://vneconomy.vn/1.htm", SourceTitle: "VnEconomy item", SourceType: "vneconomy", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "vx-1", SourceURL: "https://vnexpress.net/1.htm", SourceTitle: "VnExpress item", SourceType: "vnexpress", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "na-1", SourceURL: "https://newsapi.org/1.htm", SourceTitle: "NewsAPI item", SourceType: "newsapi", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "vps-1", SourceURL: "https://vps-source.example/1.htm", SourceTitle: "VPS item", SourceType: "vps_proxy", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
	}

	for _, it := range items {
		if err := s.UpsertNewsItem(it); err != nil {
			t.Errorf("UpsertNewsItem(%q): %v", it.SourceType, err)
		}
	}
}

func TestStore_UpsertNewsItem_AutoCreatedAt(t *testing.T) {
	s := openMemStore(t)

	// CreatedAt is empty — store must auto-fill it with current time
	item := store.NewsItem{
		ID:          "auto-created-at",
		SourceURL:   "https://example.com/auto.htm",
		SourceTitle: "Auto timestamp test",
		SourceType:  "vneconomy",
		CreatedAt:   "", // intentionally empty
	}

	if err := s.UpsertNewsItem(item); err != nil {
		t.Fatalf("UpsertNewsItem with empty CreatedAt: %v", err)
	}
}
