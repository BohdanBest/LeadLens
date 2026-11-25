import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from common.schemas import CheckResultStatus, EvidenceItem, FindingResult


async def run_lighthouse_mobile(url: str, timeout_seconds: float = 45.0) -> dict[str, Any] | None:
    """
    Execute Lighthouse CLI in mobile preset and return extracted LCP/CLS/TBT metrics,
    or None if Lighthouse CLI is unavailable or fails.
    """
    lighthouse_bin = shutil.which("lighthouse")
    if not lighthouse_bin:
        return None

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        report_path = Path(tmp.name)

    cmd = [
        lighthouse_bin,
        url,
        "--output=json",
        f"--output-path={report_path}",
        "--only-categories=performance",
        "--form-factor=mobile",
        "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
        "--quiet",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
        if proc.returncode != 0 or not report_path.exists():
            return None

        data = json.loads(report_path.read_text(encoding="utf-8"))
        audits = data.get("audits", {})
        return {
            "lcp_ms": audits.get("largest-contentful-paint", {}).get("numericValue"),
            "cls": audits.get("cumulative-layout-shift", {}).get("numericValue"),
            "tbt_ms": audits.get("total-blocking-time", {}).get("numericValue"),
        }
    except (asyncio.TimeoutError, OSError, json.JSONDecodeError):
        return None
    finally:
        if report_path.exists():
            report_path.unlink(missing_ok=True)


def evaluate_performance_checks(
    cwv: dict[str, Any] | None,
    page_bytes: int | None,
    large_images_over_500kb: list[dict[str, Any]] | None,
    checks_by_id: dict[str, dict[str, Any]],
) -> list[FindingResult]:
    """Evaluate PERF-01 through PERF-05."""
    findings: list[FindingResult] = []
    metrics = cwv or {}

    # PERF-01: LCP mobile (ms)
    lcp_ms = metrics.get("lcp_ms")
    if lcp_ms is None:
        findings.append(_unavailable(checks_by_id["PERF-01"]))
    else:
        val = float(lcp_ms)
        warn_ms = float(checks_by_id["PERF-01"]["thresholds"].get("warning_ms", 2500))
        fail_ms = float(checks_by_id["PERF-01"]["thresholds"].get("fail_ms", 4000))
        status = CheckResultStatus.FAIL if val > fail_ms else CheckResultStatus.WARNING if val > warn_ms else CheckResultStatus.PASS
        sec = f"{round(val / 1000.0, 2)} с"
        findings.append(
            _finding(checks_by_id["PERF-01"], status, sec, [EvidenceItem(kind="metric", metric=round(val, 1))])
        )

    # PERF-02: CLS
    cls_val = metrics.get("cls")
    if cls_val is None:
        findings.append(_unavailable(checks_by_id["PERF-02"]))
    else:
        val = float(cls_val)
        warn = float(checks_by_id["PERF-02"]["thresholds"].get("warning", 0.1))
        fail = float(checks_by_id["PERF-02"]["thresholds"].get("fail", 0.25))
        status = CheckResultStatus.FAIL if val > fail else CheckResultStatus.WARNING if val > warn else CheckResultStatus.PASS
        formatted = f"{round(val, 3)}"
        findings.append(
            _finding(checks_by_id["PERF-02"], status, formatted, [EvidenceItem(kind="metric", metric=round(val, 4))])
        )

    # PERF-03: TBT (ms)
    tbt_ms = metrics.get("tbt_ms")
    if tbt_ms is None:
        findings.append(_unavailable(checks_by_id["PERF-03"]))
    else:
        val = float(tbt_ms)
        warn_ms = float(checks_by_id["PERF-03"]["thresholds"].get("warning_ms", 200))
        fail_ms = float(checks_by_id["PERF-03"]["thresholds"].get("fail_ms", 600))
        status = CheckResultStatus.FAIL if val > fail_ms else CheckResultStatus.WARNING if val > warn_ms else CheckResultStatus.PASS
        formatted = f"{int(round(val))} мс"
        findings.append(
            _finding(checks_by_id["PERF-03"], status, formatted, [EvidenceItem(kind="metric", metric=int(round(val)))])
        )

    # PERF-04: Homepage total weight
    if page_bytes is None:
        findings.append(_unavailable(checks_by_id["PERF-04"]))
    else:
        mb = page_bytes / (1024.0 * 1024.0)
        warn_mb = float(checks_by_id["PERF-04"]["thresholds"].get("warning_mb", 3.0))
        fail_mb = float(checks_by_id["PERF-04"]["thresholds"].get("fail_mb", 6.0))
        status = CheckResultStatus.FAIL if mb > fail_mb else CheckResultStatus.WARNING if mb > warn_mb else CheckResultStatus.PASS
        formatted = f"{round(mb, 2)} МБ"
        findings.append(
            _finding(checks_by_id["PERF-04"], status, formatted, [EvidenceItem(kind="metric", metric=round(mb, 3))])
        )

    # PERF-05: Uncompressed large images > 500 KB
    if large_images_over_500kb is None:
        findings.append(_unavailable(checks_by_id["PERF-05"]))
    else:
        cnt = len(large_images_over_500kb)
        fail_cnt = int(checks_by_id["PERF-05"]["thresholds"].get("fail_count", 5))
        status = CheckResultStatus.FAIL if cnt > fail_cnt else CheckResultStatus.WARNING if cnt >= 1 else CheckResultStatus.PASS
        val_str = f"{cnt} зображень > 500 КБ" if cnt > 0 else "відсутні"
        ev = [EvidenceItem(kind="metric", metric=cnt)]
        if cnt > 0:
            sample = "\n".join(f"{img.get('url', '')[:100]} ({img.get('kb', 0)} KB)" for img in large_images_over_500kb[:3])
            ev.append(EvidenceItem(kind="html_snippet", snippet=sample))
        findings.append(_finding(checks_by_id["PERF-05"], status, val_str, ev))

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
