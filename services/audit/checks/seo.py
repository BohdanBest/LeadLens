from dataclasses import dataclass
from typing import Any

from bs4 import BeautifulSoup

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult


@dataclass(frozen=True)
class PageSnapshot:
    url: str
    html: str
    headers: dict[str, str]
    status_code: int = 200
    is_homepage: bool = True


def _make_finding(
    check_cfg: dict[str, Any],
    result: CheckResultStatus,
    value: str | None,
    evidence: list[EvidenceItem],
) -> FindingResult:
    return FindingResult(
        check_id=check_cfg["id"],
        category=check_cfg["category"],
        result=result,
        value=value,
        impact=int(check_cfg["impact"]),
        effort=int(check_cfg["effort"]),
        service=check_cfg["service"],
        evidence=evidence,
    )


def evaluate_seo_checks(
    pages: list[PageSnapshot],
    sitemap_exists: bool | None,
    checks_by_id: dict[str, dict[str, Any]],
) -> list[FindingResult]:
    """Evaluate SEO-01 through SEO-06 across homepage and sampled internal pages."""
    homepage = next((p for p in pages if p.is_homepage), pages[0])
    soup = BeautifulSoup(homepage.html, "lxml")
    findings: list[FindingResult] = []

    # SEO-01: Title tag (missing, >65 chars, or duplicated across pages)
    title_el = soup.find("title")
    title_text = title_el.get_text(strip=True) if title_el else ""
    max_len = int(checks_by_id["SEO-01"]["thresholds"].get("max_length", 65))

    internal_titles = []
    for page in pages:
        if not page.is_homepage:
            psoup = BeautifulSoup(page.html, "lxml")
            pt = psoup.find("title")
            if pt and pt.get_text(strip=True):
                internal_titles.append(pt.get_text(strip=True))

    has_duplicate_title = bool(title_text and title_text in internal_titles)
    if not title_text:
        findings.append(
            _make_finding(
                checks_by_id["SEO-01"],
                CheckResultStatus.FAIL,
                "відсутній тег <title>",
                [EvidenceItem(kind="html_snippet", snippet="<head>...</head> (no <title>)")],
            )
        )
    elif len(title_text) > max_len or has_duplicate_title:
        reasons = []
        if len(title_text) > max_len:
            reasons.append(f"довжина {len(title_text)} симв. (> {max_len})")
        if has_duplicate_title:
            reasons.append("однаковий title на кількох сторінках")
        findings.append(
            _make_finding(
                checks_by_id["SEO-01"],
                CheckResultStatus.WARNING,
                ", ".join(reasons),
                [EvidenceItem(kind="html_snippet", snippet=str(title_el)[:300])],
            )
        )
    else:
        findings.append(
            _make_finding(
                checks_by_id["SEO-01"],
                CheckResultStatus.PASS,
                f"{len(title_text)} симв.",
                [EvidenceItem(kind="metric", metric=len(title_text))],
            )
        )

    # SEO-02: Meta description
    desc_el = soup.find("meta", attrs={"name": lambda v: v and v.lower() == "description"})
    desc_content = (desc_el.get("content") or "").strip() if desc_el else ""
    if not desc_content:
        findings.append(
            _make_finding(
                checks_by_id["SEO-02"],
                CheckResultStatus.FAIL,
                "відсутній",
                [EvidenceItem(kind="html_snippet", snippet='<meta name="description"> not found')],
            )
        )
    else:
        findings.append(
            _make_finding(
                checks_by_id["SEO-02"],
                CheckResultStatus.PASS,
                f"{len(desc_content)} симв.",
                [EvidenceItem(kind="metric", metric=len(desc_content))],
            )
        )

    # SEO-03: H1 count on homepage
    h1_tags = soup.find_all("h1")
    h1_count = len(h1_tags)
    if h1_count == 0:
        findings.append(
            _make_finding(
                checks_by_id["SEO-03"],
                CheckResultStatus.FAIL,
                "0 (відсутній)",
                [EvidenceItem(kind="metric", metric=0)],
            )
        )
    elif h1_count > 1:
        snippet = "\n".join(str(tag)[:120] for tag in h1_tags[:3])
        findings.append(
            _make_finding(
                checks_by_id["SEO-03"],
                CheckResultStatus.WARNING,
                f"{h1_count} тегів <h1>",
                [EvidenceItem(kind="metric", metric=h1_count), EvidenceItem(kind="html_snippet", snippet=snippet)],
            )
        )
    else:
        findings.append(
            _make_finding(
                checks_by_id["SEO-03"],
                CheckResultStatus.PASS,
                "1",
                [EvidenceItem(kind="metric", metric=1)],
            )
        )

    # SEO-04: sitemap.xml
    if sitemap_exists is None:
        findings.append(
            _make_finding(checks_by_id["SEO-04"], CheckResultStatus.UNAVAILABLE, "не вдалося перевірити", [])
        )
    elif not sitemap_exists:
        findings.append(
            _make_finding(
                checks_by_id["SEO-04"],
                CheckResultStatus.FAIL,
                "відсутній",
                [EvidenceItem(kind="metric", metric="404 /sitemap.xml")],
            )
        )
    else:
        findings.append(
            _make_finding(
                checks_by_id["SEO-04"],
                CheckResultStatus.PASS,
                "наявний",
                [EvidenceItem(kind="metric", metric="200 /sitemap.xml")],
            )
        )

    # SEO-05: Images without alt
    imgs = soup.find_all("img")
    if not imgs:
        findings.append(
            _make_finding(
                checks_by_id["SEO-05"],
                CheckResultStatus.PASS,
                "0% (зображень немає)",
                [EvidenceItem(kind="metric", metric=0)],
            )
        )
    else:
        missing_alt = [img for img in imgs if not (img.get("alt") or "").strip()]
        pct = round(100.0 * len(missing_alt) / len(imgs), 1)
        warn_pct = float(checks_by_id["SEO-05"]["thresholds"].get("warning_pct", 30))
        fail_pct = float(checks_by_id["SEO-05"]["thresholds"].get("fail_pct", 70))
        status = (
            CheckResultStatus.FAIL
            if pct > fail_pct
            else CheckResultStatus.WARNING
            if pct > warn_pct
            else CheckResultStatus.PASS
        )
        ev = [EvidenceItem(kind="metric", metric=f"{pct}% ({len(missing_alt)}/{len(imgs)})")]
        if missing_alt:
            ev.append(EvidenceItem(kind="html_snippet", snippet="\n".join(str(m)[:140] for m in missing_alt[:3])))
        findings.append(_make_finding(checks_by_id["SEO-05"], status, f"{pct}%", ev))

    # SEO-06: Structured data (JSON-LD/Microdata) + canonical
    has_schema = bool(
        soup.find("script", attrs={"type": "application/ld+json"})
        or soup.find(attrs={"itemscope": True})
    )
    has_canonical = bool(soup.find("link", attrs={"rel": lambda v: v and "canonical" in [x.lower() for x in (v if isinstance(v, list) else [v])]}))

    if has_schema and has_canonical:
        findings.append(
            _make_finding(
                checks_by_id["SEO-06"],
                CheckResultStatus.PASS,
                "наявні обидва",
                [EvidenceItem(kind="metric", metric="schema+canonical")],
            )
        )
    elif not has_schema and not has_canonical:
        findings.append(
            _make_finding(
                checks_by_id["SEO-06"],
                CheckResultStatus.FAIL,
                "немає структурованих даних та canonical",
                [EvidenceItem(kind="html_snippet", snippet="Missing application/ld+json and rel=canonical")],
            )
        )
    else:
        missing = "структуровані дані (Schema.org)" if not has_schema else "rel=canonical"
        findings.append(
            _make_finding(
                checks_by_id["SEO-06"],
                CheckResultStatus.WARNING,
                f"немає: {missing}",
                [EvidenceItem(kind="metric", metric=missing)],
            )
        )

    return findings
