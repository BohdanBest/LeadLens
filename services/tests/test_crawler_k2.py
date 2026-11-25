import asyncio
import sys
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from common.ssrf import validate_url_safe  # noqa: E402
from crawler.availability import check_site_availability  # noqa: E402
from crawler.discovery import (  # noqa: E402
    CsvImportSource,
    OpenStreetMapOverpassSource,
    is_excluded_domain,
    matches_exclusion_keywords,
    normalize_domain,
)
from crawler.robots import DomainRateLimiter, RobotsPolicyCache  # noqa: E402


def test_ssrf_blocks_localhost_private_and_link_local() -> None:
    safe, reason, _ = validate_url_safe("http://localhost:5000/api")
    assert not safe
    assert reason == "ssrf_blocked_hostname"

    safe, reason, _ = validate_url_safe("http://127.0.0.1/admin")
    assert not safe
    assert reason == "ssrf_blocked_ip"

    safe, reason, _ = validate_url_safe("http://169.254.169.254/latest/meta-data")
    assert not safe
    assert reason == "ssrf_blocked_ip"

    safe, reason, _ = validate_url_safe("http://[::1]/")
    assert not safe
    assert reason == "ssrf_blocked_ip"

    # DNS rebinding / hostname resolving to private IP
    safe, reason, _ = validate_url_safe("https://internal.example.com", resolver=lambda _: ["10.0.0.5"])
    assert not safe
    assert reason == "ssrf_blocked_ip"

    # Valid public IP resolution
    safe, reason, ips = validate_url_safe("https://example.com", resolver=lambda _: ["93.184.216.34"])
    assert safe
    assert reason is None
    assert ips == ["93.184.216.34"]


def test_domain_normalization_and_exclusions() -> None:
    assert normalize_domain("https://www.Example.COM/contacts?utm=1") == "example.com"
    assert normalize_domain("shop.test.ua") == "shop.test.ua"
    assert normalize_domain("not-a-domain") is None

    assert is_excluded_domain("instagram.com")
    assert is_excluded_domain("mybiz.tilda.ws")
    assert is_excluded_domain("prom.ua")
    assert not is_excluded_domain("stomatologiya.kyiv.ua")

    assert matches_exclusion_keywords(["вакансії", "франшиза"], "https://example.com", "Робота і вакансії") == "вакансії"
    assert matches_exclusion_keywords(["казино"], "Стоматологія Київ") is None


def test_csv_import_validation() -> None:
    csv_ok = "name,url\nClinic A,https://clinica.ua\nStudio B,studiob.com.ua\n"
    candidates = asyncio.run(CsvImportSource(csv_ok).discover(limit=50))
    assert len(candidates) == 2
    assert candidates[0].domain == "clinica.ua"
    assert candidates[0].business_name == "Clinic A"
    assert candidates[1].domain == "studiob.com.ua"

    bad_csv = "website,title\nhttps://a.com,A\n"
    with pytest.raises(ValueError, match="url"):
        asyncio.run(CsvImportSource(bad_csv).discover(limit=10))

    too_many_rows = "url\n" + "\n".join(f"https://site{i}.com" for i in range(501))
    with pytest.raises(ValueError, match="500"):
        asyncio.run(CsvImportSource(too_many_rows).discover(limit=500))


def test_robots_txt_and_availability_redirects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "common.ssrf.default_dns_resolver",
        lambda host: ["93.184.216.34"] if "public-example" in host else ["127.0.0.1"],
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private/\n")
        if request.url.path == "/redir":
            return httpx.Response(302, headers={"Location": "http://127.0.0.1/secret"})
        if request.url.path == "/ok":
            return httpx.Response(200, text="<html><head><title>Public Studio</title></head></html>")
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    limiter = DomainRateLimiter(rps=100.0)
    robots = RobotsPolicyCache()

    # Allowed URL
    res_ok = asyncio.run(
        check_site_availability("https://public-example.com/ok", limiter, robots, transport=transport)
    )
    assert res_ok.reachable
    assert res_ok.status_code == 200
    assert res_ok.page_title == "Public Studio"

    # Disallowed by robots.txt
    res_disallowed = asyncio.run(
        check_site_availability("https://public-example.com/private/panel", limiter, robots, transport=transport)
    )
    assert not res_disallowed.reachable
    assert res_disallowed.reason == "robots_disallowed"

    # SSRF on redirect hop
    res_ssrf = asyncio.run(
        check_site_availability("https://public-example.com/redir", limiter, robots, transport=transport)
    )
    assert not res_ssrf.reachable
    assert res_ssrf.reason == "ssrf_blocked_ip"


def test_rate_limiter_enforces_interval() -> None:
    limiter = DomainRateLimiter(rps=5.0)  # 0.2s min interval

    async def run() -> float:
        t0 = time.monotonic()
        await limiter.wait_turn("slow.example.com")
        await limiter.wait_turn("slow.example.com")
        return time.monotonic() - t0

    elapsed = asyncio.run(run())
    assert elapsed >= 0.18


def test_openstreetmap_overpass_discovery_with_mock_transport() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "nominatim.openstreetmap.org" in str(request.url):
            return httpx.Response(200, json=[{"boundingbox": ["50.35", "50.55", "30.35", "30.70"]}])
        if "overpass-api.de" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "elements": [
                        {"tags": {"name": "Стоматологія Смайл", "website": "https://www.smile-kyiv.ua/home"}},
                        {"tags": {"name": "Клініка Дент", "contact:website": "dent-pro.com.ua"}},
                        {"tags": {"name": "Без сайту"}},
                    ]
                },
            )
        return httpx.Response(404)

    source = OpenStreetMapOverpassSource(
        niche="стоматологія",
        region="Київ",
        language="uk",
        transport=httpx.MockTransport(handler),
    )
    results = asyncio.run(source.discover(limit=10))
    assert len(results) == 2
    assert results[0].domain == "smile-kyiv.ua"
    assert results[0].business_name == "Стоматологія Смайл"
    assert results[0].source == "OpenStreetMap"
    assert results[1].domain == "dent-pro.com.ua"
    assert results[1].url == "https://dent-pro.com.ua"


def test_openstreetmap_nominatim_extratags_succeeds_if_overpass_times_out() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "nominatim.openstreetmap.org" in url and "extratags=1" in url:
            return httpx.Response(
                200,
                json=[
                    {
                        "place_id": 101,
                        "name": "Кав'ярня Зерно",
                        "extratags": {"website": "https://zerno.lviv.ua/"},
                    },
                    {
                        "place_id": 102,
                        "name": "Instagram Only",
                        "extratags": {"website": "https://www.instagram.com/only_ig/"},
                    },
                ],
            )
        if "nominatim.openstreetmap.org" in url:
            return httpx.Response(200, json=[{"boundingbox": ["49.76", "49.90", "23.90", "24.12"]}])
        if "overpass-api.de" in url:
            raise httpx.ReadTimeout("Overpass timeout")
        return httpx.Response(404)

    source = OpenStreetMapOverpassSource(
        niche="кав'ярня",
        region="Львів",
        language="uk",
        transport=httpx.MockTransport(handler),
    )
    results = asyncio.run(source.discover(limit=5))
    assert len(results) == 1
    assert results[0].domain == "zerno.lviv.ua"
    assert results[0].business_name == "Кав'ярня Зерно"


