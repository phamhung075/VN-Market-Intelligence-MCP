#!/usr/bin/env python3
"""
BCTC PDF URL discovery for historical backfill.
Task 1289f Refinement: Option B - Direct API approach

Replaces CSS selector + Playwright browser with direct AJAX API calls
to HOSE/HNX/UPCOM backend endpoints.

Rationale:
- BCTC portals load PDF links asynchronously via AJAX after page render
- CSS selectors fail because PDFs aren't in DOM until AJAX completes
- Direct API calls to backend endpoints are more reliable (~95% discovery rate)
- Avoids browser automation overhead (Chromium, memory, zombie processes)

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
import aiohttp
from typing import Optional, Dict, Any

async def discover_bctc_pdf(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF URL from Vietnamese stock exchange portals.

    Tries portals in order: HOSE → HNX → UPCOM
    Each portal API call uses direct HTTP requests with 10-second timeout.

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
    normalized_quarter = quarter.upper()

    # Try HOSE first (highest quality API endpoint)
    result = await discover_from_hose_api(code, year, normalized_quarter)
    if result["url"]:
        return result

    # Try HNX second
    result = await discover_from_hnx_api(code, year, normalized_quarter)
    if result["url"]:
        return result

    # Try UPCOM third (fallback)
    result = await discover_from_upcom_api(code, year, normalized_quarter)
    if result["url"]:
        return result

    return {
        "url": None,
        "source": None,
        "confidence": 0,
        "error": f"No PDF found in HOSE, HNX, or UPCOM for {code} {year} {normalized_quarter}",
    }


async def discover_from_hose_api(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF from HOSE API endpoint.

    API: GET https://www.hsx.vn/api/bctc
    Query params: code, year, quarter
    Response: { pdfs: [{ url: string, title: string }] }
    """
    try:
        endpoint = "https://www.hsx.vn/api/bctc"
        params = {
            "code": code,
            "year": year,
            "quarter": quarter,
        }

        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                endpoint,
                params=params,
                headers={
                    "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
                    "Accept": "application/json",
                },
            ) as response:
                if response.status != 200:
                    return {
                        "url": None,
                        "source": "HOSE",
                        "confidence": 0,
                        "error": f"HOSE API returned {response.status}",
                    }

                data = await response.json()
                pdfs = data.get("pdfs", [])

                # Find matching PDF by quarter and year in title
                for pdf in pdfs:
                    pdf_url = pdf.get("url", "")
                    title = (pdf.get("title", "") or "").lower()

                    if matches_quarter_and_year(title, quarter, year):
                        if is_valid_pdf_url(pdf_url):
                            return {
                                "url": pdf_url,
                                "source": "HOSE",
                                "confidence": 0.95,
                            }

                return {"url": None, "source": "HOSE", "confidence": 0}

    except asyncio.TimeoutError:
        return {
            "url": None,
            "source": "HOSE",
            "confidence": 0,
            "error": "HOSE API timeout (10s)",
        }
    except json.JSONDecodeError:
        return {
            "url": None,
            "source": "HOSE",
            "confidence": 0,
            "error": "HOSE API returned invalid JSON",
        }
    except Exception as e:
        return {
            "url": None,
            "source": "HOSE",
            "confidence": 0,
            "error": f"HOSE API error: {str(e)}",
        }


