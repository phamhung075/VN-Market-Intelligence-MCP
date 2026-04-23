#!/usr/bin/env python3
"""
BCTC PDF URL discovery for historical backfill.
Handles async JavaScript rendering on VN stock exchange portals.

Usage:
    python3 discover-bctc-urls-browser.py VNM 2025 Q4
Output:
    {"url": "https://...", "source": "HOSE", "confidence": 0.95}
    OR
    {"url": null, "source": null, "confidence": 0, "error": "..."}
"""

import sys
import json
import asyncio
from urllib.parse import urlparse, urljoin
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

async def discover_bctc_pdf(code: str, year: int, quarter: str) -> dict:
    """
    Discover BCTC PDF URL from Vietnamese stock exchange portals.

    Tries portals in order: HOSE → HNX → UPCOM
    Each portal is tried with a 30-second timeout.

    Args:
        code: Stock ticker (e.g., "VNM", "BID", "FPT")
        year: Year (e.g., 2025)
        quarter: Quarter as string (e.g., "Q4", "Q3")

    Returns:
        {
            "url": str or None,           # Full URL to PDF or null
            "source": str or None,        # "HOSE" | "HNX" | "UPCOM" | null
            "confidence": float,          # 0.85–0.95 (quality score)
            "error": str (optional)       # Error message if failed
        }
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )

        # Try HOSE first (highest quality)
        result = await _try_portal(
            browser,
            code,
            year,
            quarter,
            portal="HOSE",
            url_template="https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}",
            confidence=0.95,
        )
        if result["url"]:
            await browser.close()
            return result

        # Try HNX second
        result = await _try_portal(
            browser,
            code,
            year,
            quarter,
            portal="HNX",
            url_template="https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}",
            confidence=0.90,
        )
        if result["url"]:
            await browser.close()
            return result

        # Try UPCOM third (lowest quality but still good)
        result = await _try_portal(
            browser,
            code,
            year,
            quarter,
            portal="UPCOM",
            url_template="https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}",
            confidence=0.85,
        )
        if result["url"]:
            await browser.close()
            return result

        await browser.close()
        return {
            "url": None,
            "source": None,
            "confidence": 0,
            "error": f"No PDF found in HOSE, HNX, or UPCOM for {code} {year} {quarter}",
        }


async def _try_portal(
    browser,
    code: str,
    year: int,
    quarter: str,
    portal: str,
    url_template: str,
    confidence: float,
) -> dict:
    """
    Try to discover PDF from a single portal.

    Uses hybrid waiting strategy:
    1. Navigate to portal with wait_until="networkidle2"
    2. Try to wait for PDFs to appear via JavaScript detection (fast path)
    3. If that times out, wait a fixed 2 seconds (fallback)
    4. Extract all PDF links and filter by year/quarter
    """
    try:
        page = await browser.new_page()
        portal_url = url_template.format(code=code)

        # Step 1: Navigate to portal
        try:
            await page.goto(portal_url, wait_until="networkidle2", timeout=30000)
        except PlaywrightTimeout:
            await page.close()
            return {
                "url": None,
                "source": portal,
                "confidence": 0,
                "error": f"Timeout navigating to {portal} portal",
            }

        # Step 2: Wait for PDFs to appear (hybrid approach)
        # Try JavaScript detection first (usually faster: 500ms–1s)
        try:
            await page.wait_for_function(
                "() => document.querySelectorAll('a[href*=\".pdf\"]').length > 0",
                timeout=3000,  # 3 second max for JS detection
            )
        except PlaywrightTimeout:
            # Fallback: wait fixed 2 seconds (in case portal is slow)
            await page.wait_for_timeout(2000)

        # Step 3: Extract PDF links
        pdf_elements = await page.locator('a[href*=".pdf"]').all()

        for pdf_elem in pdf_elements:
            href = await pdf_elem.get_attribute("href")
            if not href:
                continue

            # Get surrounding text for context matching
            text_content = await pdf_elem.text_content()
            context_str = f"{text_content} {href}".lower()

            # Check if year and quarter are nearby (loose match)
            year_str = str(year)
            quarter_short = quarter.upper()[-1]  # "Q4" → "4"

            has_year = year_str in context_str
            has_quarter = (
                quarter_short in context_str  # "Q4" context
                or f"q{quarter_short}" in context_str  # "q4" context
                or f"quarter {quarter_short}" in context_str
            )

            if has_year and has_quarter:
                # Found a match! Resolve relative URL to absolute
                full_url = _resolve_url(href, portal_url)
                if _is_valid_pdf_url(full_url):
                    await page.close()
                    return {
                        "url": full_url,
                        "source": portal,
                        "confidence": confidence,
                    }

        # No matching PDF found in this portal
        await page.close()
        return {
            "url": None,
            "source": portal,
            "confidence": 0,
        }

    except Exception as e:
        try:
            await page.close()
        except:
            pass
        return {
            "url": None,
            "source": portal,
            "confidence": 0,
            "error": f"{portal} portal error: {str(e)}",
        }


def _resolve_url(path: str, base_url: str) -> str:
    """Resolve relative URL to absolute URL."""
    if not path:
        return ""

    # Already absolute
    if path.startswith("http://") or path.startswith("https://"):
        return path

    # Use urllib's urljoin for proper handling
    return urljoin(base_url, path)


def _is_valid_pdf_url(url: str) -> bool:
    """Validate that URL is a safe, legitimate PDF."""
    lower = url.lower()

    # Must be PDF and HTTPS/HTTP
    if not lower.endswith(".pdf"):
        return False
    if not (lower.startswith("http://") or lower.startswith("https://")):
        return False

    # Block JavaScript/data URIs
    if any(x in lower for x in ["javascript:", "data:", "file://"]):
        return False

    return True


if __name__ == "__main__":
    # Command-line interface
    if len(sys.argv) < 2:
        print(json.dumps({
            "url": None,
            "source": None,
            "confidence": 0,
            "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
        }))
        sys.exit(1)

    code = sys.argv[1].upper()
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    quarter = sys.argv[3].upper() if len(sys.argv) > 3 else "Q4"

    try:
        result = asyncio.run(discover_bctc_pdf(code, year, quarter))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "url": None,
            "source": None,
            "confidence": 0,
            "error": f"Script error: {str(e)}",
        }))
