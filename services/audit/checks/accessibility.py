from typing import Any

from bs4 import BeautifulSoup

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult


def evaluate_accessibility_checks(
    html: str,
    checks_by_id: dict[str, dict[str, Any]],
    axe_results: dict[str, Any] | None = None,
) -> list[FindingResult]:
    """
    Evaluate A11Y-01 (axe-core serious/critical), A11Y-02 (contrast), A11Y-03 (unlabeled form controls).
    Uses axe-core results when executed in Playwright, with HTML fallback for A11Y-03.
    """
    findings: list[FindingResult] = []
    soup = BeautifulSoup(html, "lxml")

    # A11Y-01 & A11Y-02 from axe-core
    if axe_results is None:
        findings.append(_unavailable(checks_by_id["A11Y-01"]))
        findings.append(_unavailable(checks_by_id["A11Y-02"]))
    else:
        violations = axe_results.get("violations", [])
        serious_or_critical = [v for v in violations if v.get("impact") in ("serious", "critical")]
        sc_count = len(serious_or_critical)
        fail_cnt = int(checks_by_id["A11Y-01"]["thresholds"].get("fail_count", 3))
        a1_status = (
            CheckResultStatus.FAIL
            if sc_count > fail_cnt
            else CheckResultStatus.WARNING
            if sc_count >= 1
            else CheckResultStatus.PASS
        )
        a1_ev = [EvidenceItem(kind="metric", metric=sc_count)]
        if serious_or_critical:
            summary = ", ".join(v.get("id", "") for v in serious_or_critical[:5])
            a1_ev.append(EvidenceItem(kind="html_snippet", snippet=summary))
        findings.append(
            _finding(
                checks_by_id["A11Y-01"],
                a1_status,
                f"{sc_count} порушень" if sc_count > 0 else "0 порушень",
                a1_ev,
            )
        )

        # A11Y-02: color-contrast nodes count from axe-core
        contrast_nodes = 0
        contrast_samples: list[str] = []
        for v in violations:
            if v.get("id") == "color-contrast":
                nodes = v.get("nodes", [])
                contrast_nodes += len(nodes)
                for n in nodes[:3]:
                    if n.get("html"):
                        contrast_samples.append(str(n["html"])[:120])

        c_fail = int(checks_by_id["A11Y-02"]["thresholds"].get("fail_count", 10))
        a2_status = (
            CheckResultStatus.FAIL
            if contrast_nodes > c_fail
            else CheckResultStatus.WARNING
            if contrast_nodes > 0
            else CheckResultStatus.PASS
        )
        a2_ev = [EvidenceItem(kind="metric", metric=contrast_nodes)]
        if contrast_samples:
            a2_ev.append(EvidenceItem(kind="html_snippet", snippet="\n".join(contrast_samples)))
        findings.append(
            _finding(
                checks_by_id["A11Y-02"],
                a2_status,
                f"{contrast_nodes} порушень" if contrast_nodes > 0 else "порушень не виявлено",
                a2_ev,
            )
        )

    # A11Y-03: Form inputs without labels
    label_fors = {lbl.get("for") for lbl in soup.find_all("label") if lbl.get("for")}
    unlabeled: list[str] = []
    for ctrl in soup.find_all(["input", "select", "textarea"]):
        if ctrl.name == "input" and (ctrl.get("type") or "text").lower() in ("hidden", "submit", "button", "reset", "image"):
            continue
        has_aria = bool((ctrl.get("aria-label") or "").strip() or (ctrl.get("aria-labelledby") or "").strip())
        has_for = bool(ctrl.get("id") and ctrl.get("id") in label_fors)
        wrapped_in_label = ctrl.find_parent("label") is not None
        if not (has_aria or has_for or wrapped_in_label):
            unlabeled.append(str(ctrl)[:120])

    a3_status = CheckResultStatus.FAIL if unlabeled else CheckResultStatus.PASS
    a3_ev = [EvidenceItem(kind="metric", metric=len(unlabeled))]
    if unlabeled:
        a3_ev.append(EvidenceItem(kind="html_snippet", snippet="\n".join(unlabeled[:3])))

    findings.append(
        _finding(
            checks_by_id["A11Y-03"],
            a3_status,
            f"{len(unlabeled)} полів без підписів" if unlabeled else "усі поля підписані",
            a3_ev,
        )
    )

    return findings


def _finding(cfg: dict[str, Any], status: CheckResultStatus, value: str, evidence: list[EvidenceItem]) -> FindingResult:
    return FindingResult(
        check_id=cfg["id"],
        category=cfg["category"],
        result=status,
        value=value,
        impact=int(cfg["impact"]),
        effort=int(cfg["effort"]),
        service=cfg["service"],
        evidence=evidence,
    )


def _unavailable(cfg: dict[str, Any]) -> FindingResult:
    return _finding(cfg, CheckResultStatus.UNAVAILABLE, "недоступно", [])
