from typing import Any

from bs4 import BeautifulSoup

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult


def evaluate_mobile_checks(
    html: str,
    checks_by_id: dict[str, dict[str, Any]],
    mobile_metrics: dict[str, Any] | None = None,
    mobile_screenshot_ref: str | None = None,
) -> list[FindingResult]:
    """
    Evaluate MOB-01..04.
    MOB-01 inspects <meta name="viewport"> in HTML; MOB-02..04 use measured Playwright 390x844 DOM metrics.
    """
    soup = BeautifulSoup(html, "lxml")
    findings: list[FindingResult] = []

    # MOB-01: meta viewport
    viewport = soup.find("meta", attrs={"name": lambda v: v and v.lower() == "viewport"})
    vp_content = (viewport.get("content") or "").strip() if viewport else ""
    if not viewport or not vp_content:
        ev = [EvidenceItem(kind="html_snippet", snippet="<head>...</head> (meta viewport missing)")]
        if mobile_screenshot_ref:
            ev.insert(0, EvidenceItem(kind="screenshot", ref=mobile_screenshot_ref))
        findings.append(
            FindingResult(
                check_id="MOB-01",
                category=checks_by_id["MOB-01"]["category"],
                result=CheckResultStatus.FAIL,
                value="meta viewport не знайдено",
                impact=int(checks_by_id["MOB-01"]["impact"]),
                effort=int(checks_by_id["MOB-01"]["effort"]),
                service=checks_by_id["MOB-01"]["service"],
                evidence=ev,
            )
        )
    else:
        findings.append(
            FindingResult(
                check_id="MOB-01",
                category=checks_by_id["MOB-01"]["category"],
                result=CheckResultStatus.PASS,
                value=vp_content,
                impact=int(checks_by_id["MOB-01"]["impact"]),
                effort=int(checks_by_id["MOB-01"]["effort"]),
                service=checks_by_id["MOB-01"]["service"],
                evidence=[EvidenceItem(kind="html_snippet", snippet=str(viewport)[:200])],
            )
        )

    # MOB-02..04 rely on live Playwright 390x844 metrics
    if mobile_metrics is None:
        for cid in ("MOB-02", "MOB-03", "MOB-04"):
            cfg = checks_by_id[cid]
            findings.append(
                FindingResult(
                    check_id=cid,
                    category=cfg["category"],
                    result=CheckResultStatus.UNAVAILABLE,
                    value="метрики браузера недоступні",
                    impact=int(cfg["impact"]),
                    effort=int(cfg["effort"]),
                    service=cfg["service"],
                    evidence=[],
                )
            )
        return findings

    # MOB-02: Horizontal overflow on 390px
    overflow_px = float(mobile_metrics.get("horizontal_overflow_px", 0))
    max_overflow = float(checks_by_id["MOB-02"]["thresholds"].get("max_overflow_px", 2))
    m2_status = CheckResultStatus.FAIL if overflow_px > max_overflow else CheckResultStatus.PASS
    m2_ev = [EvidenceItem(kind="metric", metric=f"{int(round(overflow_px))} px")]
    if m2_status == CheckResultStatus.FAIL and mobile_screenshot_ref:
        m2_ev.append(EvidenceItem(kind="screenshot", ref=mobile_screenshot_ref))
    findings.append(
        FindingResult(
            check_id="MOB-02",
            category=checks_by_id["MOB-02"]["category"],
            result=m2_status,
            value=f"+{int(round(overflow_px))} px" if overflow_px > max_overflow else "0 px",
            impact=int(checks_by_id["MOB-02"]["impact"]),
            effort=int(checks_by_id["MOB-02"]["effort"]),
            service=checks_by_id["MOB-02"]["service"],
            evidence=m2_ev,
        )
    )

    # MOB-03: Tap targets < 24x24px
    small_pct = float(mobile_metrics.get("small_tap_targets_pct", 0.0))
    warn_pct = float(checks_by_id["MOB-03"]["thresholds"].get("warning_pct", 20))
    fail_pct = float(checks_by_id["MOB-03"]["thresholds"].get("fail_pct", 50))
    m3_status = (
        CheckResultStatus.FAIL
        if small_pct > fail_pct
        else CheckResultStatus.WARNING
        if small_pct > warn_pct
        else CheckResultStatus.PASS
    )
    findings.append(
        FindingResult(
            check_id="MOB-03",
            category=checks_by_id["MOB-03"]["category"],
            result=m3_status,
            value=f"{round(small_pct, 1)}%",
            impact=int(checks_by_id["MOB-03"]["impact"]),
            effort=int(checks_by_id["MOB-03"]["effort"]),
            service=checks_by_id["MOB-03"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=f"{round(small_pct, 1)}%")],
        )
    )

    # MOB-04: Base font size on mobile
    font_px = mobile_metrics.get("body_font_size_px")
    if font_px is None:
        m4_status = CheckResultStatus.UNAVAILABLE
        m4_val = "невизначено"
    else:
        fpx = float(font_px)
        warn_px = float(checks_by_id["MOB-04"]["thresholds"].get("warning_px", 14))
        fail_px = float(checks_by_id["MOB-04"]["thresholds"].get("fail_px", 12))
        m4_status = (
            CheckResultStatus.FAIL
            if fpx < fail_px
            else CheckResultStatus.WARNING
            if fpx < warn_px
            else CheckResultStatus.PASS
        )
        m4_val = f"{round(fpx, 1)} px"

    findings.append(
        FindingResult(
            check_id="MOB-04",
            category=checks_by_id["MOB-04"]["category"],
            result=m4_status,
            value=m4_val,
            impact=int(checks_by_id["MOB-04"]["impact"]),
            effort=int(checks_by_id["MOB-04"]["effort"]),
            service=checks_by_id["MOB-04"]["service"],
            evidence=[EvidenceItem(kind="metric", metric=m4_val)],
        )
    )

    return findings
