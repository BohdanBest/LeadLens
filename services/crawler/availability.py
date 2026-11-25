import re
from dataclasses import dataclass
from urllib.parse import urljoin

import httpx

from common.config import settings
from common.ssrf import validate_url_safe
from crawler.robots import DomainRateLimiter, RobotsPolicyCache

MAX_REDIRECTS = 5
AVAILABILITY_TIMEOUT_SECONDS = 15.0
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True)
class AvailabilityResult:
    reachable: bool
    final_url: str
    status_code: int | None
    reason: str | None
    page_title: str | None


async def check_site_availability(
    url: str,
    rate_limiter: DomainRateLimiter,
    robots_cache: RobotsPolicyCache,
    user_agent: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> AvailabilityResult:
    """
    Verify DNS, SSRF safety (up to 5 redirects), robots.txt allowance, and HTTP 200-399 reachability.
    """
    ua = user_agent or settings.crawler_user_agent
    current_url = url

    async with httpx.AsyncClient(timeout=AVAILABILITY_TIMEOUT_SECONDS, transport=transport) as client:
        for _ in range(MAX_REDIRECTS + 1):
            safe, ssrf_reason, _ = validate_url_safe(current_url)
            if not safe:
                return AvailabilityResult(
                    reachable=False,
                    final_url=current_url,
                    status_code=None,
                    reason=ssrf_reason,
                    page_title=None,
                )

            allowed = await robots_cache.is_allowed(current_url, rate_limiter=rate_limiter, client=client)
            if not allowed:
                return AvailabilityResult(
                    reachable=False,
                    final_url=current_url,
                    status_code=None,
                    reason="robots_disallowed",
                    page_title=None,
                )

            domain = (httpx.URL(current_url).host or "").lower()
            await rate_limiter.wait_turn(domain)

            try:
                resp = await client.get(
                    current_url,
                    headers={"User-Agent": ua},
                    follow_redirects=False,
                )
            except httpx.TimeoutException:
                return AvailabilityResult(
                    reachable=False,
                    final_url=current_url,
                    status_code=None,
                    reason="timeout",
                    page_title=None,
                )
            except httpx.HTTPError:
                return AvailabilityResult(
                    reachable=False,
                    final_url=current_url,
                    status_code=None,
                    reason="connection_error",
                    page_title=None,
                )

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("location")
                if not location:
                    return AvailabilityResult(
                        reachable=False,
                        final_url=current_url,
                        status_code=resp.status_code,
                        reason="invalid_redirect",
                        page_title=None,
                    )
                current_url = urljoin(current_url, location)
                continue

            if 200 <= resp.status_code <= 399:
                title_match = _TITLE_RE.search(resp.text[:32768])
                page_title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else None
                return AvailabilityResult(
                    reachable=True,
                    final_url=current_url,
                    status_code=resp.status_code,
                    reason=None,
                    page_title=page_title,
                )

            return AvailabilityResult(
                reachable=False,
                final_url=current_url,
                status_code=resp.status_code,
                reason=f"http_{resp.status_code}",
                page_title=None,
            )

    return AvailabilityResult(
        reachable=False,
        final_url=current_url,
        status_code=None,
        reason="too_many_redirects",
        page_title=None,
    )
