import re
from datetime import datetime, timezone
from typing import Any

from bs4 import BeautifulSoup

from audit.checks.security import detect_frontend_libraries, parse_version_tuple
from common.schemas import CheckResultStatus, EvidenceItem, FindingResult

# EOL / outdated thresholds for TECH-01
PLATFORM_THRESHOLDS: dict[str, tuple[tuple[int, ...], tuple[int, ...], str]] = {
    # name: (eol_below, warning_below, label)
    "wordpress": ((6, 0, 0), (6, 5, 0), "WordPress"),
    "joomla": ((4, 0, 0), (5, 0, 0), "Joomla"),
    "drupal": ((9, 0, 0), (10, 2, 0), "Drupal"),
    "opencart": ((3, 0, 0), (4, 0, 0), "OpenCart"),
    "jquery": ((2, 0, 0), (3, 6, 0), "jQuery"),
    "bootstrap": ((4, 0, 0), (5, 0, 0), "Bootstrap"),
}

_COPYRIGHT_RE = re.compile(r"(?:©|&copy;|copyright|\(c\))\s*(?:20\d{2}\s*[-–—]\s*)?(20\d{2})", re.IGNORECASE)
_YEAR_IN_FOOTER_RE = re.compile(r"\b(20\d{2})\b")


def evaluate_technology_checks(
    html: str,
    checks_by_id: dict[str, dict[str, Any]],
    current_year: int | None = None,
    detected_tech: dict[str, str] | None = None,
) -> list[FindingResult]:
    """Evaluate TECH-01 (outdated CMS/framework) and TECH-02 (copyright year)."""
    now_year = current_year or datetime.now(timezone.utc).year
    libs = detected_tech if detected_tech is not None else detect_frontend_libraries(html)
    findings: list[FindingResult] = []

    # TECH-01
    eol_hits: list[str] = []
    older_hits: list[str] = []
    for name, ver_str in libs.items():
        rule = PLATFORM_THRESHOLDS.get(name.lower())
        ver = parse_version_tuple(ver_str)
        if not rule or not ver:
            continue
        eol_ver, warn_ver, label = rule
        if ver < eol_ver:
            eol_hits.append(f"{label} {ver_str}")
        elif ver < warn_ver:
            older_hits.append(f"{label} {ver_str}")

    if eol_hits:
        t1_res, t1_val = CheckResultStatus.FAIL, f"кінець підтримки: {', '.join(eol_hits)}"
    elif older_hits:
        t1_res, t1_val = CheckResultStatus.WARNING, f"старша версія: {', '.join(older_hits)}"
    else:
        t1_res, t1_val = CheckResultStatus.PASS, "актуальні або не виявлено застарілих"

    findings.append(
        FindingResult(
            check_id="TECH-01",
            category=checks_by_id["TECH-01"]["category"],
            result=t1_res,
            value=t1_val,
            impact=int(checks_by_id["TECH-01"]["impact"]),
            effort=int(checks_by_id["TECH-01"]["effort"]),
            service=checks_by_id["TECH-01"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=t1_val)],
        )
    )

    # TECH-02: Copyright year
    soup = BeautifulSoup(html, "lxml")
    footer = soup.find("footer")
    footer_text = footer.get_text(" ", strip=True) if footer else ""
    full_text = soup.get_text(" ", strip=True)

    years: list[int] = [int(y) for y in _COPYRIGHT_RE.findall(full_text) if 2000 <= int(y) <= now_year + 1]
    if not years and footer_text:
        years = [int(y) for y in _YEAR_IN_FOOTER_RE.findall(footer_text) if 2000 <= int(y) <= now_year + 1]

    if not years:
        t2_res = CheckResultStatus.PASS
        t2_val = "рік у copyright не вказано"
    else:
        latest_year = max(years)
        age = now_year - latest_year
        warn_age = int(checks_by_id["TECH-02"]["thresholds"].get("warning_years_old", 2))
        fail_age = int(checks_by_id["TECH-02"]["thresholds"].get("fail_years_old", 4))
        if age > fail_age:
            t2_res = CheckResultStatus.FAIL
        elif age > warn_age:
            t2_res = CheckResultStatus.WARNING
        else:
            t2_res = CheckResultStatus.PASS
        t2_val = f"{latest_year} ({age} р. тому)" if age > 0 else str(latest_year)

    findings.append(
        FindingResult(
            check_id="TECH-02",
            category=checks_by_id["TECH-02"]["category"],
            result=t2_res,
            value=t2_val,
            impact=int(checks_by_id["TECH-02"]["impact"]),
            effort=int(checks_by_id["TECH-02"]["effort"]),
            service=checks_by_id["TECH-02"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=t2_val)],
        )
    )

    return findings
