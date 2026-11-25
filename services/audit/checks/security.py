import re
import socket
import ssl
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult

# Curated dictionary of common vulnerable library/CMS versions (SEC-05)
KNOWN_VULNERABLE_PREFIXES: dict[str, tuple[tuple[int, ...], str]] = {
    "jquery": ((3, 5, 0), "jQuery < 3.5.0 (XSS CVEs)"),
    "bootstrap": ((4, 3, 1), "Bootstrap < 4.3.1 (XSS CVEs)"),
    "wordpress": ((6, 4, 0), "WordPress < 6.4 (відомі вразливості)"),
    "opencart": ((3, 0, 3), "OpenCart < 3.0.3 (застарілі патчі безпеки)"),
    "joomla": ((4, 4, 0), "Joomla < 4.4 (застаріла гілка)"),
    "drupal": ((10, 0, 0), "Drupal < 10.0 (EOL / вразливості)"),
}

_VERSION_RE = re.compile(r"(\d+)\.(\d+)(?:\.(\d+))?")


def parse_version_tuple(raw: str | None) -> tuple[int, ...] | None:
    if not raw:
        return None
    m = _VERSION_RE.search(raw)
    if not m:
        return None
    major, minor = int(m.group(1)), int(m.group(2))
    patch = int(m.group(3)) if m.group(3) is not None else 0
    return (major, minor, patch)


