from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from common.config import settings
from common.schemas import CheckResultStatus, EvidenceItem, FindingResult
from common.ssrf import validate_url_safe
from crawler.robots import DomainRateLimiter

MAX_INTERNAL_LINKS_TO_CHECK = 25


def collect_internal_links(base_url: str, html: str, limit: int = MAX_INTERNAL_LINKS_TO_CHECK) -> list[str]:
    """Collect up to `limit` unique same-domain http(s) internal URLs from HTML."""
    base_parsed = urlparse(base_url)
    base_host = (base_parsed.hostname or "").lower()
    soup = BeautifulSoup(html, "lxml")

    links: list[str] = []
    seen: set[str] = {base_url.rstrip("/")}

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        resolved = urljoin(base_url, href).split("#")[0]
        parsed = urlparse(resolved)
        if parsed.scheme.lower() not in ("http", "https"):
            continue
        if (parsed.hostname or "").lower() != base_host:
            continue
        norm = resolved.rstrip("/")
        if norm in seen:
            continue
        seen.add(norm)
        links.append(resolved)
        if len(links) >= limit:
            break

    return links


async def check_broken_internal_links(
    links: list[str],
    rate_limiter: DomainRateLimiter,
    user_agent: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[tuple[str, int | str]]:
    """
    Check internal links respecting SSRF guard and domain rate-limit (<= 1 req/s).
    Returns list of (url, error_status_or_reason) for broken links.
    """
    ua = user_agent or settings.crawler_user_agent
    broken: list[tuple[str, int | str]] = []

    async with httpx.AsyncClient(timeout=8.0, transport=transport, follow_redirects=False) as client:
        for link in links[:MAX_INTERNAL_LINKS_TO_CHECK]:
            safe, reason, _ = validate_url_safe(link)
            if not safe:
                continue

            domain = (urlparse(link).hostname or "").lower()
            await rate_limiter.wait_turn(domain)

            try:
                resp = await client.head(link, headers={"User-Agent": ua})
                if resp.status_code == 405:
                    await rate_limiter.wait_turn(domain)
                    resp = await client.get(link, headers={"User-Agent": ua})
                if resp.status_code >= 400:
                    broken.append((link, resp.status_code))
            except httpx.HTTPError as exc:
                broken.append((link, type(exc).__name__))

    return broken


def evaluate_integrity_checks(
    broken_links: list[tuple[str, int | str]],
    console_errors: list[str] | None,
    checks_by_id: dict[str, dict[str, Any]],
) -> list[FindingResult]:
    """Evaluate INT-01 (broken internal links) and INT-02 (console JS errors)."""
    findings: list[FindingResult] = []

    # INT-01
    b_cnt = len(broken_links)
    b_fail = int(checks_by_id["INT-01"]["thresholds"].get("fail_count", 5))
    i1_status = (
        CheckResultStatus.FAIL
        if b_cnt > b_fail
        else CheckResultStatus.WARNING
        if b_cnt >= 1
        else CheckResultStatus.PASS
    )
    i1_ev = [EvidenceItem(kind="metric", metric=b_cnt)]
    if broken_links:
        snippet = "\n".join(f"{url} -> {code}" for url, code in broken_links[:5])
        i1_ev.append(EvidenceItem(kind="html_snippet", snippet=snippet))
    findings.append(
        FindingResult(
            check_id="INT-01",
            category=checks_by_id["INT-01"]["category"],
            result=i1_status,
            value=f"{b_cnt} битих посилань" if b_cnt > 0 else "0",
            impact=int(checks_by_id["INT-01"]["impact"]),
            effort=int(checks_by_id["INT-01"]["effort"]),
            service=checks_by_id["INT-01"]["service"],
            evidence=i1_ev,
        )
    )

    # INT-02
    if console_errors is None:
        findings.append(
            FindingResult(
                check_id="INT-02",
                category=checks_by_id["INT-02"]["category"],
                result=CheckResultStatus.UNAVAILABLE,
                value="недоступно",
                impact=int(checks_by_id["INT-02"]["impact"]),
                effort=int(checks_by_id["INT-02"]["effort"]),
                service=checks_by_id["INT-02"]["service"],
                evidence=[],
            )
        )
    else:
        e_cnt = len(console_errors)
        e_fail = int(checks_by_id["INT-02"]["thresholds"].get("fail_count", 3))
        i2_status = (
            CheckResultStatus.FAIL
            if e_cnt > e_fail
            else CheckResultStatus.WARNING
            if e_cnt >= 1
            else CheckResultStatus.PASS
        )
        i2_ev = [EvidenceItem(kind="metric", metric=e_cnt)]
        if console_errors:
            i2_ev.append(EvidenceItem(kind="html_snippet", snippet="\n".join(err[:150] for err in console_errors[:4])))
        findings.append(
            FindingResult(
                check_id="INT-02",
                category=checks_by_id["INT-02"]["category"],
                result=i2_status,
                value=f"{e_cnt} помилок JS" if e_cnt > 0 else "0",
                impact=int(checks_by_id["INT-02"]["impact"]),
                effort=int(checks_by_id["INT-02"]["effort"]),
                service=checks_by_id["INT-02"]["service"],
                evidence=i2_ev,
            )
        )

    return findings
