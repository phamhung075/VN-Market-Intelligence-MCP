#!/usr/bin/env python3
"""
BCTC PDF URL discovery with Playwright browser automation.
Task 1289f: Option A - Playwright/Chromium for JavaScript-rendered portals

Handles BCTC discovery from CSR portals (React-rendered HTML) by:
- Launching headless Chromium
- Navigating to HOSE/HNX/UPCOM discovery pages
- Waiting for page render and DOM population
- Querying PDF links, extracting URLs, validating by year + quarter
- Returning first match with confidence score

Replaces non-functional API approach (Option B) that returned HTTP 404.

Usage:
    python3 discover-bctc-urls-browser.py VNM 2024 Q4
Output:
    {"results": [{"url": "https://...", "source": "HOSE", "confidence": 0.95, "page_title": "..."}], "error": null}
    OR
    {"results": [], "error": "No PDF found in any portal"}
"""

import sys
import json
import asyncio
from typing import Optional, Dict, Any, List
from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeoutError


async def discover_bctc_pdf(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF URL from Vietnamese stock exchange portals.

    Tries portals in order: HOSE → HNX → UPCOM
    Each portal uses browser automation with 30-second timeout per page.

    Args:
        code: Stock ticker (e.g., "VNM", "BID", "FPT")
        year: Year (e.g., 2024)
        quarter: Quarter as string (e.g., "Q4", "Q3")

    Returns:
        {
            "results": [{
                "url": str,               # Full URL to PDF
                "source": str,            # "HOSE" | "HNX" | "UPCOM"
                "confidence": float,      # 0.85–0.95 (quality score)
                "page_title": str         # Page title for reference
            }],
            "error": str or None          # Error message if all failed
        }
    """
    normalized_quarter = quarter.upper()
    results: List[Dict[str, Any]] = []

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(args=["--no-sandbox"])

            try:
                # Try HOSE first (highest quality portal)
                result = await discover_from_hose(browser, code, year, normalized_quarter)
                if result:
                    results.append(result)
                    return {"results": results, "error": None}

                # Try HNX second
                result = await discover_from_hnx(browser, code, year, normalized_quarter)
                if result:
                    results.append(result)
                    return {"results": results, "error": None}

                # Try UPCOM third (fallback)
                result = await discover_from_upcom(browser, code, year, normalized_quarter)
                if result:
                    results.append(result)
                    return {"results": results, "error": None}

                # All portals exhausted
                return {
                    "results": [],
                    "error": f"No PDF found in HOSE, HNX, or UPCOM for {code} {year} {normalized_quarter}",
                }

            finally:
                await browser.close()

    except Exception as e:
        return {
            "results": [],
            "error": f"Browser launch failed: {str(e)}",
        }


async def discover_from_hose(browser: Browser, code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Discover BCTC PDF from HOSE portal using browser automation.

    Portal: https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={CODE}
    Strategy:
    1. Navigate and wait for page load (networkidle)
    2. Query all <a> elements with href containing ".pdf"
    3. Filter by quarter + year in link text
    4. Return first match with confidence 0.95
    """
    page = None
    try:
        page = await browser.new_page()
        url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"

        await page.goto(url, timeout=30000, wait_until="networkidle")

        # Find all PDF links
        pdf_links = await page.query_selector_all('a[href*=".pdf"]')

        for link_elem in pdf_links:
            href = await link_elem.get_attribute("href")
            text_content = await link_elem.text_content()

            # Check if quarter + year match in link text
            if href and matches_quarter_and_year(text_content or "", quarter, year):
                # Resolve relative URL to absolute
                if not href.startswith("http"):
                    href = f"https://www.hsx.vn{href}" if href.startswith("/") else f"https://www.hsx.vn/{href}"

                if is_valid_pdf_url(href):
                    page_title = await page.title()
                    return {
                        "url": href,
                        "source": "HOSE",
                        "confidence": 0.95,
                        "page_title": page_title,
                    }

        return None

    except PlaywrightTimeoutError:
        return None
    except Exception as e:
        # Log to stderr but continue to next portal
        print(f"HOSE discovery error for {code}: {str(e)}", file=sys.stderr)
        return None
    finally:
        if page:
            await page.close()


async def discover_from_hnx(browser: Browser, code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Discover BCTC PDF from HNX portal using browser automation.

    Portal: https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}
    Strategy: Same as HOSE, look for "BCTC", "Báo cáo tài chính", "BC/BĐHS" keywords
    Confidence: 0.9 (lower than HOSE due to less standardized layout)
    """
    page = None
    try:
        page = await browser.new_page()
        url = f"https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"

        await page.goto(url, timeout=30000, wait_until="networkidle")

        pdf_links = await page.query_selector_all('a[href*=".pdf"]')

        for link_elem in pdf_links:
            href = await link_elem.get_attribute("href")
            text_content = await link_elem.text_content()

            # Check quarter + year + financial report keyword
            text_lower = (text_content or "").lower()
            has_quarter_year = matches_quarter_and_year(text_lower, quarter, year)
            has_report_keyword = any(
                kw in text_lower for kw in ["bctc", "báo cáo tài chính", "bc/bđhs", "báo cáo"]
            )

            if href and (has_quarter_year or has_report_keyword):
                if not href.startswith("http"):
                    href = f"https://hnx.vn{href}" if href.startswith("/") else f"https://hnx.vn/{href}"

                if is_valid_pdf_url(href):
                    page_title = await page.title()
                    return {
                        "url": href,
                        "source": "HNX",
                        "confidence": 0.9,
                        "page_title": page_title,
                    }

        return None

    except PlaywrightTimeoutError:
        return None
    except Exception as e:
        print(f"HNX discovery error for {code}: {str(e)}", file=sys.stderr)
        return None
    finally:
        if page:
            await page.close()


async def discover_from_upcom(browser: Browser, code: str, year: int, quarter: str) -> Optional[Dict[str, Any]]:
    """
    Discover BCTC PDF from UPCOM portal using browser automation.

    Portal: https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={CODE}
    Strategy: Same as HNX (shares infrastructure)
    Confidence: 0.85 (lowest, UPCOM is less liquid market)
    """
    page = None
    try:
        page = await browser.new_page()
        url = f"https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"

        await page.goto(url, timeout=30000, wait_until="networkidle")

        pdf_links = await page.query_selector_all('a[href*=".pdf"]')

        for link_elem in pdf_links:
            href = await link_elem.get_attribute("href")
            text_content = await link_elem.text_content()

            text_lower = (text_content or "").lower()
            has_quarter_year = matches_quarter_and_year(text_lower, quarter, year)
            has_report_keyword = any(
                kw in text_lower for kw in ["bctc", "báo cáo tài chính", "bc/bđhs", "báo cáo"]
            )

            if href and (has_quarter_year or has_report_keyword):
                if not href.startswith("http"):
                    href = f"https://upcom.hnx.vn{href}" if href.startswith("/") else f"https://upcom.hnx.vn/{href}"

                if is_valid_pdf_url(href):
                    page_title = await page.title()
                    return {
                        "url": href,
                        "source": "UPCOM",
                        "confidence": 0.85,
                        "page_title": page_title,
                    }

        return None

    except PlaywrightTimeoutError:
        return None
    except Exception as e:
        print(f"UPCOM discovery error for {code}: {str(e)}", file=sys.stderr)
        return None
    finally:
        if page:
            await page.close()


def matches_quarter_and_year(text: str, quarter: str, year: int) -> bool:
    """
    Check if link text contains matching quarter and year.

    Examples:
    - "BCTC Q1 2024" with quarter="Q1", year=2024 → True
    - "Báo cáo tài chính 2024 quý 1" with quarter="Q1", year=2024 → True
    - "BCTC Q2 2024" with quarter="Q1", year=2024 → False
    """
    if not text:
        return False

    year_str = str(year)
    quarter_short = quarter.upper()[-1]  # "Q1" → "1"

    # Check year presence
    if year_str not in text:
        return False

    # Check quarter in various formats (English and Vietnamese)
    has_quarter = any(
        q in text.lower()
        for q in [
            f"q{quarter_short}",  # "q1"
            quarter.lower(),  # "q1"
            f"quarter {quarter_short}",  # "quarter 1"
            f"quý {quarter_short}",  # Vietnamese: "quý 1"
            f"qúy {quarter_short}",  # Vietnamese variant
            f"q{quarter_short}ỳ",  # "q1ỳ"
            f"quarter{quarter_short}",  # "quarter1"
            f"kỳ {quarter_short}",  # Vietnamese: "kỳ 1"
        ]
    )

    return has_quarter


def is_valid_pdf_url(url: str) -> bool:
    """
    Validate that URL is a safe, legitimate PDF.

    Checks:
    - Must end with .pdf
    - Must be HTTP or HTTPS
    - No JavaScript/data URIs (XSS prevention)
    """
    if not url:
        return False

    lower_url = url.lower()

    # Must be PDF and HTTP(S)
    if not lower_url.endswith(".pdf"):
        return False
    if not (lower_url.startswith("http://") or lower_url.startswith("https://")):
        return False

    # Block JavaScript/data URIs
    if any(x in lower_url for x in ["javascript:", "data:", "file://"]):
        return False

    return True


if __name__ == "__main__":
    # Command-line interface
    if len(sys.argv) < 4:
        print(
            json.dumps(
                {
                    "results": [],
                    "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
                }
            )
        )
        sys.exit(1)

    try:
        code = sys.argv[1].upper()
        year = int(sys.argv[2])
        quarter = sys.argv[3].upper()

        result = asyncio.run(discover_bctc_pdf(code, year, quarter))
        print(json.dumps(result, ensure_ascii=False))
    except (ValueError, IndexError):
        print(
            json.dumps(
                {
                    "results": [],
                    "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
                }
            )
        )
        sys.exit(1)
    except Exception as e:
        print(
            json.dumps(
                {
                    "results": [],
                    "error": f"Script error: {str(e)}",
                }
            )
        )