def check_tls_days_remaining(hostname: str, port: int = 443, timeout: float = 5.0) -> int | None:
    """Return days until TLS certificate expiration (negative if expired), or None on failure."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
        not_after = cert.get("notAfter") if cert else None
        if not not_after:
            return None
        expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        return (expiry - datetime.now(timezone.utc)).days
    except ssl.SSLCertVerificationError:
        return -1
    except OSError:
        return None


def detect_frontend_libraries(html: str) -> dict[str, str]:
    """Detect common JS libraries and CMS versions from HTML markup & asset URLs."""
    detected: dict[str, str] = {}
    soup = BeautifulSoup(html, "lxml")

    gen = soup.find("meta", attrs={"name": lambda v: v and v.lower() == "generator"})
    if gen and gen.get("content"):
        content = str(gen["content"])
        for cms in ("WordPress", "Joomla", "Drupal", "OpenCart"):
            if cms.lower() in content.lower():
                v = parse_version_tuple(content)
                if v:
                    detected[cms.lower()] = ".".join(map(str, v))

    for tag in soup.find_all(["script", "link"]):
        src = (tag.get("src") or tag.get("href") or "").lower()
        if not src:
            continue
        if "jquery" in src and "jquery" not in detected:
            v = parse_version_tuple(src)
            if v:
                detected["jquery"] = ".".join(map(str, v))
        if "bootstrap" in src and "bootstrap" not in detected:
            v = parse_version_tuple(src)
            if v:
                detected["bootstrap"] = ".".join(map(str, v))

    return detected


def evaluate_security_checks(
    final_url: str,
    html: str,
    headers: dict[str, str],
    checks_by_id: dict[str, dict[str, Any]],
    tls_days_remaining: int | None = None,
    detected_tech: dict[str, str] | None = None,
) -> list[FindingResult]:
    """Evaluate SEC-01 through SEC-05."""
    parsed = urlparse(final_url)
    is_https = parsed.scheme.lower() == "https"
    lower_headers = {k.lower(): v for k, v in headers.items()}
    findings: list[FindingResult] = []

    # SEC-01: HTTPS
    findings.append(
        FindingResult(
            check_id="SEC-01",
            category=checks_by_id["SEC-01"]["category"],
            result=CheckResultStatus.PASS if is_https else CheckResultStatus.FAIL,
            value="HTTPS" if is_https else f"протокол {parsed.scheme.upper()}",
            impact=int(checks_by_id["SEC-01"]["impact"]),
            effort=int(checks_by_id["SEC-01"]["effort"]),
            service=checks_by_id["SEC-01"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=final_url)],
        )
    )

    # SEC-02: Certificate validity
    if not is_https:
        findings.append(
            FindingResult(
                check_id="SEC-02",
                category=checks_by_id["SEC-02"]["category"],
                result=CheckResultStatus.FAIL,
                value="HTTPS відсутній",
                impact=int(checks_by_id["SEC-02"]["impact"]),
                effort=int(checks_by_id["SEC-02"]["effort"]),
                service=checks_by_id["SEC-02"]["service"],
                evidence=[EvidenceItem(kind="metric", metric="no_https")],
            )
        )
    elif tls_days_remaining is None:
        findings.append(
            FindingResult(
                check_id="SEC-02",
                category=checks_by_id["SEC-02"]["category"],
                result=CheckResultStatus.UNAVAILABLE,
                value="не вдалося прочитати сертифікат",
                impact=int(checks_by_id["SEC-02"]["impact"]),
                effort=int(checks_by_id["SEC-02"]["effort"]),
                service=checks_by_id["SEC-02"]["service"],
                evidence=[],
            )
        )
    else:
        warn_days = int(checks_by_id["SEC-02"]["thresholds"].get("warning_days", 14))
        if tls_days_remaining < 0:
            sec2_res, sec2_val = CheckResultStatus.FAIL, "прострочений або невалідний"
        elif tls_days_remaining < warn_days:
            sec2_res, sec2_val = CheckResultStatus.WARNING, f"спливає через {tls_days_remaining} дн."
        else:
            sec2_res, sec2_val = CheckResultStatus.PASS, f"дійсний ще {tls_days_remaining} дн."
        findings.append(
            FindingResult(
                check_id="SEC-02",
                category=checks_by_id["SEC-02"]["category"],
                result=sec2_res,
                value=sec2_val,
                impact=int(checks_by_id["SEC-02"]["impact"]),
                effort=int(checks_by_id["SEC-02"]["effort"]),
                service=checks_by_id["SEC-02"]["service"],
                evidence=[EvidenceItem(kind="metric", metric=tls_days_remaining)],
            )
        )

    # SEC-03: Security headers (HSTS, X-Content-Type-Options, CSP)
    expected_headers = ["strict-transport-security", "x-content-type-options", "content-security-policy"]
    missing_headers = [h for h in expected_headers if h not in lower_headers]
    if len(missing_headers) == 0:
        sec3_res, sec3_val = CheckResultStatus.PASS, "усі наявні"
    elif len(missing_headers) == len(expected_headers):
        sec3_res, sec3_val = CheckResultStatus.FAIL, "відсутні всі (HSTS, X-Content-Type-Options, CSP)"
    else:
        sec3_res, sec3_val = CheckResultStatus.WARNING, f"відсутні: {', '.join(missing_headers)}"

    findings.append(
        FindingResult(
            check_id="SEC-03",
            category=checks_by_id["SEC-03"]["category"],
            result=sec3_res,
            value=sec3_val,
            impact=int(checks_by_id["SEC-03"]["impact"]),
            effort=int(checks_by_id["SEC-03"]["effort"]),
            service=checks_by_id["SEC-03"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=f"missing={len(missing_headers)}/3")],
        )
    )

    # SEC-04: Mixed content
    soup = BeautifulSoup(html, "lxml")
    http_refs: list[str] = []
    if is_https:
        for tag in soup.find_all(["script", "img", "link", "iframe", "video", "audio"]):
            attr = tag.get("src") or tag.get("href")
            if isinstance(attr, str) and attr.strip().lower().startswith("http://"):
                http_refs.append(attr.strip()[:140])

    findings.append(
        FindingResult(
            check_id="SEC-04",
            category=checks_by_id["SEC-04"]["category"],
            result=CheckResultStatus.FAIL if http_refs else CheckResultStatus.PASS,
            value=f"{len(http_refs)} HTTP-ресурсів" if http_refs else "відсутній",
            impact=int(checks_by_id["SEC-04"]["impact"]),
            effort=int(checks_by_id["SEC-04"]["effort"]),
            service=checks_by_id["SEC-04"]["service"],
            evidence=[EvidenceItem(kind="html_snippet", snippet="\n".join(http_refs[:4]))] if http_refs else [EvidenceItem(kind="metric", metric=0)],
        )
    )

    # SEC-05: Outdated libraries/CMS with known vulnerabilities
    libs = detected_tech if detected_tech is not None else detect_frontend_libraries(html)
    vulnerable_hits: list[str] = []
    for lib_name, ver_str in libs.items():
        rule = KNOWN_VULNERABLE_PREFIXES.get(lib_name.lower())
        ver_tuple = parse_version_tuple(ver_str)
        if rule and ver_tuple and ver_tuple < rule[0]:
            vulnerable_hits.append(f"{lib_name} {ver_str} ({rule[1]})")

    findings.append(
        FindingResult(
            check_id="SEC-05",
            category=checks_by_id["SEC-05"]["category"],
            result=CheckResultStatus.FAIL if vulnerable_hits else CheckResultStatus.PASS,
            value="; ".join(vulnerable_hits) if vulnerable_hits else "відомих вразливостей не виявлено",
            impact=int(checks_by_id["SEC-05"]["impact"]),
            effort=int(checks_by_id["SEC-05"]["effort"]),
            service=checks_by_id["SEC-05"]["service"],
            evidence=[EvidenceItem(kind="metric", metric="; ".join(vulnerable_hits) or "clean")],
        )
    )

    return findings