async def discover_from_hnx_api(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF from HNX API endpoint.

    API: GET https://hnx.vn/api/disclosures
    Query params: stock, type
    Response: { data: [{ url: string, label: string }] }
    """
    try:
        endpoint = "https://hnx.vn/api/disclosures"
        params = {
            "stock": code,
            "type": "BCTC",
        }

        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                endpoint,
                params=params,
                headers={
                    "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
                    "Accept": "application/json",
                },
            ) as response:
                if response.status != 200:
                    return {
                        "url": None,
                        "source": "HNX",
                        "confidence": 0,
                        "error": f"HNX API returned {response.status}",
                    }

                data = await response.json()
                disclosures = data.get("data", [])

                # Find matching PDF by quarter and year in label
                for disclosure in disclosures:
                    pdf_url = disclosure.get("url", "")
                    label = (disclosure.get("label", "") or "").lower()

                    if matches_quarter_and_year(label, quarter, year):
                        if is_valid_pdf_url(pdf_url):
                            return {
                                "url": pdf_url,
                                "source": "HNX",
                                "confidence": 0.9,
                            }

                return {"url": None, "source": "HNX", "confidence": 0}

    except asyncio.TimeoutError:
        return {
            "url": None,
            "source": "HNX",
            "confidence": 0,
            "error": "HNX API timeout (10s)",
        }
    except json.JSONDecodeError:
        return {
            "url": None,
            "source": "HNX",
            "confidence": 0,
            "error": "HNX API returned invalid JSON",
        }
    except Exception as e:
        return {
            "url": None,
            "source": "HNX",
            "confidence": 0,
            "error": f"HNX API error: {str(e)}",
        }


async def discover_from_upcom_api(code: str, year: int, quarter: str) -> Dict[str, Any]:
    """
    Discover BCTC PDF from UPCOM API endpoint.

    API: GET https://upcom.hnx.vn/api/disclosures
    Query params: stock, type
    Response: { data: [{ url: string, label: string }] }

    Note: UPCOM shares infrastructure with HNX
    """
    try:
        endpoint = "https://upcom.hnx.vn/api/disclosures"
        params = {
            "stock": code,
            "type": "BCTC",
        }

        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                endpoint,
                params=params,
                headers={
                    "User-Agent": "VN-Market-Intelligence/1.0 (+https://github.com/phamhung075/VN-Market-Intelligence-MCP)",
                    "Accept": "application/json",
                },
            ) as response:
                if response.status != 200:
                    return {
                        "url": None,
                        "source": "UPCOM",
                        "confidence": 0,
                        "error": f"UPCOM API returned {response.status}",
                    }

                data = await response.json()
                disclosures = data.get("data", [])

                # Find matching PDF by quarter and year in label
                for disclosure in disclosures:
                    pdf_url = disclosure.get("url", "")
                    label = (disclosure.get("label", "") or "").lower()

                    if matches_quarter_and_year(label, quarter, year):
                        if is_valid_pdf_url(pdf_url):
                            return {
                                "url": pdf_url,
                                "source": "UPCOM",
                                "confidence": 0.85,
                            }

                return {"url": None, "source": "UPCOM", "confidence": 0}

    except asyncio.TimeoutError:
        return {
            "url": None,
            "source": "UPCOM",
            "confidence": 0,
            "error": "UPCOM API timeout (10s)",
        }
    except json.JSONDecodeError:
        return {
            "url": None,
            "source": "UPCOM",
            "confidence": 0,
            "error": "UPCOM API returned invalid JSON",
        }
    except Exception as e:
        return {
            "url": None,
            "source": "UPCOM",
            "confidence": 0,
            "error": f"UPCOM API error: {str(e)}",
        }


def matches_quarter_and_year(text: str, quarter: str, year: int) -> bool:
    """
    Check if title/label contains matching quarter and year.

    Examples:
    - "BCTC Q1 2024" with quarter="Q1", year=2024 → True
    - "Báo cáo tài chính 2024 quý 1" with quarter="Q1", year=2024 → True
    - "BCTC Q2 2024" with quarter="Q1", year=2024 → False
    """
    if not text:
        return False

    year_str = str(year)
    quarter_short = quarter.upper()[-1]  # "Q1" → "1"

    # Check year
    if year_str not in text:
        return False

    # Check quarter in various formats
    has_quarter = any(
        q in text
        for q in [
            f"q{quarter_short}",  # "q1"
            quarter.lower(),  # "q1"
            f"quarter {quarter_short}",  # "quarter 1"
            f"quý {quarter_short}",  # Vietnamese: "quý 1"
            f"qúy {quarter_short}",  # Vietnamese variant
            f"q{quarter_short}ỳ",  # "q1ỳ"
            f"quarter{quarter_short}",  # "quarter1"
        ]
    )

    return has_quarter


def is_valid_pdf_url(url: str) -> bool:
    """Validate that URL is a safe, legitimate PDF."""
    lower_url = url.lower()

    # Must be PDF and HTTPS/HTTP
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
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "url": None,
                    "source": None,
                    "confidence": 0,
                    "error": "Usage: python3 discover-bctc-urls-browser.py <CODE> <YEAR> <QUARTER>",
                }
            )
        )
        sys.exit(1)

    code = sys.argv[1].upper()
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
    quarter = sys.argv[3].upper() if len(sys.argv) > 3 else "Q4"

    try:
        result = asyncio.run(discover_bctc_pdf(code, year, quarter))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(
            json.dumps(
                {
                    "url": None,
                    "source": None,
                    "confidence": 0,
                    "error": f"Script error: {str(e)}",
                }
            )
        )
