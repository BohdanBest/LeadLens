import asyncio
import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from common.config import settings
from common.ssrf import validate_url_safe


class DomainRateLimiter:
    """Enforces at most `rps` requests per second per domain."""

    def __init__(self, rps: float = 1.0) -> None:
        self._min_interval = 1.0 / max(rps, 0.1)
        self._locks: dict[str, asyncio.Lock] = {}
        self._last_request: dict[str, float] = {}

    async def wait_turn(self, domain: str) -> None:
        lock = self._locks.setdefault(domain, asyncio.Lock())
        async with lock:
            now = time.monotonic()
            last = self._last_request.get(domain)
            if last is not None:
                elapsed = now - last
                if elapsed < self._min_interval:
                    await asyncio.sleep(self._min_interval - elapsed)
            self._last_request[domain] = time.monotonic()


class RobotsPolicyCache:
    """Fetches, parses, and caches robots.txt rules per origin."""

    def __init__(self, user_agent: str | None = None, timeout_seconds: float = 10.0) -> None:
        self._user_agent = user_agent or settings.crawler_user_agent
        self._timeout = timeout_seconds
        self._cache: dict[str, RobotFileParser | None] = {}

    def parse_robots_txt(self, origin: str, content: str) -> RobotFileParser:
        parser = RobotFileParser()
        parser.set_url(f"{origin}/robots.txt")
        parser.parse(content.splitlines())
        self._cache[origin] = parser
        return parser

    async def is_allowed(
        self,
        url: str,
        rate_limiter: DomainRateLimiter | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        domain = (parsed.hostname or "").lower()

        if origin not in self._cache:
            robots_url = f"{origin}/robots.txt"
            safe, _, _ = validate_url_safe(robots_url)
            if not safe:
                self._cache[origin] = None
                return False

            if rate_limiter is not None and domain:
                await rate_limiter.wait_turn(domain)

            try:
                if client is not None:
                    resp = await client.get(
                        robots_url,
                        headers={"User-Agent": self._user_agent},
                        timeout=self._timeout,
                        follow_redirects=False,
                    )
                else:
                    async with httpx.AsyncClient(timeout=self._timeout) as owned:
                        resp = await owned.get(
                            robots_url,
                            headers={"User-Agent": self._user_agent},
                            follow_redirects=False,
                        )
                if resp.status_code == 200:
                    self.parse_robots_txt(origin, resp.text)
                else:
                    # Per RFC 9309, missing/4xx robots.txt allows crawling
                    self._cache[origin] = None
            except httpx.HTTPError:
                self._cache[origin] = None

        parser = self._cache.get(origin)
        if parser is None:
            return True
        return parser.can_fetch(self._user_agent, url)
