import asyncio
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from audit.checks.accessibility import evaluate_accessibility_checks  # noqa: E402
from audit.checks.business import evaluate_business_checks  # noqa: E402
from audit.checks.contacts import extract_public_contacts  # noqa: E402
from audit.checks.integrity import check_broken_internal_links, collect_internal_links, evaluate_integrity_checks  # noqa: E402
from audit.checks.mobile import evaluate_mobile_checks  # noqa: E402
from audit.checks.perf import evaluate_performance_checks  # noqa: E402
from audit.checks.security import evaluate_security_checks  # noqa: E402
from audit.checks.seo import PageSnapshot, evaluate_seo_checks  # noqa: E402
from audit.checks.technology import evaluate_technology_checks  # noqa: E402
from common.profile_loader import load_and_validate_profile  # noqa: E402
from common.schemas import CheckResultStatus  # noqa: E402
from crawler.robots import DomainRateLimiter  # noqa: E402


def _checks_by_id() -> dict[str, dict]:
    profile = load_and_validate_profile(
        ROOT / "profiles" / "web_studio.v1.yaml",
        ROOT / "profiles" / "schema" / "service-profile.schema.json",
    )
    return {c["id"]: c for c in profile["checks"]}


def test_all_31_checks_covered_on_fixtures() -> None:
    checks = _checks_by_id()

    poor_html = """
    <html>
      <head>
        <title>Super Long Website Title That Exceeds Sixty Five Characters To Trigger Warning</title>
        <meta name="generator" content="WordPress 5.8.1">
        <script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
      </head>
      <body>
        <h1>Main</h1><h1>Second</h1>
        <img src="http://cdn.example.com/banner.jpg">
        <form><input type="text" name="phone"></form>
        <footer>Copyright 2019</footer>
      </body>
    </html>
    """

    good_html = """
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Stomatologiya Kyiv — Healthy Smile</title>
        <meta name="description" content="Modern dental clinic in Kyiv.">
        <link rel="canonical" href="https://clinic.ua/">
        <script type="application/ld+json">{"@type": "Dentist"}</script>
      </head>
      <body>
        <h1>Dental Clinic</h1>
        <img src="/hero.webp" alt="Clinic interior">
        <a href="tel:+380671234567">+380 67 123 45 67</a>
        <a href="mailto:info@clinic.ua">info@clinic.ua</a>
        <form action="/lead"><label for="p">Phone</label><input id="p" type="tel"></form>
        <section>Відгуки клієнтів та політика повернення коштів</section>
        <footer>© 2026 Clinic</footer>
      </body>
    </html>
    """

    perf_res = evaluate_performance_checks(
        {"lcp_ms": 4500, "cls": 0.30, "tbt_ms": 700},
        page_bytes=7 * 1024 * 1024,
        large_images_over_500kb=[{"url": "a.png", "kb": 800}],
        checks_by_id=checks,
    )
    assert {f.check_id: f.result for f in perf_res} == {
        "PERF-01": CheckResultStatus.FAIL,
        "PERF-02": CheckResultStatus.FAIL,
        "PERF-03": CheckResultStatus.FAIL,
        "PERF-04": CheckResultStatus.FAIL,
        "PERF-05": CheckResultStatus.WARNING,
    }

    mob_res = evaluate_mobile_checks(
        poor_html,
        checks,
        mobile_metrics={"horizontal_overflow_px": 45, "small_tap_targets_pct": 55, "body_font_size_px": 11},
        mobile_screenshot_ref="audits/1/mobile.png",
    )
    assert {f.check_id: f.result for f in mob_res} == {
        "MOB-01": CheckResultStatus.FAIL,
        "MOB-02": CheckResultStatus.FAIL,
        "MOB-03": CheckResultStatus.FAIL,
        "MOB-04": CheckResultStatus.FAIL,
    }

    seo_res = evaluate_seo_checks(
        [PageSnapshot("https://example.ua/", poor_html, {}, is_homepage=True)],
        sitemap_exists=False,
        checks_by_id=checks,
    )
    assert {f.check_id: f.result for f in seo_res} == {
        "SEO-01": CheckResultStatus.WARNING,
        "SEO-02": CheckResultStatus.FAIL,
        "SEO-03": CheckResultStatus.WARNING,
        "SEO-04": CheckResultStatus.FAIL,
        "SEO-05": CheckResultStatus.FAIL,
        "SEO-06": CheckResultStatus.FAIL,
    }

    sec_res = evaluate_security_checks(
        "https://example.ua/",
        poor_html,
        headers={"strict-transport-security": "max-age=31536000"},
        checks_by_id=checks,
        tls_days_remaining=5,
    )
    assert {f.check_id: f.result for f in sec_res} == {
        "SEC-01": CheckResultStatus.PASS,
        "SEC-02": CheckResultStatus.WARNING,
        "SEC-03": CheckResultStatus.WARNING,
        "SEC-04": CheckResultStatus.FAIL,
        "SEC-05": CheckResultStatus.FAIL,
    }

    a11y_res = evaluate_accessibility_checks(
        poor_html,
        checks,
        axe_results={
            "violations": [
                {"id": "image-alt", "impact": "serious", "nodes": [{"html": "<img>"}]},
                {"id": "color-contrast", "impact": "serious", "nodes": [{"html": "<p>x</p>"}]},
            ]
        },
    )
    assert {f.check_id: f.result for f in a11y_res} == {
        "A11Y-01": CheckResultStatus.WARNING,
        "A11Y-02": CheckResultStatus.WARNING,
        "A11Y-03": CheckResultStatus.FAIL,
    }

    tech_res = evaluate_technology_checks(poor_html, checks, current_year=2026)
    assert {f.check_id: f.result for f in tech_res} == {
        "TECH-01": CheckResultStatus.FAIL,
        "TECH-02": CheckResultStatus.FAIL,
    }

    int_res = evaluate_integrity_checks(
        broken_links=[("https://example.ua/missing", 404)],
        console_errors=["TypeError: undefined"],
        checks_by_id=checks,
    )
    assert {f.check_id: f.result for f in int_res} == {
        "INT-01": CheckResultStatus.WARNING,
        "INT-02": CheckResultStatus.WARNING,
    }

    # Non-store gets NOT_APPLICABLE on BIZ-03
    biz_non_store = evaluate_business_checks(good_html, [good_html], checks)
    assert {f.check_id: f.result for f in biz_non_store} == {
        "BIZ-01": CheckResultStatus.PASS,
        "BIZ-02": CheckResultStatus.PASS,
        "BIZ-03": CheckResultStatus.NOT_APPLICABLE,
        "BIZ-04": CheckResultStatus.PASS,
    }

    # Store missing payment & delivery gets FAIL on BIZ-03
    store_html = "<html><body><h1>Shop</h1><button>Купити</button><div>Додати в кошик</div></body></html>"
    biz_store = evaluate_business_checks(store_html, [store_html], checks)
    assert next(f for f in biz_store if f.check_id == "BIZ-03").result == CheckResultStatus.FAIL

    total_checked = len(perf_res) + len(mob_res) + len(seo_res) + len(sec_res) + len(a11y_res) + len(tech_res) + len(int_res) + len(biz_non_store)
    assert total_checked == 31

    # Contacts extraction (M8)
    contacts = extract_public_contacts([("https://clinic.ua/contacts", good_html)])
    kinds_vals = {(c.kind, c.value) for c in contacts}
    assert ("Email", "info@clinic.ua") in kinds_vals
    assert ("Phone", "+380671234567") in kinds_vals
    assert ("ContactForm", "https://clinic.ua/lead") in kinds_vals
    assert all(c.source_page == "https://clinic.ua/contacts" for c in contacts)


def test_internal_links_check_with_mock_transport(monkeypatch) -> None:
    monkeypatch.setattr("common.ssrf.default_dns_resolver", lambda _: ["93.184.216.34"])
    html = '<a href="/ok">OK</a><a href="/broken">Broken</a><a href="https://other.com/x">Ext</a>'
    links = collect_internal_links("https://clinic.ua/", html)
    assert links == ["https://clinic.ua/ok", "https://clinic.ua/broken"]

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404) if req.url.path == "/broken" else httpx.Response(200)

    broken = asyncio.run(
        check_broken_internal_links(
            links,
            rate_limiter=DomainRateLimiter(rps=100.0),
            transport=httpx.MockTransport(handler),
        )
    )
    assert broken == [("https://clinic.ua/broken", 404)]
