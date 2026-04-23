#!/usr/bin/env python3
"""
BCTC Portal Investigation Script
Task 1289g: Gather detailed information about portal structure for debugging

This script probes the HOSE/HNX/UPCOM portals and documents:
- Page structure (forms, tables, API calls)
- Available links and selectors
- AJAX/API endpoints used
- PDF link patterns
- Quarter/year matching patterns

Usage:
    python3 investigate-bctc-portal.py HOSE VNM
    python3 investigate-bctc-portal.py HNX BID
"""

import sys
import json
import asyncio
from typing import Dict, Any, List
from playwright.async_api import async_playwright, Browser, Page


async def investigate_hose(code: str) -> Dict[str, Any]:
    """
    Investigate HOSE portal structure and document findings.
    """
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])

        try:
            page = await browser.new_page()

            # Try multiple URL variations
            urls = [
                f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode={code}",
                f"https://www.hsx.vn/Modules/CMS/Web/ArticleList?issuerCode={code}",
                f"https://www.hsx.vn/?issuerCode={code}",
                f"https://www.hsx.vn/cong-bo-thong-tin",
            ]

            findings = {
                "portal": "HOSE",
                "stock_code": code,
                "urls_tested": [],
                "working_url": None,
                "page_title": None,
                "page_url_final": None,
                "total_links": 0,
                "pdf_links_found": 0,
                "pdf_examples": [],
                "form_elements": [],
                "input_fields": [],
                "select_fields": [],
                "buttons": [],
                "api_calls": [],
                "all_links_sample": [],
                "error": None,
            }

            for url in urls:
                print(f"Testing URL: {url}", file=sys.stderr)
                try:
                    response = await page.goto(url, timeout=30000, wait_until="networkidle")
                    status = response.status if response else None

                    findings["urls_tested"].append({
                        "url": url,
                        "status": status,
                        "reached": status == 200,
                    })

                    if status == 200:
                        findings["working_url"] = url
                        findings["page_title"] = await page.title()
                        findings["page_url_final"] = page.url

                        # Wait a bit more for async content
                        await page.wait_for_timeout(2000)

                        # Collect all links
                        all_links = await page.query_selector_all("a")
                        findings["total_links"] = len(all_links)

                        # Check for PDF links
                        pdf_links = await page.query_selector_all('a[href*=".pdf"]')
                        findings["pdf_links_found"] = len(pdf_links)

                        if pdf_links:
                            for i, link in enumerate(pdf_links[:5]):  # First 5 examples
                                href = await link.get_attribute("href")
                                text = await link.text_content()
                                findings["pdf_examples"].append({
                                    "href": href,
                                    "text": text,
                                    "index": i,
                                })

                        # Sample all links (text + href)
                        for i, link in enumerate(all_links[:20]):  # First 20
                            href = await link.get_attribute("href")
                            text = (await link.text_content() or "").strip()[:100]
                            findings["all_links_sample"].append({
                                "index": i,
                                "text": text,
                                "href": href,
                            })

                        # Find forms
                        forms = await page.query_selector_all("form")
                        for form in forms:
                            form_id = await form.get_attribute("id")
                            form_action = await form.get_attribute("action")
                            form_method = await form.get_attribute("method")
                            findings["form_elements"].append({
                                "id": form_id,
                                "action": form_action,
                                "method": form_method,
                            })

                        # Find input fields
                        inputs = await page.query_selector_all("input")
                        for inp in inputs[:10]:  # First 10
                            inp_name = await inp.get_attribute("name")
                            inp_type = await inp.get_attribute("type")
                            inp_id = await inp.get_attribute("id")
                            findings["input_fields"].append({
                                "name": inp_name,
                                "type": inp_type,
                                "id": inp_id,
                            })

                        # Find select fields
                        selects = await page.query_selector_all("select")
                        for sel in selects[:10]:
                            sel_name = await sel.get_attribute("name")
                            sel_id = await sel.get_attribute("id")
                            options = await sel.query_selector_all("option")
                            option_texts = []
                            for opt in options[:10]:
                                opt_text = await opt.text_content()
                                option_texts.append(opt_text)
                            findings["select_fields"].append({
                                "name": sel_name,
                                "id": sel_id,
                                "options": option_texts,
                            })

                        # Check for any console messages or errors
                        page_content = await page.content()
                        if "pdf" in page_content.lower():
                            findings["notes"] = "PDF text found in page HTML"

                        break  # Stop after first successful URL

                except Exception as e:
                    findings["urls_tested"][-1]["error"] = str(e)
                    continue

            return findings

        finally:
            await browser.close()


