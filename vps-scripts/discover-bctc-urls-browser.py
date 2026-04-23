#!/usr/bin/env python3
"""
Task 1289f: VPS Python wrapper for browser-based BCTC URL discovery
Uses Playwright/Chromium to render JavaScript portals and extract PDF URLs.
Called by: bctc-historical-downloader.sh
Output: JSON with discovered URLs and metadata
"""

import sys
import json
import asyncio
from typing import Optional
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


async def discover_from_portal(
    code: str,
    year: int,
    quarter: str,
    portal_url: str,
    source: str,
    confidence: float
) -> Optional[dict]:
    """
    Navigate to portal, render with Chromium, extract PDF URLs.
    Returns dict with url, source, confidence or None if not found.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page()

            try:
                await page.goto(portal_url, timeout=30000, wait_until="networkidle")

                # Get all PDF links on page
                pdf_links = await page.locator('a[href*=".pdf"]').all()

                for link in pdf_links:
                    try:
                        href = await link.get_attribute("href")
                        text = await link.text_content()

                        if not href:
                            continue

                        # Check if quarter + year mentioned in link text or nearby
                        text_lower = (text or "").lower()
                        if (quarter.lower() in text_lower or str(year) in text_lower) or \
                           (("bctc" in text_lower or "báo cáo" in text_lower) and str(year) in text):

                            # Resolve relative URLs to absolute
                            if not href.startswith("http"):
                                if source == "HOSE":
                                    href = f"https://www.hsx.vn{href}"
                                elif source in ["HNX", "UPCOM"]:
                                    base = "https://upcom.hnx.vn" if source == "UPCOM" else "https://hnx.vn"
                                    href = f"{base}{href}"

                            return {
                                "url": href,
                                "source": source,
                                "confidence": confidence,
                                "page_title": await page.title()
                            }
                    except Exception as e:
                        continue

                return None
            finally:
                await browser.close()
    except PlaywrightTimeoutError:
        raise Exception(f"{source} portal timeout after 30s")
    except Exception as e:
        raise Exception(f"{source} browser error: {str(e)}")


async def main():
    """Main entry point. Accepts: code year quarter. Returns JSON."""
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Usage: script.py <code> <year> <quarter>"}))
        sys.exit(1)

    code = sys.argv[1].upper()
    try:
        year = int(sys.argv[2])
        quarter = sys.argv[3].upper()
    except (ValueError, IndexError):
        print(json.dumps({"error": "Invalid arguments"}))
        sys.exit(1)

    # Try HOSE
    try:
        hose_url = f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}"
        result = await discover_from_portal(code, year, quarter, hose_url, "HOSE", 0.95)
        if result:
            print(json.dumps({"results": [result], "error": None}))
            return
    except Exception as e:
        pass  # Continue to HNX

    # Try HNX
    try:
        hnx_url = f"https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"
        result = await discover_from_portal(code, year, quarter, hnx_url, "HNX", 0.9)
        if result:
            print(json.dumps({"results": [result], "error": None}))
            return
    except Exception as e:
        pass  # Continue to UPCOM

    # Try UPCOM
    try:
        upcom_url = f"https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"
        result = await discover_from_portal(code, year, quarter, upcom_url, "UPCOM", 0.85)
        if result:
            print(json.dumps({"results": [result], "error": None}))
            return
    except Exception as e:
        pass

    # All failed
    print(json.dumps({"results": [], "error": "No PDF found in any portal"}))


if __name__ == "__main__":
    asyncio.run(main())
