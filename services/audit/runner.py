import asyncio
import json
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

from audit.checks.accessibility import evaluate_accessibility_checks
from audit.checks.business import evaluate_business_checks
from audit.checks.contacts import ExtractedContact, extract_public_contacts
from audit.checks.integrity import check_broken_internal_links, collect_internal_links, evaluate_integrity_checks
from audit.checks.mobile import evaluate_mobile_checks
from audit.checks.perf import evaluate_performance_checks, run_lighthouse_mobile
from audit.checks.security import check_tls_days_remaining, evaluate_security_checks
from audit.checks.seo import PageSnapshot, evaluate_seo_checks
from audit.checks.technology import evaluate_technology_checks
from common.config import settings
from common.profile_loader import load_and_validate_profile
from common.schemas import FindingResult
from common.ssrf import validate_url_safe
from common.storage import ArtifactStorage
from crawler.robots import DomainRateLimiter, RobotsPolicyCache

_AXE_PATHS = (
    Path("/usr/local/lib/node_modules/axe-core/axe.min.js"),
    Path("/usr/lib/node_modules/axe-core/axe.min.js"),
)
_INTERNAL_PAGE_HINTS = (
    "contact",
    "контакт",
    "about",
    "про-нас",
    "service",
    "послуг",
    "catalog",
    "каталог",
    "shop",
    "cart",
    "кошик",
    "checkout",
    "оформлен",
    "delivery",
    "доставк",
)


def _find_axe_script() -> str | None:
    for p in _AXE_PATHS:
        if p.exists():
            return p.read_text(encoding="utf-8")
    return None


def _select_internal_pages(base_url: str, html: str, max_pages: int = 5) -> list[str]:
    """Select up to 5 priority internal navigation pages (contacts, services/catalog, cart/checkout)."""
    base_host = (urlparse(base_url).hostname or "").lower()
    soup = BeautifulSoup(html, "lxml")
    prioritized: list[str] = []
    fallback: list[str] = []
    seen: set[str] = {base_url.rstrip("/")}

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        resolved = urljoin(base_url, href).split("#")[0]
        parsed = urlparse(resolved)
        if parsed.scheme.lower() not in ("http", "https") or (parsed.hostname or "").lower() != base_host:
            continue
        norm = resolved.rstrip("/")
        if norm in seen:
            continue
        seen.add(norm)

        haystack = f"{parsed.path.lower()} {a.get_text(' ', strip=True).lower()}"
        if any(hint in haystack for hint in _INTERNAL_PAGE_HINTS):
            prioritized.append(resolved)
        else:
            fallback.append(resolved)

    return (prioritized + fallback)[:max_pages]


async def _check_sitemap_exists(base_url: str, rate_limiter: DomainRateLimiter) -> bool | None:
    parsed = urlparse(base_url)
    sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
    safe, _, _ = validate_url_safe(sitemap_url)
    if not safe:
        return None
    await rate_limiter.wait_turn((parsed.hostname or "").lower())
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
            resp = await client.get(sitemap_url, headers={"User-Agent": settings.crawler_user_agent})
            return resp.status_code == 200 and "<url" in resp.text[:4096].lower() or "sitemap" in resp.text[:4096].lower()
    except httpx.HTTPError:
        return None