async def investigate_hnx(code: str) -> Dict[str, Any]:
    """
    Investigate HNX portal structure.
    """
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])

        try:
            page = await browser.new_page()

            urls = [
                f"https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}",
                f"https://hnx.vn/cong-bo-thong-tin/",
                f"https://hnx.vn",
            ]

            findings = {
                "portal": "HNX",
                "stock_code": code,
                "urls_tested": [],
                "working_url": None,
                "page_title": None,
                "total_links": 0,
                "pdf_links_found": 0,
                "pdf_examples": [],
                "form_elements": [],
                "error": None,
            }

            for url in urls:
                print(f"Testing HNX URL: {url}", file=sys.stderr)
                try:
                    response = await page.goto(url, timeout=30000, wait_until="networkidle")
                    status = response.status if response else None

                    findings["urls_tested"].append({
                        "url": url,
                        "status": status,
                    })

                    if status == 200:
                        findings["working_url"] = url
                        findings["page_title"] = await page.title()

                        await page.wait_for_timeout(2000)

                        all_links = await page.query_selector_all("a")
                        findings["total_links"] = len(all_links)

                        pdf_links = await page.query_selector_all('a[href*=".pdf"]')
                        findings["pdf_links_found"] = len(pdf_links)

                        if pdf_links:
                            for link in pdf_links[:5]:
                                href = await link.get_attribute("href")
                                text = await link.text_content()
                                findings["pdf_examples"].append({
                                    "href": href,
                                    "text": text,
                                })

                        break

                except Exception as e:
                    findings["urls_tested"][-1]["error"] = str(e)
                    continue

            return findings

        finally:
            await browser.close()


async def investigate_upcom(code: str) -> Dict[str, Any]:
    """
    Investigate UPCOM portal structure.
    """
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(args=["--no-sandbox"])

        try:
            page = await browser.new_page()

            url = f"https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode={code}"

            findings = {
                "portal": "UPCOM",
                "stock_code": code,
                "url": url,
                "page_title": None,
                "total_links": 0,
                "pdf_links_found": 0,
                "error": None,
            }

            try:
                response = await page.goto(url, timeout=30000, wait_until="networkidle")
                status = response.status if response else None

                if status == 200:
                    findings["page_title"] = await page.title()

                    await page.wait_for_timeout(2000)

                    all_links = await page.query_selector_all("a")
                    findings["total_links"] = len(all_links)

                    pdf_links = await page.query_selector_all('a[href*=".pdf"]')
                    findings["pdf_links_found"] = len(pdf_links)
                else:
                    findings["error"] = f"HTTP {status}"

            except Exception as e:
                findings["error"] = str(e)

            return findings

        finally:
            await browser.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "error": "Usage: python3 investigate-bctc-portal.py <PORTAL> <CODE>",
            "portals": ["HOSE", "HNX", "UPCOM"],
        }))
        sys.exit(1)

    portal = sys.argv[1].upper()
    code = sys.argv[2].upper()

    try:
        if portal == "HOSE":
            result = asyncio.run(investigate_hose(code))
        elif portal == "HNX":
            result = asyncio.run(investigate_hnx(code))
        elif portal == "UPCOM":
            result = asyncio.run(investigate_upcom(code))
        else:
            result = {"error": f"Unknown portal: {portal}"}

        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "portal": portal,
            "code": code,
        }))
