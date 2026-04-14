/**
 * Task 1188 — RSS Parser: Atom 1.0 entry support
 *
 * Tests for the Atom <entry> support added to parseRssFeed()
 * in src/infrastructure/fetchers/rss.ts.
 *
 * All tests are self-contained — no HTTP traffic, no DB.
 * RSS 2.0 regression is covered by 021-rss-cafef.test.ts (untouched).
 */

import { describe, it, expect } from "bun:test";
import { parseRssFeed } from "../infrastructure/fetchers/rss.js";

// ---------------------------------------------------------------------------
// Atom fixture builder
// ---------------------------------------------------------------------------

interface AtomEntry {
  title: string;
  /** "alternate" = <link rel="alternate" href="...">, "none" = <link href="...">, omitted = no link */
  linkRel?: "alternate" | "none" | "omit";
  href?: string;
  /** <id> text, last-resort URL */
  idText?: string;
  published?: string;
  updated?: string;
  summary?: string;
  content?: string;
}

function buildMockAtomFeed(entries: AtomEntry[]): string {
  const entryXml = entries
    .map((e) => {
      const linkTag =
        e.linkRel === "alternate"
          ? `<link rel="alternate" href="${e.href ?? ""}"/>`
          : e.linkRel === "none"
            ? `<link href="${e.href ?? ""}"/>`
            : ""; // omit link entirely

      const idTag = e.idText != null ? `<id>${e.idText}</id>` : "";
      const publishedTag = e.published != null ? `<published>${e.published}</published>` : "";
      const updatedTag = e.updated != null ? `<updated>${e.updated}</updated>` : "";
      const summaryTag = e.summary != null ? `<summary>${e.summary}</summary>` : "";
      const contentTag = e.content != null ? `<content>${e.content}</content>` : "";

      return `  <entry>
    <title>${e.title}</title>
    ${linkTag}
    ${idTag}
    ${publishedTag}
    ${updatedTag}
    ${summaryTag}
    ${contentTag}
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Google News</title>
${entryXml}
</feed>`;
}

// ---------------------------------------------------------------------------
// Shared fixture data — Vietnamese content mirroring production
// ---------------------------------------------------------------------------

const ATOM_ENTRIES: AtomEntry[] = [
  {
    title: "VN-Index giảm 8 điểm trước áp lực bán ròng của khối ngoại",
    linkRel: "alternate",
    href: "https://news.google.com/articles/vnindex-giam-8-diem",
    idText: "urn:uuid:a1b2c3d4-1111-1111-1111-111111111111",
    published: "2026-04-13T07:30:00Z",
    updated: "2026-04-13T08:00:00Z",
    summary: "VN-Index chịu áp lực từ khối ngoại bán ròng mạnh.",
    content: "Nội dung chi tiết về phiên giảm điểm.",
  },
  {
    title: "HPG hưởng lợi khi đầu tư công được giải ngân sớm trong Q2",
    linkRel: "alternate",
    href: "https://news.google.com/articles/hpg-dau-tu-cong",
    idText: "urn:uuid:b2c3d4e5-2222-2222-2222-222222222222",
    published: "2026-04-13T06:00:00Z",
    updated: "2026-04-13T07:00:00Z",
    summary: "Hòa Phát được hưởng lợi lớn từ giải ngân đầu tư công.",
    content: "Chi tiết về kế hoạch giải ngân.",
  },
  {
    title: "VCB công bố lợi nhuận Q1/2026 tăng 18% so với cùng kỳ",
    linkRel: "alternate",
    href: "https://news.google.com/articles/vcb-q1-2026",
    idText: "urn:uuid:c3d4e5f6-3333-3333-3333-333333333333",
    published: "2026-04-13T05:00:00Z",
    updated: "2026-04-13T06:00:00Z",
    summary: "Vietcombank tăng trưởng lợi nhuận mạnh mẽ.",
    content: "Kết quả kinh doanh quý 1.",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1188 — parseRssFeed: Atom 1.0 <entry> support", () => {
  // Test 1: Basic item count
  it("returns >= 1 item from Atom feed (3 entries, all fields present)", () => {
    const xml = buildMockAtomFeed(ATOM_ENTRIES);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(3);
  });

  // Test 2: All fields non-empty
  it("each item has non-empty title, url, publishedAt, content", () => {
    const xml = buildMockAtomFeed(ATOM_ENTRIES);
    const items = parseRssFeed(xml);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.url.length).toBeGreaterThan(0);
      expect(item.publishedAt.length).toBeGreaterThan(0);
      expect(item.content.length).toBeGreaterThan(0);
    }
  });

  // Test 3: AC-2 — URL from <link rel="alternate" href>
  it("AC-2: extracts URL from <link rel='alternate' href> (Google News shape)", () => {
    const href = "https://news.google.com/articles/test-alternate";
    const xml = buildMockAtomFeed([
      {
        title: "Test article",
        linkRel: "alternate",
        href,
        published: "2026-04-13T07:30:00Z",
        summary: "Test content",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.url).toBe(href);
  });

  // Test 4: AC-3 — URL from <link href> without rel (baodautu.vn shape)
  it("AC-3: extracts URL from <link href> without rel attribute (baodautu.vn shape)", () => {
    const href = "https://baodautu.vn/article-no-rel.html";
    const xml = buildMockAtomFeed([
      {
        title: "BDT article",
        linkRel: "none",
        href,
        published: "2026-04-13T07:30:00Z",
        summary: "Summary from BDT",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.url).toBe(href);
  });

  // Test 5: AC-4 — publishedAt from <published>
  it("AC-4: prefers <published> over <updated> for publishedAt", () => {
    const published = "2026-04-13T07:30:00Z";
    const updated = "2026-04-13T08:00:00Z";
    const xml = buildMockAtomFeed([
      {
        title: "Entry with both dates",
        linkRel: "alternate",
        href: "https://news.google.com/articles/both-dates",
        published,
        updated,
        summary: "Some content",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.publishedAt).toBe(published);
  });

  // Test 6: AC-5 — publishedAt fallback to <updated>
  it("AC-5: falls back to <updated> when <published> is absent", () => {
    const updated = "2026-04-13T08:00:00Z";
    const xml = buildMockAtomFeed([
      {
        title: "Entry with updated only",
        linkRel: "alternate",
        href: "https://news.google.com/articles/updated-only",
        updated,
        summary: "Some content",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.publishedAt).toBe(updated);
  });

  // Test 7: AC-6 — content from <summary>
  it("AC-6: extracts content from <summary> element", () => {
    const summary = "Tóm tắt bài viết về VN-Index";
    const xml = buildMockAtomFeed([
      {
        title: "Entry with summary",
        linkRel: "alternate",
        href: "https://news.google.com/articles/summary-test",
        published: "2026-04-13T07:30:00Z",
        summary,
        content: "This should NOT be used when summary is present",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.content).toBe(summary);
  });

  // Test 8: AC-7 — content fallback to <content>
  it("AC-7: falls back to <content> element when <summary> is absent", () => {
    const contentText = "Nội dung đầy đủ khi không có summary";
    const xml = buildMockAtomFeed([
      {
        title: "Entry with content only",
        linkRel: "alternate",
        href: "https://news.google.com/articles/content-only",
        published: "2026-04-13T07:30:00Z",
        content: contentText,
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.content).toBe(contentText);
  });

  // Test 9: URL fallback to <id>
  it("falls back to <id> text when no <link> element is present", () => {
    const idText = "urn:uuid:fallback-id-123";
    const xml = buildMockAtomFeed([
      {
        title: "Entry with id fallback",
        idText,
        published: "2026-04-13T07:30:00Z",
        summary: "Content here",
      },
    ]);
    const items = parseRssFeed(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.url).toBe(idText);
  });

  // Test 10: Empty Atom feed
  it("returns [] for an Atom feed with no <entry> elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Empty feed</title>
</feed>`;
    const items = parseRssFeed(xml);
    expect(items.length).toBe(0);
  });

  // Test 11: Mixed document — both <item> and <entry>
  it("handles mixed document with both <item> (RSS) and <entry> (Atom) elements", () => {
    const mixedXml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <channel>
    <item>
      <title>RSS item one</title>
      <link>https://cafef.vn/rss-item-1.html</link>
      <pubDate>Mon, 13 Apr 2026 07:00:00 +0700</pubDate>
      <description>RSS description one</description>
    </item>
    <item>
      <title>RSS item two</title>
      <link>https://cafef.vn/rss-item-2.html</link>
      <pubDate>Mon, 13 Apr 2026 08:00:00 +0700</pubDate>
      <description>RSS description two</description>
    </item>
  </channel>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://news.google.com/articles/atom-1"/>
    <published>2026-04-13T09:00:00Z</published>
    <summary>Atom summary one</summary>
  </entry>
</root>`;
    const items = parseRssFeed(mixedXml);
    expect(items.length).toBe(3);
  });
});