async def run_site_audit(
    audit_id: str,
    url: str,
    profile_key: str,
    profile_version: int,
    storage: ArtifactStorage,
    rate_limiter: DomainRateLimiter,
    robots_cache: RobotsPolicyCache,
) -> dict[str, Any]:
    """
    Execute the complete 31-check technical audit within 120s budget,
    uploading desktop & mobile screenshots to MinIO and extracting contacts.
    """
    profile_path = settings.profiles_dir / f"{profile_key}.v{profile_version}.yaml"
    schema_path = settings.profiles_dir / "schema" / "service-profile.schema.json"
    profile = load_and_validate_profile(profile_path, schema_path)
    checks_by_id = {c["id"]: c for c in profile["checks"]}

    safe, ssrf_reason, _ = validate_url_safe(url)
    if not safe:
        return {"status": "failed", "failure_reason": "unreachable", "detail": ssrf_reason}

    desktop_key = f"audits/{audit_id}/desktop.png"
    mobile_key = f"audits/{audit_id}/mobile.png"

    console_errors: list[str] = []
    large_images: list[dict[str, Any]] = []
    total_transfer_bytes = 0
    homepage_headers: dict[str, str] = {}
    final_url = url
    homepage_html = ""
    mobile_metrics: dict[str, Any] | None = None
    axe_results: dict[str, Any] | None = None

    try:
        async with asyncio.timeout(settings.audit_timeout_seconds):
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
                try:
                    # 1. Desktop 1366x768 render
                    d_ctx = await browser.new_context(
                        viewport={"width": 1366, "height": 768},
                        user_agent=settings.crawler_user_agent,
                    )
                    d_page = await d_ctx.new_page()
                    d_page.on("pageerror", lambda err: console_errors.append(str(err)))
                    d_page.on(
                        "console",
                        lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
                    )

                    async def _on_response(resp: Any) -> None:
                        nonlocal total_transfer_bytes
                        try:
                            cl = resp.headers.get("content-length")
                            size = int(cl) if cl and cl.isdigit() else 0
                            total_transfer_bytes += size
                            if resp.request.resource_type == "image" and size > 500 * 1024:
                                large_images.append({"url": resp.url, "kb": round(size / 1024.0, 1)})
                        except Exception:
                            pass

                    d_page.on("response", _on_response)

                    resp = await d_page.goto(url, wait_until="networkidle", timeout=35000)
                    if resp is None or resp.status >= 400:
                        status_code = resp.status if resp else 0
                        reason = "bot_blocked" if status_code in (403, 429) else "unavailable"
                        return {"status": "failed", "failure_reason": reason, "detail": f"HTTP {status_code}"}

                    final_url = d_page.url
                    homepage_headers = dict(resp.headers)
                    homepage_html = await d_page.content()

                    desktop_png = await d_page.screenshot(type="png", full_page=False)
                    storage.upload_bytes(desktop_key, desktop_png, "image/png")

                    # Run axe-core if installed
                    axe_script = _find_axe_script()
                    if axe_script:
                        await d_page.add_script_tag(content=axe_script)
                        axe_results = await d_page.evaluate("async () => await axe.run()")
                    await d_ctx.close()

                    # 2. Mobile 390x844 render & measurements
                    m_ctx = await browser.new_context(
                        viewport={"width": 390, "height": 844},
                        user_agent=settings.crawler_user_agent,
                        has_touch=True,
                        is_mobile=True,
                    )
                    m_page = await m_ctx.new_page()
                    await m_page.goto(final_url, wait_until="domcontentloaded", timeout=25000)
                    mobile_png = await m_page.screenshot(type="png", full_page=False)
                    storage.upload_bytes(mobile_key, mobile_png, "image/png")

                    mobile_metrics = await m_page.evaluate(
                        """() => {
                            const docWidth = document.documentElement.scrollWidth;
                            const winWidth = window.innerWidth;
                            const bodyStyle = window.getComputedStyle(document.body);
                            const fontPx = parseFloat(bodyStyle.fontSize || '16');
                            const targets = Array.from(document.querySelectorAll('a, button, input, select, textarea'));
                            let visibleCount = 0;
                            let smallCount = 0;
                            for (const el of targets) {
                                const r = el.getBoundingClientRect();
                                if (r.width === 0 && r.height === 0) continue;
                                visibleCount++;
                                if (r.width < 24 || r.height < 24) smallCount++;
                            }
                            return {
                                horizontal_overflow_px: Math.max(0, docWidth - winWidth),
                                body_font_size_px: fontPx,
                                small_tap_targets_pct: visibleCount > 0 ? (100.0 * smallCount / visibleCount) : 0
                            };
                        }"""
                    )
                    await m_ctx.close()
                finally:
                    await browser.close()

            # 3. Parallel non-browser checks + Lighthouse mobile + internal pages
            parsed_final = urlparse(final_url)
            cwv_task = run_lighthouse_mobile(final_url, timeout_seconds=40.0)
            sitemap_task = _check_sitemap_exists(final_url, rate_limiter)

            internal_urls = _select_internal_pages(final_url, homepage_html, max_pages=5)
            pages: list[PageSnapshot] = [PageSnapshot(url=final_url, html=homepage_html, headers=homepage_headers, is_homepage=True)]
            contact_pages: list[tuple[str, str]] = [(final_url, homepage_html)]

            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                for int_url in internal_urls:
                    ok_safe, _, _ = validate_url_safe(int_url)
                    if not ok_safe:
                        continue
                    if not await robots_cache.is_allowed(int_url, rate_limiter=rate_limiter, client=client):
                        continue
                    await rate_limiter.wait_turn((urlparse(int_url).hostname or "").lower())
                    try:
                        ir = await client.get(int_url, headers={"User-Agent": settings.crawler_user_agent})
                        if 200 <= ir.status_code < 400:
                            pages.append(PageSnapshot(url=int_url, html=ir.text, headers=dict(ir.headers), status_code=ir.status_code, is_homepage=False))
                            contact_pages.append((int_url, ir.text))
                    except httpx.HTTPError:
                        continue

            all_links = collect_internal_links(final_url, homepage_html, limit=25)
            broken_task = check_broken_internal_links(all_links, rate_limiter=rate_limiter)

            cwv, sitemap_exists, broken_links = await asyncio.gather(cwv_task, sitemap_task, broken_task)
            tls_days = (
                check_tls_days_remaining(parsed_final.hostname or "")
                if parsed_final.scheme.lower() == "https" and parsed_final.hostname
                else None
            )

            findings: list[FindingResult] = []
            findings.extend(evaluate_performance_checks(cwv, total_transfer_bytes, large_images, checks_by_id))
            findings.extend(evaluate_mobile_checks(homepage_html, checks_by_id, mobile_metrics, mobile_key))
            findings.extend(evaluate_seo_checks(pages, sitemap_exists, checks_by_id))
            findings.extend(evaluate_security_checks(final_url, homepage_html, homepage_headers, checks_by_id, tls_days))
            findings.extend(evaluate_accessibility_checks(homepage_html, checks_by_id, axe_results))
            findings.extend(evaluate_technology_checks(homepage_html, checks_by_id))
            findings.extend(evaluate_integrity_checks(broken_links, console_errors, checks_by_id))
            findings.extend(evaluate_business_checks(homepage_html, [p.html for p in pages], checks_by_id))

            contacts: list[ExtractedContact] = extract_public_contacts(contact_pages)

            return {
                "status": "completed",
                "final_url": final_url,
                "screenshots": {"desktop": desktop_key, "mobile": mobile_key},
                "metrics": cwv or {},
                "findings": [f.model_dump(mode="json") for f in findings],
                "contacts": [{"kind": c.kind, "value": c.value, "source_page": c.source_page} for c in contacts],
            }

    except (TimeoutError, PlaywrightTimeoutError):
        return {"status": "failed", "failure_reason": "too_slow", "detail": "Audit exceeded 120s timeout"}
    except Exception as exc:
        return {"status": "failed", "failure_reason": "internal_error", "detail": str(exc)}


async def render_html_to_pdf(html_content: str) -> bytes:
    """Render HTML report markup to compact PDF bytes (<= 5 MB) via Chromium."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page()
            await page.set_content(html_content, wait_until="load")
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "16mm", "right": "14mm", "bottom": "16mm", "left": "14mm"},
            )
            return pdf_bytes
        finally:
            await browser.close()
